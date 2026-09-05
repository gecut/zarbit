import { useNavigate } from "@tanstack/react-router";
import { useCreateRequest } from "../../lib/requests";
import { RequestForm } from "./request-form";

export function NewRequest() {
  const create = useCreateRequest();
  const navigate = useNavigate();
  return <RequestForm error={create.error?.message} isPending={create.isPending} onSubmit={(input) => create.mutate(input, { onSuccess: () => navigate({ to: "/requests/active" }) })} />;
}
