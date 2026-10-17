import { readdir, readFile, mkdir, writeFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import assert from "node:assert/strict";
const files = [];
for (const file of await readdir("dist/client/assets")) {
  const bytes = await readFile(`dist/client/assets/${file}`);
  const text = bytes.toString("utf8");
  assert.doesNotMatch(
    text,
    /FEEDBACK_JWT_SECRET|FEEDBACK_SOURCE_SALT|DATABASE_URL|FEEDBACK_ADMIN_PASSWORD|SYNTHETIC_SERVER_SECRET_CANARY/,
  );
  assert.doesNotMatch(
    text,
    /localStorage|sessionStorage|document\.cookie|navigator\.sendBeacon/,
  );
  files.push({
    file,
    bytes: bytes.byteLength,
    gzip: gzipSync(bytes).byteLength,
  });
}
const gzip = files.reduce((sum, file) => sum + file.gzip, 0);
assert.ok(gzip <= 100 * 1024);
await mkdir("output", { recursive: true });
await writeFile(
  "output/client-budget.json",
  JSON.stringify({ files, totalGzip: gzip }, null, 2),
);
console.log(
  `Independent feedback assets: ${gzip} gzip bytes across ${files.length} files; no server configuration or browser persistence APIs.`,
);
