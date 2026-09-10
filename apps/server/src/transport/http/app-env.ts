import type { Identity } from "@zarbit/contracts";

export type AppEnv = {
  Variables: {
    user: { id: string } & Identity;
  };
};
