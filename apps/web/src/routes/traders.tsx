import { createFileRoute } from "@tanstack/react-router";
import { TradersPage } from "../modules/traders";

export const Route = createFileRoute("/traders")({
  component: TradersPage,
});
