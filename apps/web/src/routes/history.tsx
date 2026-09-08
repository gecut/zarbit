import { createFileRoute } from "@tanstack/react-router";
import { RequestList } from "../components/requests";
export const Route = createFileRoute("/history")({
  component: () => <RequestList history />,
});
