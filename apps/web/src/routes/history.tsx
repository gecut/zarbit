import { createFileRoute } from "@tanstack/react-router";
import { RequestList } from "../modules/requests";
export const Route = createFileRoute("/history")({
  component: () => <RequestList history />,
});
