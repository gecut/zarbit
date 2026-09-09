import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { ApiProvider } from "../src/app/api-provider";
import { AppErrorBoundary } from "../src/app/app-error-boundary";
import { AppErrorFallback } from "../src/app/app-error-fallback";
import { AuthGate, useIdentity } from "../src/shared/auth/auth";
import { createQueryClient } from "../src/shared/api/query-client";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import "../src/index.css";

function Identity() {
  return <p data-testid="identity">{useIdentity().telegramUserId}</p>;
}
function Broken(): never {
  throw new Error("private-error-must-not-be-rendered");
}
const params = new URLSearchParams(location.search);
const router = createRouter({
  routeTree: createRootRoute({ component: Broken }),
  history: createMemoryHistory({ initialEntries: ["/"] }),
  defaultErrorComponent: AppErrorFallback,
});
function Harness() {
  const [mounted, setMounted] = useState(true);
  const [client] = useState(createQueryClient);
  return (
    <>
      <button onClick={() => setMounted((value) => !value)}>toggle</button>
      <QueryClientProvider client={client}>
        <AppErrorBoundary>
          {params.has("broken") ? (
            <Broken />
          ) : params.has("router") ? (
            <RouterProvider router={router} />
          ) : (
            mounted && (
              <ApiProvider>
                <AuthGate>
                  <Identity />
                </AuthGate>
              </ApiProvider>
            )
          )}
        </AppErrorBoundary>
      </QueryClientProvider>
    </>
  );
}
const root = createRoot(document.getElementById("app")!);
root.render(
  params.has("strict") ? (
    <StrictMode>
      <Harness />
    </StrictMode>
  ) : (
    <Harness />
  ),
);
