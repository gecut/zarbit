import { Dispatcher } from "@mtcute/dispatcher";
import { TelegramClient, SentCode } from "@mtcute/node";
import type {
  CodeDelivery,
  TelegramConnectionState,
  TelegramLifecycleEvent,
  TransportFactory,
} from "./transport";
import { rpcCode } from "./errors";
import { workerLog } from "./logger";

export const ZARBIT_CONNECTION_IDENTITY = {
  deviceModel: "Zarbit",
  systemVersion: "Zarbit Secure Trading",
  appVersion: "2.0.0",
  systemLangCode: "fa",
  langCode: "fa",
} as const;
interface MtcuteLifecycleClient {
  onConnectionState: {
    add(listener: (state: TelegramConnectionState) => void): unknown;
    remove(listener: (state: TelegramConnectionState) => void): unknown;
  };
  onError: {
    add(listener: (error: Error) => void): unknown;
    remove(listener: (error: Error) => void): unknown;
  };
  getPrimaryDcId(): Promise<number>;
}

export function observeMtcuteClient(
  client: MtcuteLifecycleClient,
  observe?: (event: TelegramLifecycleEvent) => void,
) {
  const emit = (event: TelegramLifecycleEvent) => {
    try {
      observe?.(event);
    } catch {
      // Observability must never interrupt MTProto.
    }
  };
  const onConnectionState = (state: TelegramConnectionState) => {
    emit({ type: "connection_state", state });
    if (state === "connected" || state === "updating")
      void client
        .getPrimaryDcId()
        .then((dcId) => emit({ type: "connection_dc", dcId }))
        .catch((error: unknown) =>
          emit({ type: "client_error", source: "primary_dc_lookup", error }),
        );
  };
  const onError = (error: Error) =>
    emit({ type: "client_error", source: "mtcute", error });
  client.onConnectionState.add(onConnectionState);
  client.onError.add(onError);
  return () => {
    client.onConnectionState.remove(onConnectionState);
    client.onError.remove(onError);
  };
}

const delivery = (value: SentCode): CodeDelivery => ({
  type: value.type,
  hash: value.phoneCodeHash,
  length: value.length || null,
  timeout: value.timeout,
  canResend: value.nextType !== "none",
});

export function mtcuteFactory(config: {
  apiId: number;
  apiHash: string;
  groupId: number;
}): TransportFactory {
  return (storage, observe) => {
    // Disable automatic RPC retries so Telegram operations stay explicitly controlled.
    const client = new TelegramClient({
      apiId: config.apiId,
      apiHash: config.apiHash,
      storage,
      initConnectionOptions: ZARBIT_CONNECTION_IDENTITY,
      network: { middlewares: [] },
      logLevel: 0,
    });
    const dispatcher = Dispatcher.for(client);
    const stopObserving = observeMtcuteClient(client, observe);
    let peerLoaded = false;
    return {
      async sendCode(phone, abortSignal) {
        const result = await client.sendCode({ phone, abortSignal });
        return result instanceof SentCode
          ? { code: delivery(result) }
          : { account: { id: String(result.id) } };
      },
      async resendCode(phone, phoneCodeHash, abortSignal) {
        return {
          code: delivery(
            await client.resendCode({ phone, phoneCodeHash, abortSignal }),
          ),
        };
      },
      async signIn(phone, phoneCodeHash, phoneCode, abortSignal) {
        return {
          id: String(
            (
              await client.signIn({
                phone,
                phoneCodeHash,
                phoneCode,
                abortSignal,
              })
            ).id,
          ),
        };
      },
      async password(password, abortSignal) {
        return {
          id: String(
            (await client.checkPassword({ password, abortSignal })).id,
          ),
        };
      },
      async getMe() {
        await client.connect();
        return { id: String((await client.getMe()).id) };
      },
      async membership() {
        if (!peerLoaded) {
          // Dialogs populate the private group's access hash, including archived chats.
          for (const archived of ["exclude", "only"] as const) {
            for await (const dialog of client.iterDialogs({ archived })) {
              if (dialog.peer.id === config.groupId) {
                peerLoaded = true;
                break;
              }
            }
            if (peerLoaded) break;
          }
          if (!peerLoaded) return false;
        }
        try {
          const member = await client.getChatMember({
            chatId: config.groupId,
            userId: "self",
          });
          return (
            member !== null &&
            member.status !== "left" &&
            member.status !== "banned" &&
            (member.status !== "restricted" || member.isMember)
          );
        } catch (error) {
          if (
            ["USER_NOT_PARTICIPANT", "CHANNEL_PRIVATE"].includes(
              rpcCode(error) ?? "",
            )
          ) {
            peerLoaded = false;
            return false;
          }
          throw error;
        }
      },
      async subscribe(handler, onMutation) {
        dispatcher.onNewMessage((message) => {
          workerLog.debug("telegram.message.observed", {
            chatId: message.chat.id,
            senderId: String(message.sender.id),
            messageId: message.id,
          });
          const replyToMsgId =
            message.replyToMessage?.id ??
            (message.raw._ === "message" &&
            message.raw.replyTo?._ === "messageReplyHeader"
              ? (message.raw.replyTo.replyToMsgId ?? null)
              : null);

          let replyToSenderId: string | null = null;
          const replySender = message.replyToMessage?.sender;
          if (
            replySender &&
            "id" in replySender &&
            replySender.id !== undefined
          ) {
            replyToSenderId = String(replySender.id);
          }

          handler({
            chatId: message.chat.id,
            senderId: String(message.sender.id),
            messageId: message.id,
            text: message.text,
            date: message.date,
            replyToMessageId: replyToMsgId ?? null,
            replyToSenderId,
          });
        });
        dispatcher.onEditMessage((message) => {
          onMutation?.({
            kind: "EDIT",
            event: {
              chatId: message.chat.id,
              senderId: String(message.sender.id),
              messageId: message.id,
              text: message.text,
              date: message.date,
            },
          });
        });
        dispatcher.onDeleteMessage((update) => {
          if (update.channelId === null) return;
          for (const messageId of update.messageIds) {
            onMutation?.({
              kind: "DELETE",
              chatId: update.channelId,
              messageId,
            });
          }
        });
        try {
          await client.startUpdatesLoop();
        } catch (error) {
          dispatcher.removeUpdateHandler("all");
          throw error;
        }
        return () => {
          dispatcher.removeUpdateHandler("all");
          void client.stopUpdatesLoop();
        };
      },
      async latestMessageId(chatId) {
        const messages = await client.getHistory(chatId, { limit: 1 });
        return messages[0]?.id ?? 0;
      },
      async history(chatId, afterMessageId, beforeMessageId) {
        const messages = [];
        for await (const message of client.iterHistory(chatId, {
          offset: beforeMessageId
            ? { id: beforeMessageId, date: 0 }
            : undefined,
          minId: afterMessageId,
          maxId: beforeMessageId,
          limit: 10_001,
        })) {
          if (messages.length === 10_000)
            throw new Error("Telegram history safety limit reached");
          messages.push({
            chatId: message.chat.id,
            senderId: String(message.sender.id),
            messageId: message.id,
            text: message.text,
            date: message.date,
          });
        }
        return messages.sort((a, b) => a.messageId - b.messageId);
      },
      async sendGroup(text) {
        return (await client.sendText(config.groupId, text)).id;
      },
      async logout() {
        await client.logOut();
      },
      async close() {
        stopObserving();
        await dispatcher.destroy();
        await client.destroy();
      },
    };
  };
}
