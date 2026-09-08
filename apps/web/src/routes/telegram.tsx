import { createFileRoute } from "@tanstack/react-router";

import { TelegramPage } from "../modules/telegram";

export const Route = createFileRoute("/telegram")({
  component: TelegramPage,
});
