import { createMarketRuntime } from "./modules/market/create-market-runtime";
import { createApp } from "./app/create-app";
import { startApplicationServer } from "./app/start-application-server";
import { createProductionDependencies } from "./app-dependencies";

const dependencies = createProductionDependencies();
const market = createMarketRuntime(dependencies.store);
const app = createApp(dependencies, market);
startApplicationServer(app, () => market.stop());
