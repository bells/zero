import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
// @ts-expect-error build configuration executes in Node
import { fileURLToPath } from "node:url";
// @ts-expect-error build scripts execute in Node
import { resolveBuildProfile } from "./scripts/build-profile.mjs";
// @ts-expect-error process is a Node global
const profile = resolveBuildProfile(process.env.ZERO_BUILD_PROFILE);

// @ts-expect-error process is a nodejs global
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), {
    name: "zero-profile-evidence",
    generateBundle() {
      this.emitFile({
        type: "asset",
        fileName: "build-profile.json",
        source: JSON.stringify({ profile: profile.name, tools: profile.tools,
          modules: [...this.getModuleIds()].map(id => id.replaceAll("\\", "/")).filter(id => id.includes("/src/plugins/")).map(id => id.slice(id.indexOf("/src/plugins/") + 1)) }, null, 2),
      });
    },
  }],
  resolve: {
    alias: [{
      find: "./bundledPluginCatalog.full",
      replacement: fileURLToPath(new URL(`./src/appShell/bundledPluginCatalog.${profile.name}.ts`, import.meta.url)),
    }],
  },
  define: {
    "import.meta.env.VITE_ZERO_HAS_FILE": JSON.stringify(profile.tools.includes("file")),
  },
  // A late optimizer reload destroys the hidden engine's active job context.
  optimizeDeps: {
    // Website/toolchain HTML belongs to independent projects, not this desktop entry.
    entries: ["index.html"],
    include: [
      "@tauri-apps/api/core", "@tauri-apps/api/event", "@tauri-apps/api/window",
      "react", "react-dom", "react-dom/client", "react/jsx-runtime", "react/jsx-dev-runtime",
      "lucide-react", "semver/functions/satisfies.js", "semver/functions/valid.js",
      ...(profile.tools.includes("file") ? ["pdfjs-dist", "docx", "docx-preview"] : []),
    ],
  },
  // Profile bundles must never copy stale File assets prepared by a full build.
  publicDir: profile.name === "full" ? "public" : false,

  build: {
    outDir: profile.name === "full" ? "dist" : `build/frontend/${profile.name}`,
    // The manifest is consumed by the repository-owned performance gate. It is
    // build evidence only and is not loaded by the production application.
    manifest: true,
  },

  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  //
  // 1. prevent Vite from obscuring rust errors
  clearScreen: false,
  // 2. tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1421,
        }
      : undefined,
    watch: {
      // 3. tell Vite to ignore watching `src-tauri`
      ignored: ["**/src-tauri/**"],
    },
  },
}));
