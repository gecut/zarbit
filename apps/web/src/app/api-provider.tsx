import { env } from "@zarbit/env/web";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import type { RpcClient } from "@zarbit/contracts/rpc";
import { createRpcClient } from "../shared/api/orpc";
import { telegramInitData } from "../shared/telegram/telegram";
import { ApiContext } from "../shared/api/api-context";

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
    let disposeMock: (() => void) | undefined;
    const load = async (): Promise<RpcClient> => {
      if (
        import.meta.env.DEV &&
        new URLSearchParams(location.search).has("marketScenario")
      ) {
        const [
          { createMarketMock },
          { parseMarketScenario },
          { runMarketScenario },
        ] = await Promise.all([
          import("../dev/market/create-market-mock"),
          import("../dev/market/market-scenarios"),
          import("../dev/market/run-market-scenario"),
        ]);
        const scenario = parseMarketScenario(
          new URLSearchParams(location.search).get("marketScenario"),
        );
        const mock = createMarketMock(scenario);
        if (active) disposeMock = runMarketScenario(mock, scenario);
        return mock.client;
      }
      if (!env.VITE_SERVER_URL)
        throw new Error("نشانی سرویس برای این محیط تنظیم نشده است.");
      return createRpcClient(
        new URL("/rpc", env.VITE_SERVER_URL).href,
        telegramInitData,
      );
    };
    void load()
      .then((api) => {
        // oRPC clients are callable proxies; never pass one as a state updater.
        if (active) setClient(() => api);
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
      disposeMock?.();
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
