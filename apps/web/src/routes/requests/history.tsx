import { createFileRoute } from "@tanstack/react-router";

import { History } from "../../components/requests";

export const Route = createFileRoute("/requests/history")({
  component: History,
});
