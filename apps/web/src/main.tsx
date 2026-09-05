import { RouterProvider, createRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import ReactDOM from "react-dom/client";

import { routeTree } from "./routeTree.gen";
import { initializeTelegramWebApp } from "./lib/telegram";
import { applyTheme } from "./lib/theme";
import { ApiProvider } from "./lib/api-provider";

const queryClient = new QueryClient();

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
  context: {},
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("Root element not found");
}

if (!rootElement.innerHTML) {
  initializeTelegramWebApp();
  applyTheme();
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () =>
    applyTheme(),
  );
  window.Telegram?.WebApp?.onEvent?.("themeChanged", () => applyTheme());
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <QueryClientProvider client={queryClient}>
      <ApiProvider>
        <RouterProvider router={router} />
      </ApiProvider>
    </QueryClientProvider>,
  );
}
