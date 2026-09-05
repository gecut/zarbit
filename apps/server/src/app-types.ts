import type { Store } from "@zarbit/db";
import type {
  Identity,
  TelegramSessionStatus,
  WorkerCommand,
} from "@zarbit/contracts";

export type AppEnv = {
  Variables: {
    user: { id: string } & Identity;
  };
};

export interface AppDependencies {
  store: Store;
  authenticate: (initData: string | undefined) => Identity;
  command: (
    id: string,
    command: WorkerCommand,
  ) => Promise<TelegramSessionStatus>;
}
