import { createQueryClient } from "../shared/api/query-client";
import ReactDOM from "react-dom/client";

import "../index.css";
import { AppRuntime } from "./app-runtime";
import { router } from "../routing/router";
import { AppErrorBoundary } from "./app-error-boundary";

const queryClient = createQueryClient();

const rootElement = document.getElementById("app");

if (!rootElement) {
  throw new Error("Root element not found");
}

if (!rootElement.innerHTML) {
  const root = ReactDOM.createRoot(rootElement);
  root.render(
    <AppErrorBoundary>
      <AppRuntime queryClient={queryClient} router={router} />
    </AppErrorBoundary>,
  );
}
