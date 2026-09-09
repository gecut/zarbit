import { createRouter } from "@tanstack/react-router";

import { routeTree } from "../routeTree.gen";
import { AppErrorFallback } from "../app/app-error-fallback";

export const router = createRouter({
  routeTree,
  defaultPreload: "intent",
  scrollRestoration: true,
  context: {},
  defaultErrorComponent: AppErrorFallback,
});

export type AppRouter = typeof router;

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
