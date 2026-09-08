export interface Account {
  id: string;
}
export interface CodeDelivery {
  type: string;
  hash: string;
  length: number | null;
  timeout: number;
  canResend: boolean;
}
export type LoginResult = { account: Account } | { code: CodeDelivery };
export interface QuoteEvent {
  chatId: number;
  senderId: string;
  messageId: number;
  text: string;
  date: Date;
}
export type TelegramConnectionState =
  "offline" | "connecting" | "updating" | "connected";
export type TelegramLifecycleEvent =
  | {
      type: "connection_state";
      state: TelegramConnectionState;
    }
  | { type: "connection_dc"; dcId: number }
  | { type: "client_error"; source: string; error: unknown };
export type TelegramLifecycleObserver = (event: TelegramLifecycleEvent) => void;
export interface TelegramTransport {
  sendCode(phone: string, signal: AbortSignal): Promise<LoginResult>;
  resendCode(
    phone: string,
    hash: string,
    signal: AbortSignal,
  ): Promise<LoginResult>;
  signIn(
    phone: string,
    hash: string,
    code: string,
    signal: AbortSignal,
  ): Promise<Account>;
  password(password: string, signal: AbortSignal): Promise<Account>;
  getMe(): Promise<Account>;
  membership(): Promise<boolean>;
  subscribe(handler: (event: QuoteEvent) => void): Promise<() => void>;
  sendGroup(text: string): Promise<number>;
  logout(): Promise<void>;
  close(): Promise<void>;
}
export type TransportFactory = (
  storagePath: string,
  observe?: TelegramLifecycleObserver,
) => TelegramTransport;
