import { createFileRoute } from "@tanstack/react-router";

import { QuoteDashboardCard } from "../modules/quote";
import { RequestList } from "../modules/requests";

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
