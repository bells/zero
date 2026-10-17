import { readConfig, openDatabase } from "../server/runtime.ts";
import { initializeDatabase, locked } from "../server/database.ts";
import { createCore, createModels } from "../server/waline.ts";
const config = readConfig(process.env);
const email = process.env.FEEDBACK_ADMIN_EMAIL;
const password = process.env.FEEDBACK_ADMIN_PASSWORD;
if (!email || !password || password.length < 16)
  throw new Error(
    "Supply a private administrator email and a password of at least 16 characters",
  );
const connection = await openDatabase(process.env);
try {
  await initializeDatabase(connection.db);
  await locked(connection.db, async (tx) => {
    if ((await createModels(tx).Users.count()) !== 0)
      throw new Error("Administrator initialization is already complete");
    await createCore(tx, config.jwtSecret).user.register(
      { email, password },
      { headers: {}, state: {} },
    );
  });
  console.log(
    "Administrator initialized. Public registration remains unavailable.",
  );
} finally {
  await connection.close();
}
