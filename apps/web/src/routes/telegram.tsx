import { createFileRoute } from "@tanstack/react-router";

import { TelegramConnection } from "../components/telegram-connection";

export const Route = createFileRoute("/telegram")({
  component: TelegramConnection,
});
