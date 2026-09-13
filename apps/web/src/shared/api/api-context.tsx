import { createContext, useContext, useMemo } from "react";
import type { RpcClient } from "@zarbit/contracts/rpc";
import { createRpcUtils } from "./orpc";

export const ApiContext = createContext<{
  client: RpcClient;
  scope: string;
} | null>(null);
export function useApi(userId = "auth") {
  const value = useContext(ApiContext);
  if (!value) throw new Error("API client boundary is missing");
  return useMemo(
    () => createRpcUtils(value.client, `${value.scope}:${userId}`, value.scope),
    [value.client, value.scope, userId],
  );
}
