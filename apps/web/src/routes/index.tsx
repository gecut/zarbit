import { createFileRoute } from "@tanstack/react-router";

import { QuoteDashboardCard } from "../components/latest-quote";
import { RequestList } from "../components/requests";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  return (
    <div className="grid gap-6">
      <QuoteDashboardCard />
      <RequestList />
    </div>
  );
}
