import { getRequestListener } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
import { createApp } from "../server/app.ts";
import {
  openDatabase,
  readConfig,
  trustedVercelSource,
} from "../server/runtime.ts";
const initialize = async () => {
  const config = readConfig(process.env);
  const connection = await openDatabase(process.env);
  const app = createApp(connection.db, config);
  app.get("/", serveStatic({ path: "./dist/client/index.html" }));
  app.get("/admin", serveStatic({ path: "./dist/client/admin.html" }));
  return app;
};
let ready: ReturnType<typeof initialize> | undefined;
const handler = getRequestListener(
  async (request) => {
    try {
      ready ??= initialize();
      return (await ready).fetch(request, {
        sourceAddress: trustedVercelSource(request),
      });
    } catch {
      return new Response(JSON.stringify({ code: "unavailable" }), {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      });
    }
  },
  {
    errorHandler: () =>
      new Response(JSON.stringify({ code: "unavailable" }), {
        status: 503,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-store",
        },
      }),
  },
);
export default handler;
