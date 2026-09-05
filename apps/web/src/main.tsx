import { createRouter } from "@tanstack/react-router";
import { QueryClient } from "@tanstack/react-query";
import ReactDOM from "react-dom/client";

import { routeTree } from "./routeTree.gen";
import { AppRuntime } from "./components/app-runtime";

const queryClient = new QueryClient();

const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
  context: {},
});

export type AppRouter = typeof router;

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
  const root = ReactDOM.createRoot(rootElement);
  root.render(<AppRuntime queryClient={queryClient} router={router} />);
}
