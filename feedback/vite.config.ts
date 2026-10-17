import { defineConfig } from "vite";
import { resolve } from "node:path";
export default defineConfig({
  root: "client",
  build: {
    outDir: "../dist/client",
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index: resolve("client/index.html"),
        admin: resolve("client/admin.html"),
      },
    },
  },
});
