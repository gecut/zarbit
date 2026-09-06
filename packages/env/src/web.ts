import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

declare global {
  interface ImportMetaEnv {
    readonly [key: string]: string | undefined;
    readonly VITE_API_MODE?: string;
    readonly VITE_SERVER_URL?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_API_MODE: z
      .enum(["mock", "server"])
      .default(import.meta.env.DEV ? "mock" : "server")
      .refine(
        (value) => import.meta.env.DEV || value === "server",
        "VITE_API_MODE must be server outside Vite development.",
      ),
    VITE_SERVER_URL: z
      .url()
      .optional()
      .refine((value) => {
        if (!value) return import.meta.env.DEV;
        const url = new URL(value);
        return (
          import.meta.env.MODE !== "production" ||
          (url.protocol === "https:" &&
            !["localhost", "127.0.0.1", "::1", "[::1]"].includes(url.hostname))
        );
      }, "Production VITE_SERVER_URL must be a public HTTPS API URL."),
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
});
