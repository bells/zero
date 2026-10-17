import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { serveStatic } from "@hono/node-server/serve-static";
const app = new Hono();
app.use(
  "/feedback-review/*",
  serveStatic({
    root: "../website/output/fixtures/feedback",
    rewriteRequestPath: (path) => path.slice("/feedback-review".length),
  }),
);
const server = serve(
  { hostname: "127.0.0.1", port: 4321, fetch: app.fetch },
  () => console.log("Isolated local website fixture ready"),
);
process.on("SIGTERM", () => {
  server.close();
});
process.on("SIGINT", () => {
  server.close();
});
