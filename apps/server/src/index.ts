import { store } from "@zarbit/db";

import { authenticateTelegramRequest } from "./auth";
import { createApp } from "./app";
import { startApplicationServer } from "./server-lifecycle";
import { workerCommand } from "./telegram-session";

export { createApp } from "./app";
export { requestDto } from "./request-dto";

export const app = createApp({
  store,
  authenticate: authenticateTelegramRequest,
  command: workerCommand,
});

export function startServer() {
  return startApplicationServer(app);
}
