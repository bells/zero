import {
  readFile,
  readdir,
  realpath,
  stat,
  mkdir,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import path from "node:path";
import assert from "node:assert/strict";
const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "public/everyday-notices");
const roots = [
  "qrcode",
  "qr-scanner",
  "hash-wasm",
  "sql-formatter",
  "croner",
  "cron-parser",
];
const visited = new Set(),
  records = [],
  sections = [
    "Zero everyday tools third-party notices",
    "",
    "Exact installed versions and complete distributed notices, including transitive and Node-only dependencies.",
    "Presence here does not imply a dependency is included in the browser bundle.",
    "SQL tokenizer adaptation retains upstream MIT notices in each source file.",
    "",
  ];
async function collect(base) {
  base = await realpath(base);
  if (visited.has(base)) return;
  visited.add(base);
  const pkg = JSON.parse(
    await readFile(path.join(base, "package.json"), "utf8"),
  );
  const files = (await readdir(base))
    .filter((name) => /^(licen[cs]e|notice|copying)(?:[.\-_]|$)/i.test(name))
    .sort();
  if (!files.length) {
    const readme = (await readdir(base)).find((name) =>
      /^readme(?:\.|$)/i.test(name),
    );
    assert.ok(
      readme &&
        /License|licensed under/i.test(
          await readFile(path.join(base, readme), "utf8"),
        ),
      `Missing license declaration for ${pkg.name}`,
    );
    files.push(readme, "package.json");
  }
  for (const file of files) {
    if (!(await stat(path.join(base, file))).isFile()) continue;
    const text = await readFile(path.join(base, file), "utf8");
    records.push({
      name: pkg.name,
      version: pkg.version,
      license: pkg.license,
      file,
      sha256: createHash("sha256").update(text).digest("hex"),
    });
    sections.push(
      `===== ${pkg.name} ${pkg.version} =====`,
      `https://registry.npmjs.org/${pkg.name}/-/${pkg.name.split("/").at(-1)}-${pkg.version}.tgz#package/${file}`,
      "",
      text.trimEnd(),
      "",
    );
  }
  assert.ok(files.length, `Missing license notice for ${pkg.name}`);
  for (const name of Object.keys(pkg.dependencies ?? {}).sort()) {
    let current = base,
      directory;
    while (!directory) {
      const candidate = path.join(current, "node_modules", name);
      try {
        await stat(path.join(candidate, "package.json"));
        directory = candidate;
      } catch {}
      const parent = path.dirname(current);
      if (!directory && parent === current)
        throw Error(`Cannot resolve package metadata for ${name}`);
      current = parent;
    }
    await collect(directory);
  }
}
for (const name of roots) await collect(path.join(root, "node_modules", name));
for (const algorithm of ["md5", "sha1", "sha256", "sha512"]) {
  const file = `src/${algorithm}.c`;
  const source = await readFile(
    path.join(root, "node_modules/hash-wasm", file),
    "utf8",
  );
  const header = source.match(/^\/\*[\s\S]*?\*\//)?.[0];
  assert.ok(header, `Missing embedded C notice for ${algorithm}`);
  records.push({
    name: `hash-wasm embedded ${algorithm}`,
    version: "4.13.0",
    file,
    sha256: createHash("sha256").update(header).digest("hex"),
  });
  sections.push(
    `===== hash-wasm 4.13.0 ${file} =====`,
    "https://registry.npmjs.org/hash-wasm/-/hash-wasm-4.13.0.tgz#package/" +
      file,
    "",
    header,
    "",
  );
}
const upstreamDirectory = path.join(output, "upstream");
const embedded = JSON.parse(
  await readFile(
    path.join(upstreamDirectory, "jsqr-es6-manifest.json"),
    "utf8",
  ),
);
const license = await readFile(
  path.join(upstreamDirectory, "jsqr-es6-LICENSE"),
  "utf8",
);
assert.equal(
  createHash("sha256").update(license).digest("hex"),
  embedded.licenseSha256,
);
const scannerMap = JSON.parse(
  await readFile(
    path.join(root, "node_modules/qr-scanner/qr-scanner-worker.min.js.map"),
    "utf8",
  ),
);
for (const entry of embedded.embeddedSourceMatches) {
  assert.equal(entry.exact, true);
  const index = scannerMap.sources.findIndex(
    (source) => source === "node_modules/jsqr-es6/" + entry.path,
  );
  assert.ok(index >= 0);
  assert.equal(
    createHash("sha256").update(scannerMap.sourcesContent[index]).digest("hex"),
    entry.sha256,
  );
}
records.push({
  name: embedded.package,
  version: embedded.version,
  license: embedded.license,
  source: embedded.source,
  sha256: embedded.licenseSha256,
});
sections.push(
  "===== jsqr-es6 1.4.0-1 embedded in qr-scanner =====",
  embedded.source,
  "",
  license,
  "",
);
const artifacts = {
  "THIRD-PARTY-NOTICES.txt": sections.join("\n").replace(/\r\n?/g, "\n").replace(/[ \t]+$/gm, "").trimEnd() + "\n",
  "manifest.json":
    JSON.stringify({ roots, packageCount: visited.size, records }, null, 2) +
    "\n",
};
await mkdir(output, { recursive: true });
for (const [name, text] of Object.entries(artifacts)) {
  if (process.argv.includes("--check"))
    assert.equal(
      await readFile(path.join(output, name), "utf8"),
      text,
      `${name} is stale`,
    );
  else await writeFile(path.join(output, name), text);
}
console.log(
  `Everyday dependency notices verified for ${visited.size} packages.`,
);
