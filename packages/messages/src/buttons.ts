export type MessageButton = { text: string; url: string } | { text: string; web_app: { url: string } };
export interface MessageLinks {
  requestId?: string;
  connection?: boolean;
  groupMessageId?: number;
}

export function groupMessageUrl(groupId?: number, messageId?: number): string | undefined {
  if (!Number.isSafeInteger(groupId) || !Number.isSafeInteger(messageId) || messageId! <= 0) return;
  const id = String(groupId);
  if (!/^-100[1-9]\d*$/.test(id)) return;
  return `https://t.me/c/${id.slice(4)}/${messageId}`;
}

export function buildMessageButtons(input: MessageLinks & {
  webAppUrl?: string;
  groupId?: number;
  privateChat?: boolean;
}): { inline_keyboard: MessageButton[][] } | undefined {
  const buttons: MessageButton[] = [];
  const groupUrl = groupMessageUrl(input.groupId, input.groupMessageId);
  if (groupUrl) buttons.push({ text: "مشاهده پیام گروه", url: groupUrl });
  if (input.webAppUrl && input.privateChat !== false) {
    try {
      const url = new URL(input.webAppUrl);
      if (url.protocol === "https:" && !url.username && !url.password) {
        url.search = "";
        url.hash = "";
        const addAppButton = (pathname: string, text: string, requestId?: string) => {
          const target = new URL(url);
          target.pathname = pathname;
          if (requestId) target.searchParams.set("requestId", requestId);
          buttons.push({ text, web_app: { url: target.href } });
        };
        if (input.connection) addAppButton("/telegram", "بررسی اتصال");
        if (input.requestId) addAppButton("/history", "جزئیات درخواست", input.requestId);
        if (!input.connection && !input.requestId) addAppButton("/", "باز کردن زربیت");
      }
    } catch { /* Invalid configuration must not prevent text delivery. */ }
  }
  return buttons.length ? { inline_keyboard: [buttons.slice(0, 2)] } : undefined;
}
