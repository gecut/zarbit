import { createFileRoute } from "@tanstack/react-router";

import { QuoteDashboardCard } from "../components/latest-quote";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  return <QuoteDashboardCard />;
}
