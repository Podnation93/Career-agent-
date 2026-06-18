import { buildApp } from "./app.js";
import { loadEnv } from "./lib/env.js";

async function main() {
  const env = loadEnv();
  const app = await buildApp();
  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
  app.log.info(`JobPilot API listening on :${env.API_PORT}`);
}

main().catch((err) => {
  console.error("Failed to start API:", err);
  process.exit(1);
});
