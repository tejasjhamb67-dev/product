import { config } from "./config.js";
import { migrate } from "./db/migrate.js";
import { buildServer } from "./http/server.js";
import { startScheduler } from "./jobs/scheduler.js";

async function main(): Promise<void> {
  const cfg = config();
  await migrate();

  const app = buildServer();
  await app.listen({ port: cfg.PORT, host: "0.0.0.0" });

  startScheduler();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
