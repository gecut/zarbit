export interface TelegramWebApp {
  initData: string;
  colorScheme?: "light" | "dark";
  ready(): void;
  expand(): void;
  contentSafeAreaInset?: {
    top?: number;
    right?: number;
    bottom?: number;
    left?: number;
  };
  safeAreaInset?: { top?: number; bottom?: number };
  viewportStableHeight?: number;
  onEvent?(event: string, listener: () => void): void;
  offEvent?(event: string, listener: () => void): void;
}
declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp };
  }
}
export function telegramInitData() {
  return window.Telegram?.WebApp?.initData ?? "";
}
export function initializeTelegramWebApp() {
  const app = window.Telegram?.WebApp;
  if (!app) return;
  app.ready();
  app.expand();
  const update = () => {
    const root = document.documentElement;
    root.style.setProperty(
      "--tg-safe-bottom",
      `${(app.contentSafeAreaInset?.bottom ?? 0) + (app.safeAreaInset?.bottom ?? 0)}px`,
    );
    root.style.setProperty(
      "--tg-safe-top",
      `${(app.contentSafeAreaInset?.top ?? 0) + (app.safeAreaInset?.top ?? 0)}px`,
    );
    if (app.viewportStableHeight)
      root.style.setProperty(
        "--tg-viewport-height",
        `${app.viewportStableHeight}px`,
      );
  };
  update();
  for (const event of [
    "safeAreaChanged",
    "contentSafeAreaChanged",
    "viewportChanged",
  ])
    app.onEvent?.(event, update);
}
