import { createFileRoute } from "@tanstack/react-router";

import { ActiveRequests } from "../../components/requests";

export const Route = createFileRoute("/requests/active")({ component: ActiveRequests });
