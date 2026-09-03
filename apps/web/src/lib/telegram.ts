export interface TelegramWebApp {
  initData: string;
  ready(): void;
  expand(): void;
  contentSafeAreaInset?: { top?: number; right?: number; bottom?: number; left?: number };
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}

export function telegramInitData(): string {
  return window.Telegram?.WebApp?.initData ?? "";
}

export function initializeTelegramWebApp() {
  const webApp = window.Telegram?.WebApp;
  if (!webApp) return;
  webApp.ready();
  webApp.expand();
  const inset = webApp.contentSafeAreaInset;
  if (inset) document.documentElement.style.setProperty("--tg-safe-bottom", `${inset.bottom ?? 0}px`);
}
