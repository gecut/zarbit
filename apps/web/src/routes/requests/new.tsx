import { createFileRoute } from "@tanstack/react-router";

import { NewRequest } from "../../components/requests";

export const Route = createFileRoute("/requests/new")({
  component: NewRequest,
});
