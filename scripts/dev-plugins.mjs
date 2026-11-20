import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prepareFileEngine } from "./prepare-file-engine.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function pluginDevSettings(repoRoot, overlay, previewMarket = false) {
  return {
    config: {
      identifier: "com.watson.zero.plugins-dev",
      build: {
        devUrl: "http://localhost:1422",
        beforeDevCommand: "pnpm dev --host localhost --port 1422",
      },
    },
    env: {
      ZERO_BUILD_PROFILE: "core",
      ZERO_PLUGIN_WEB_DEV: "1",
      ZERO_FILE_ENGINE_DEV_ASSETS: "1",
      ZERO_DEV_HOME: path.join(repoRoot, "build", "plugin-dev", "home"),
      ZERO_PLUGIN_DEV_PUBLIC_DIR: overlay,
      ZERO_DEV_PLUGIN_MARKET: previewMarket ? "1" : "0",
    },
    cargoArgs: ["--features", "screen-capture,file-engine", "--", "--no-default-features", "--locked"],
  };
}

export async function preparePluginDevAssets(repoRoot, overlay) {
  const { build } = await import("vite");
  const outDir = path.join(overlay, "dev-file-engine");
  await build({
    configFile: path.join(repoRoot, "vite.file-engine.config.ts"),
    build: { outDir },
  });
  prepareFileEngine(repoRoot, path.join(outDir, "file-engine"));
}

async function runTauri(pnpmCli, settings) {
  const cliArgs = ["tauri", "dev", "--config", JSON.stringify(settings.config), ...settings.cargoArgs];
  const child = spawn(process.execPath, [pnpmCli, ...cliArgs], {
    cwd: root,
    env: { ...process.env, ...settings.env },
    detached: true,
    stdio: "inherit",
  });
  // The process group includes pnpm, Tauri and the Vite dev server.
  const relaySignal = (signal) => {
    if (!child.pid) return;
    try {
      process.kill(-child.pid, signal);
    } catch (error) {
      if (error.code !== "ESRCH") throw error;
    }
  };
  process.on("SIGINT", relaySignal);
  process.on("SIGTERM", relaySignal);
  try {
    return await new Promise((resolve, reject) => {
      child.once("error", reject);
      child.once("close", (code, signal) => resolve(code ?? (signal === "SIGINT" ? 130 : 1)));
    });
  } finally {
    process.off("SIGINT", relaySignal);
    process.off("SIGTERM", relaySignal);
  }
}

async function main(args) {
  if (args.includes("--help") || args.includes("-h")) {
    console.log(`Usage: pnpm dev:plugins [--preview-market]

Launch Zero Core on macOS with isolated plugin development data.
Use pnpm package:plugins to build local .zplugin archives for import.
Use --preview-market to read the GitHub CI preview catalog.`);
    return;
  }
  if (args.length && (args.length !== 1 || args[0] !== "--preview-market")) {
    throw new Error("Usage: pnpm dev:plugins [--preview-market]");
  }
  if (process.platform !== "darwin") throw new Error("Standalone plugin development requires macOS.");
  const pnpmCli = process.env.npm_execpath;
  if (!pnpmCli) throw new Error("Run this script through pnpm dev:plugins.");

  const devRoot = path.join(root, "build", "plugin-dev");
  await fs.mkdir(devRoot, { recursive: true });
  const overlay = await fs.mkdtemp(path.join(devRoot, "overlay-"));
  try {
    const settings = pluginDevSettings(root, overlay, args.length === 1);
    await fs.mkdir(settings.env.ZERO_DEV_HOME, { recursive: true });
    await preparePluginDevAssets(root, overlay);
    process.exitCode = await runTauri(pnpmCli, settings);
  } finally {
    await fs.rm(overlay, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
