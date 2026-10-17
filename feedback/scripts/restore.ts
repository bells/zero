import { readFile, stat } from "node:fs/promises";
import { openDatabase, readConfig } from "../server/runtime.ts";
import { createModels } from "../server/waline.ts";
import { restoreBackup } from "../server/backup.ts";
if (
  process.env.FEEDBACK_ENV === "production" ||
  process.env.FEEDBACK_RESTORE_ISOLATED !== "1"
)
  throw new Error(
    "Restore is restricted to an explicitly isolated nonproduction destination",
  );
const path = process.argv[2];
if (!path)
  throw new Error(
    "Supply a private backup path outside source/static directories",
  );
if ((await stat(path)).size > 32 * 1024 * 1024)
  throw new Error("Backup exceeds the bounded restore size");
let value: unknown;
try {
  value = JSON.parse((await readFile(path)).toString("utf8"));
} catch {
  throw new Error("Invalid private backup JSON");
}
const config = readConfig(process.env);
const connection = await openDatabase(process.env);
try {
  const [owner] = await createModels(connection.db).Users.select({
    type: "administrator",
  });
  if (!owner) throw new Error("Initialize the isolated administrator first");
  await restoreBackup(connection.db, config.jwtSecret, value, owner.objectId);
  console.log(
    "Isolated feedback restore complete. Destination administrator credentials were preserved.",
  );
} finally {
  await connection.close();
}
