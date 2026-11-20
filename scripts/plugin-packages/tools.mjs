import fs from "node:fs/promises";
import path from "node:path";
import {randomUUID} from "node:crypto";
import {fileURLToPath, pathToFileURL} from "node:url";
import JSZip from "jszip";

import {buildPluginPackage, checkPluginPackage} from "./build.mjs";

const root = fileURLToPath(new URL("../../", import.meta.url));
const sdkRoot = path.join(root, "src/sdk");
const tools = Object.freeze({
  snap: "screenshot",
  awake: "caffeine",
  paper: "bingWallpaper",
  launch: "quickLauncher",
  file: "file",
});
const maxArchiveBytes = 16 * 1024 * 1024;

function developmentManifest(manifest) {
  const id = manifest.id.replace(/^zero\./, "example.");
  const prefix = `${manifest.id}.`;
  const rename = (value) => value.startsWith(prefix) ? `${id}.${value.slice(prefix.length)}` : value;
  const contributes = {...manifest.contributes};
  contributes.views = contributes.views.map(view => ({...view, id: rename(view.id)}));
  if (contributes.commands) {
    contributes.commands = contributes.commands.map(command => ({...command, id: rename(command.id), viewId: rename(command.viewId)}));
  }
  if (contributes.keybindings) {
    contributes.keybindings = contributes.keybindings.map(binding => ({...binding, command: rename(binding.command)}));
  }
  if (contributes.statusBarItems) {
    contributes.statusBarItems = contributes.statusBarItems.map(item => ({...item, id: rename(item.id), command: rename(item.command)}));
  }
  const activationEvents = manifest.activationEvents.map(event => {
    const separator = event.indexOf(":") + 1;
    return event.slice(0, separator) + rename(event.slice(separator));
  });
  return {...manifest, id, name: id, contributes, activationEvents};
}

async function writeAtomic(output, bytes) {
  await fs.mkdir(path.dirname(output), {recursive: true});
  const temp = `${output}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, bytes, {flag: "wx"});
    await fs.rename(temp, output);
  } finally {
    await fs.rm(temp, {force: true});
  }
}

async function writeJson(output, data) {
  await writeAtomic(output, `${JSON.stringify(data, null, 2)}\n`);
}

async function buildTool(tool, outputDir) {
  const pluginRoot = path.join(root, "src/plugins", tools[tool], "package");
  const manifest = JSON.parse(await fs.readFile(path.join(pluginRoot, "manifest.json"), "utf8"));
  if (manifest.id !== `zero.${tool}`) throw new Error(`Unexpected manifest ID for ${tool}`);
  const archive = await buildPluginPackage({pluginRoot, sdkRoot, outputDir: path.join(outputDir, "archives")});
  const zip = await JSZip.loadAsync(await fs.readFile(archive.output));
  const manifestOptions = {date: zip.file("manifest.json").date, unixPermissions: 0o100644};
  const development = developmentManifest(archive.manifest);
  zip.file("manifest.json", `${JSON.stringify(development, null, 2)}\n`, manifestOptions);
  const bytes = await zip.generateAsync({
    type: "nodebuffer", platform: "UNIX", compression: "DEFLATE", compressionOptions: {level: 9},
  });
  const checked = await checkPluginPackage({bytes});
  const output = path.join(outputDir, "preview", `${development.id}-${development.version}.zplugin`);
  await writeAtomic(output, bytes);
  const report = {tool, archive, preview: {...checked, output}};
  await writeJson(path.join(outputDir, "reports", `zero.${tool}.json`), report);
  return report;
}

export async function buildTools(selection, outputDir) {
  if (selection !== "all" && !Object.hasOwn(tools, selection)) throw new Error(`Unknown tool: ${selection}`);
  const selected = selection === "all" ? Object.keys(tools) : [selection];
  const output = path.resolve(outputDir);
  const reports = [];
  for (const tool of selected) {
    reports.push(await buildTool(tool, output));
  }
  return reports;
}

async function inspectPreview(archive) {
  const stats = await fs.lstat(archive);
  if (!stats.isFile() || stats.size > maxArchiveBytes) throw new Error(`Invalid preview archive: ${path.basename(archive)}`);
  return checkPluginPackage({bytes: await fs.readFile(archive)});
}

export async function createPreviewIndex(downloadsRoot, repository, tag) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}\/[a-zA-Z0-9_.-]+$/.test(repository)
      || [".", ".."].includes(repository.split("/")[1])) throw new Error("Invalid GitHub repository");
  if (!/^plugin-preview-[1-9][0-9]*-[1-9][0-9]*$/.test(tag)) throw new Error("Invalid release tag");

  const checked = new Map();
  for await (const file of fs.glob("**/preview/*.zplugin", {cwd: downloadsRoot})) {
    const report = await inspectPreview(path.join(downloadsRoot, file));
    const {id, version} = report.manifest;
    if (!id.startsWith("example.") || !Object.hasOwn(tools, id.slice(8))
        || path.basename(file) !== `${id}-${version}.zplugin` || checked.has(id)) {
      throw new Error(`Invalid or duplicate tool preview archive: ${path.basename(file)}`);
    }
    checked.set(id, report);
  }

  const repositoryUrl = `https://github.com/${repository}`;
  const releaseUrl = `${repositoryUrl}/releases/tag/${tag}`;
  const downloadsUrl = `${repositoryUrl}/releases/download/${tag}`;
  const sourceCatalog = JSON.parse(await fs.readFile(path.join(root, "market.json"), "utf8")).catalog;
  const catalog = [];
  const plugins = [];
  for (const item of sourceCatalog) {
    const name = item.name.replace(/^zero\./, "example.");
    const report = checked.get(name);
    if (!report) throw new Error(`Missing preview archive: ${name}`);
    const {version, author, permissions, description, displayName} = report.manifest;
    catalog.push({
      ...item, name, displayName: `${displayName} (Preview)`, version,
      unavailableReason: {zh: "Core 开发预览", en: "Core development preview"},
    });
    plugins.push({
      name, version, author, description, repository: repositoryUrl, releaseUrl,
      downloadUrl: `${downloadsUrl}/${encodeURIComponent(`${name}-${version}.zplugin`)}`,
      sha256: report.sha256, permissions,
    });
  }
  if (catalog.length !== Object.keys(tools).length || catalog.length !== checked.size) {
    throw new Error("Preview catalog and built tools differ");
  }
  return {schemaVersion: 1, updatedAt: new Date().toISOString(), catalog, plugins};
}

async function main(args) {
  if (args[0] === "path" && args.length === 2 && Object.hasOwn(tools, args[1])) {
    console.log(`src/plugins/${tools[args[1]]}/package`);
    return;
  }
  if (args[0] === "build" && args.length <= 3) {
    const output = args[2] ?? path.join(root, "build/plugin-tools");
    for (const {archive, preview} of await buildTools(args[1] ?? "all", output)) {
      console.log(`${archive.sha256}  ${archive.output}\n${preview.sha256}  ${preview.output}`);
    }
    return;
  }
  if (args[0] === "index" && args.length === 5) {
    await writeJson(path.resolve(args[4]), await createPreviewIndex(path.resolve(args[1]), args[2], args[3]));
    return;
  }
  throw new Error("Usage: tools.mjs build [snap|awake|paper|launch|file|all] [output] | path <tool> | index <downloads> <owner/repo> <tag> <output>");
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
