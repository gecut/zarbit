import { createFileRoute } from "@tanstack/react-router";
import { RequestList } from "../modules/requests";
import { parseRequestSearch } from "../modules/requests/_request-search";
export const Route = createFileRoute("/history")({
  validateSearch: parseRequestSearch,
  component: HistoryPage,
});

function HistoryPage() {
  const { requestId } = Route.useSearch();
  const navigate = Route.useNavigate();
  return <RequestList history requestId={requestId} onCloseLinkedRequest={() => {
    void navigate({ search: {}, replace: true });
  }} />;
}
