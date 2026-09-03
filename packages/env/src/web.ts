import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

declare global {
  interface ImportMetaEnv {
    readonly [key: string]: string | undefined;
    readonly VITE_SERVER_URL?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_SERVER_URL: z.url().default("http://localhost:3000"),
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
});
