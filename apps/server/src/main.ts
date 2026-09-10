import { createApp } from "./app/create-app";
import { startApplicationServer } from "./app/start-application-server";
import { createProductionDependencies } from "./app-dependencies";

const dependencies = createProductionDependencies();
const app = createApp(dependencies);
startApplicationServer(app);
