import { env } from "@zarbit/env/web";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

import { createServerApi, type ApiClient } from "./api";

const ApiContext = createContext<ApiClient | null>(null);
const usesMockApi = import.meta.env.DEV && env.VITE_API_MODE === "mock";

export function useApi(): ApiClient {
  const client = useContext(ApiContext);
  if (!client) throw new Error("API client boundary is missing");
  return client;
}

export function ApiProvider({ children }: { children: ReactNode }) {
  const [client, setClient] = useState<ApiClient | null>(() =>
    usesMockApi ? null : createServerApi(),
  );
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!usesMockApi) return;

    let active = true;
    void import("../dev/mock-api")
      .then(({ createMockApi }) => {
        if (active) setClient(createMockApi());
      })
      .catch(() => {
        if (active)
          setError(
            new Error("بارگذاری داده‌های توسعه ناموفق بود؛ برنامه را تازه کنید."),
          );
      });

    return () => {
      active = false;
    };
  }, []);

  if (error)
    return (
      <p role="alert" className="query-state query-state--error">
        {error.message}
      </p>
    );

  if (!client)
    return (
      <p className="query-state" role="status">
        در حال آماده‌سازی داده‌های توسعه…
      </p>
    );

  return <ApiContext value={client}>{children}</ApiContext>;
}
