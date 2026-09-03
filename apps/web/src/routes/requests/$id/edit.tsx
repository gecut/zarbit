import { createFileRoute } from "@tanstack/react-router";

import { EditRequest } from "../../../components/requests";

export const Route = createFileRoute("/requests/$id/edit")({ component: EditPage });

function EditPage() { return <EditRequest id={Route.useParams().id} />; }
