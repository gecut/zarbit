import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { useEffect } from "react";

import { ApiProvider } from "./api-provider";
import { applyTheme } from "../shared/theme/theme";
import { initializeTelegramWebApp } from "../shared/telegram/telegram";
import type { AppRouter } from "../routing/router";

type AppRuntimeProps = {
  router: AppRouter;
  queryClient: import("@tanstack/react-query").QueryClient;
};

export function AppRuntime({ router, queryClient }: AppRuntimeProps) {
  useEffect(() => {
    const onSystemThemeChange = () => applyTheme();
    const app = window.Telegram?.WebApp;
    const onTelegramThemeChange = () => applyTheme();
    const cleanupTelegram = initializeTelegramWebApp();

    applyTheme();
    matchMedia("(prefers-color-scheme: dark)").addEventListener(
      "change",
      onSystemThemeChange,
    );
    app?.onEvent?.("themeChanged", onTelegramThemeChange);

    return () => {
      cleanupTelegram();
      matchMedia("(prefers-color-scheme: dark)").removeEventListener(
        "change",
        onSystemThemeChange,
      );
      app?.offEvent?.("themeChanged", onTelegramThemeChange);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <ApiProvider>
        <RouterProvider router={router} />
      </ApiProvider>
    </QueryClientProvider>
  );
}
