import { fileURLToPath } from "node:url";
import { closeDb } from "../db/client.js";
import { ingestDailyPrices } from "../broker/kiteHistory.js";

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  ingestDailyPrices()
    .then(() => closeDb())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
