import { useMutation, useQueryClient } from "@tanstack/react-query";
import { requestMutationOptions } from "./_request-mutation-options";
import { useApi } from "../../shared/api/api-context";
import { useIdentity } from "../../shared/auth/auth";

export function useRequestActions() {
  const api = useApi(useIdentity().telegramUserId);
  const client = useQueryClient();
  const options = requestMutationOptions(api, client);
  const create = useMutation(options.create);
  const update = useMutation(options.update);
  const cancel = useMutation(options.cancel);
  const forceSend = useMutation(options.forceSend);
  return { create, update, cancel, forceSend };
}
