import { createContext, useContext, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { Alert, Button } from "@heroui/react";
import type { Identity } from "@zarbit/contracts";
import { useApi } from "./api-provider";
import { telegramInitData } from "./telegram";
const IdentityContext = createContext<Identity | null>(null);
export function useIdentity() {
  const user = useContext(IdentityContext);
  if (!user) throw new Error("Authentication boundary is missing");
  return user;
}
export function AuthGate({ children }: { children: ReactNode }) {
  const api = useApi();
  const query = useQuery({
    queryKey: ["identity"],
    queryFn: api.authenticate,
    retry: false,
    staleTime: 60000,
    refetchOnWindowFocus: "always",
  });
  if (query.isPending)
    return (
      <p
        className="border-border text-muted rounded-[var(--radius-2xl)] border border-dashed px-4 py-7 text-center text-sm leading-7"
        role="status"
      >
        در حال بررسی دسترسی…
      </p>
    );
  if (query.error || !query.data)
    return (
      <Alert
        className="border-danger-soft bg-danger-soft text-danger-soft-foreground rounded-[var(--radius-2xl)] border px-4 py-7 text-center text-sm leading-7"
        role="alert"
        status="danger"
      >
        <h1>ورود به زربیت</h1>
        <p>{query.error?.message}</p>
        {!telegramInitData() ? (
          <p>برنامه را از بات زربیت در تلگرام باز کنید.</p>
        ) : null}
        <Button
          onPress={() => {
            void query.refetch();
          }}
        >
          تلاش دوباره
        </Button>
      </Alert>
    );
  return <IdentityContext value={query.data}>{children}</IdentityContext>;
}
