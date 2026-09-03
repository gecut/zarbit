import { createFileRoute } from "@tanstack/react-router";

import { Dashboard } from "../components/requests";

export const Route = createFileRoute("/")({
  component: HomeComponent,
});

function HomeComponent() { return <Dashboard />; }
