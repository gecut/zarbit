import { databaseUrl } from "@zarbit/env/db";
import { createMarketRuntime } from "./modules/market/create-market-runtime";
import { createApp } from "./app/create-app";
import { startApplicationServer } from "./app/start-application-server";
import { createProductionDependencies } from "./app-dependencies";

const dependencies = createProductionDependencies();
const market = createMarketRuntime(dependencies.store, databaseUrl);
const app = createApp(dependencies, market);
await market.start();
startApplicationServer(app, () => market.stop());
