import { openDatabase } from "../server/runtime.ts";
import { locked, purgeExpired } from "../server/database.ts";
const connection = await openDatabase(process.env);
try {
  await locked(connection.db, (tx) => purgeExpired(tx));
  console.log("Expired control records removed.");
} finally {
  await connection.close();
}
