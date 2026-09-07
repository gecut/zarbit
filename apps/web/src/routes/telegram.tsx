import { createFileRoute } from "@tanstack/react-router";

import { TelegramPage } from "../components/telegram";

export const Route = createFileRoute("/telegram")({
  component: TelegramPage,
});
