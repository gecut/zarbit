import { env } from "@zarbit/env/web";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { RpcClient } from "@zarbit/contracts/rpc";
import { createRpcClient } from "../shared/api/orpc";
import { adaptLegacyApi } from "../shared/api/legacy-adapter";
import { telegramInitData } from "../shared/telegram/telegram";
import { ApiContext } from "../shared/api/api-context";

const usesMockApi = import.meta.env.DEV && env.VITE_API_MODE === "mock";

export function ApiProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<RpcClient | null>(null);
  const [scope] = useState(() => crypto.randomUUID());
  const [error, setError] = useState<Error | null>(null);
  const context = useMemo(
    () => (client ? { client, scope } : null),
    [client, scope],
  );
  useEffect(() => {
    let active = true;
    const load = async (): Promise<RpcClient> => {
      if (usesMockApi) {
        const { createMockApi } = await import("../dev/mock-api");
        return adaptLegacyApi(createMockApi());
      }
      if (!env.VITE_SERVER_URL)
        throw new Error("نشانی سرویس برای این محیط تنظیم نشده است.");
      if (env.VITE_RPC_TRANSPORT === "legacy") {
        const { createLegacyApi } = await import("../shared/api/legacy-api");
        return adaptLegacyApi(createLegacyApi());
      }
      return createRpcClient(
        new URL("/rpc", env.VITE_SERVER_URL).href,
        telegramInitData,
      );
    };
    void load()
      .then((api) => {
        if (active) setClient(api);
      })
      .catch(() => {
        if (active)
          setError(
            new Error(
              "راه‌اندازی ارتباط با سرویس ناموفق بود؛ تنظیمات را بررسی و برنامه را تازه کنید.",
            ),
          );
      });
    return () => {
      active = false;
    };
  }, []);
  if (error)
    return (
      <p
        role="alert"
        className="border-danger-soft bg-danger-soft text-danger-soft-foreground rounded-[var(--radius-2xl)] border px-4 py-7 text-center text-sm leading-7"
      >
        {error.message}
      </p>
    );
  if (!context)
    return (
      <p
        className="border-border text-muted rounded-[var(--radius-2xl)] border border-dashed px-4 py-7 text-center text-sm leading-7"
        role="status"
      >
        در حال آماده‌سازی داده‌ها…
      </p>
    );
  return <ApiContext value={context}>{children}</ApiContext>;
}
