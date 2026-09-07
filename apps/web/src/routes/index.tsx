import { createFileRoute } from "@tanstack/react-router";

import { LatestQuote } from "../components/latest-quote";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() {
  return <LatestQuote />;
}
