import { bold, escapeMarkdown } from "./format";

export type SessionNotification =
  | { type: "connected"; member: boolean }
  | { type: "membership_lost" }
  | { type: "revoked" }
  | { type: "outage" }
  | { type: "recovered" };

const message = (title: string, body: string): string =>
  `${bold(title)}\n${escapeMarkdown(body)}`;

export function formatConnectedMessage(input: { member: boolean }): string {
  return input.member
    ? message("✅ اتصال تلگرام زربیت فعال شد", "وضعیت درخواست‌های خود را در زربیت بررسی کنید.")
    : message("⚠️ عضویت گروه تأیید نشد", "ورود به تلگرام انجام شد. پس از عضویت در گروه معامله، اتصال را دوباره بررسی کنید.");
}

export function formatMembershipLostMessage(): string {
  return message("⚠️ عضویت گروه تأیید نشد", "پس از عضویت در گروه معامله، اتصال و وضعیت درخواست‌های خود را در زربیت بررسی کنید.");
}

export function formatRevokedMessage(): string {
  return message("⚠️ اتصال تلگرام زربیت باطل شد", "دوباره وارد شوید و وضعیت درخواست‌های خود را بررسی کنید.");
}

export function formatOutageMessage(): string {
  return message("⚠️ ارتباط با تلگرام برقرار نیست", "اتصال بیش از ۲ دقیقه در دسترس نیست. زربیت برای اتصال دوباره تلاش می‌کند؛ وضعیت درخواست‌های خود را بررسی کنید.");
}

export function formatRecoveredMessage(): string {
  return message("✅ اتصال تلگرام زربیت برقرار شد", "اتصال و عضویت گروه تأیید شد. وضعیت درخواست‌های خود را بررسی کنید.");
}

export function formatSessionMessage(event: SessionNotification): string {
  switch (event.type) {
    case "connected": return formatConnectedMessage(event);
    case "membership_lost": return formatMembershipLostMessage();
    case "revoked": return formatRevokedMessage();
    case "outage": return formatOutageMessage();
    case "recovered": return formatRecoveredMessage();
  }
}
