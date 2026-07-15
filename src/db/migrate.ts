import { readdir, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { db, closeDb } from "./client.js";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

export async function migrate(): Promise<void> {
  const pool = db();
  await pool.query(
    `CREATE TABLE IF NOT EXISTS schema_migrations (
       name TEXT PRIMARY KEY,
       applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
     )`,
  );

  const files = (await readdir(migrationsDir)).filter((f) => f.endsWith(".sql")).sort();
  for (const file of files) {
    const { rows } = await pool.query("SELECT 1 FROM schema_migrations WHERE name = $1", [file]);
    if (rows.length > 0) continue;

    const sql = await readFile(path.join(migrationsDir, file), "utf8");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (name) VALUES ($1)", [file]);
      await client.query("COMMIT");
      console.log(`applied ${file}`);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }
}

if (process.argv[1] && process.argv[1] === fileURLToPath(import.meta.url)) {
  migrate()
    .then(() => closeDb())
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
