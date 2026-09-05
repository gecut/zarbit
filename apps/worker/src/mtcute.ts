import { Dispatcher } from "@mtcute/dispatcher";
import { TelegramClient, SentCode } from "@mtcute/node";
import type { CodeDelivery, TransportFactory } from "./transport";
import { rpcCode } from "./errors";

export const ZARBIT_CONNECTION_IDENTITY = {
  deviceModel: "Zarbit",
  systemVersion: "Zarbit Secure Trading",
  appVersion: "2.0.0",
  systemLangCode: "fa",
  langCode: "fa",
} as const;
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
  return (storage) => {
    // Disable automatic RPC retries; ambiguous trade sends must never be replayed.
    const client = new TelegramClient({
      apiId: config.apiId,
      apiHash: config.apiHash,
      storage,
      initConnectionOptions: ZARBIT_CONNECTION_IDENTITY,
      network: { middlewares: [] },
      logLevel: 0,
    });
    const dispatcher = Dispatcher.for(client);
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
            ["USER_NOT_PARTICIPANT", "CHANNEL_PRIVATE"].includes(rpcCode(error))
          ) {
            peerLoaded = false;
            return false;
          }
          throw error;
        }
      },
      async sendReply(replyTo, text) {
        return (await client.sendText(config.groupId, text, { replyTo })).id;
      },
      subscribe(handler) {
        dispatcher.onNewMessage((message) => {
          handler({
            chatId: message.chat.id,
            senderId: String(message.sender.id),
            messageId: message.id,
            text: message.text,
            date: message.date,
          });
        });
        return () => {
          dispatcher.removeUpdateHandler("all");
        };
      },
      async logout() {
        await client.logOut();
      },
      async close() {
        await client.destroy();
      },
    };
  };
}
