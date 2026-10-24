import { createRequire } from "node:module";

process.env.APP_ENV = "nonprod";
process.env.NODE_ENV = "production";
process.env.SWAGGER_ENABLED = "false";

const require = createRequire(import.meta.url);
require("reflect-metadata");
const { createApplication } = require("../apps/api/dist/app-factory.js");

const application = await createApplication();
await application.init();
await application.close();
console.log(`API production artifact initialized on Node ${process.versions.node}`);
