import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "./app.ts";
import { readConfig, openDatabase } from "./runtime.ts";
import { initializeDatabase } from "./database.ts";
import { createCore } from "./waline.ts";
const env = {
  ...process.env,
  FEEDBACK_ENV: process.env.FEEDBACK_ENV || "local",
};
const config = readConfig(env);
const connection = await openDatabase(env);
await initializeDatabase(connection.db);
if (env.FEEDBACK_ENV === "local" && process.env.FEEDBACK_DEMO === "1") {
  const core = createCore(connection.db, config.jwtSecret);
  if (
    (
      await connection.db.query(
        "SELECT id FROM feedback_entities WHERE kind='Users'",
      )
    ).rows.length === 0
  )
    await core.user.register(
      { email: "owner@example.invalid", password: "synthetic-demo-password" },
      { headers: {}, state: {} },
    );
}
const app = createApp(connection.db, config);
app.get("/assets/*", serveStatic({ root: "./dist/client" }));
app.get("/", serveStatic({ path: "./dist/client/index.html" }));
app.get("/admin", serveStatic({ path: "./dist/client/admin.html" }));
const server = serve(
  {
    hostname: "127.0.0.1",
    port: Number(new URL(config.origin).port || 4323),
    fetch: (request, bindings) =>
      app.fetch(request, {
        sourceAddress: bindings.incoming.socket.remoteAddress,
      }),
  },
  () => console.log("Local synthetic feedback service ready"),
);
const stop = () => {
  server.close();
  void connection.close().finally(() => process.exit(0));
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
