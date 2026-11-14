# Independent plugin package builder

This is local build infrastructure. The five bundled desktop tools have not yet migrated to this input contract. Archive success does not enable the Web runtime, verify an official publisher, approve a File engine or establish native functionality.

Use the repository's locked Node 24 / pnpm 10.33 toolchain. Install dependencies with `pnpm install --frozen-lockfile` before building. The builder never installs dependencies or executes a plugin's Vite/PostCSS config, package scripts or environment files.

```sh
node scripts/plugin-packages/build.mjs build /absolute/tool-root /absolute/public-sdk-root /absolute/output
node scripts/plugin-packages/build.mjs check /absolute/output/example.tool-1.0.0.zplugin
node --test tests/integration/pluginPackages/build.test.mjs
```

A plugin root contains `manifest.json`, `package.json`, `pnpm-lock.yaml`, the HTML `manifest.main` and its own source/assets. The manifest uses the existing Web v2 schema. Optional `background.main` names an existing `.js` source module, emitted under the same archive path. The archive has **root** `manifest.json`, HTML and assets, without an enclosing tool directory. `zero.*` is accepted as a build identity; only the host's publisher verifier may grant official identity.

The SDK root is an explicitly supplied separate directory with `package.json`, self-contained `index.ts` and optional source subpaths such as `react.tsx`. Imports use `@zero/sdk` or `@zero/sdk/react`. SDK files undergo the same transitive boundary checks and cannot reach back into `src/core`. A future published SDK distribution can adapt its entry layout explicitly; this CLI currently takes the standalone SDK source root.

```js
import { buildPluginPackage, checkPluginPackage } from './scripts/plugin-packages/build.mjs';

const result = await buildPluginPackage({
  pluginRoot, sdkRoot, outputDir,
  signal: abortController.signal,
  limits: { maxUnpackedBytes: 8 * 1024 * 1024 },
});
const inspection = await checkPluginPackage({ archivePath: result.output });
// checkPluginPackage also accepts { bytes: Buffer, signal, limits }.
// result: output, sha256, manifest, files, expandedBytes, archiveBytes,
//         sourceFiles, publisherVerified:false, releaseApproved:false.
```

The TypeScript compiler AST checks static/re-export/type-only/literal dynamic imports before Vite compiles. Local TS path aliases are resolved and checked by real path. Declared libraries are allowed only inside physical `node_modules` packages, including normal pnpm symlinks into its store; their dependencies must also be declared. Symlinks into host/peer source, native `@tauri-apps/*`, undeclared libraries, computed imports, plugin `require`, inherited tsconfig files and dynamic import globs fail. Vite's resolved runtime modules are checked too; `.d.ts` files are never substituted for a library's executable entry.

HTML/CSS asset references and `new URL(..., import.meta.url)` are checked before Vite's direct file reads. The initial supported asset syntax is deliberately conservative: local paths, quoted/unquoted HTML `src/href/poster/data`, CSS `url()` and quoted `@import`. HTML is parsed with the locked Vite distribution's bundled parse5; its actual asset-source registry is read through the TypeScript AST, with unsupported upstream layouts/filters failing closed. Encoded/escaped asset URLs, `srcset`, `imagesrcset`, asset-bearing `meta[content]`, SVG `xlink:href`, inline scripts and remote asset references are rejected; use explicit local module imports instead. The Vite parser/registry distribution paths are part of this locked build-tool dependency and require review if Vite changes its internal layout. This is a build provenance boundary, not a runtime sandbox for arbitrary JavaScript. Runtime permissions, CSP, session grants and provider checks remain required.

Defaults cap source files at 1024, aggregate source bytes at 32 MiB, expanded archive bytes at 32 MiB, compressed bytes at 16 MiB and elapsed work at 60 seconds. Options may lower these limits. Cancellation/deadline checks run during source traversal, Vite hooks, ZIP compression/decompression and before atomic output publication; synchronous compiler work yields only at those checkpoints. Failed builds remove their isolated temporary staging directory, preserve existing output and do not prepare shared test fixtures. Archive entries have fixed UTC timestamps, sorted paths and normalized modes, producing deterministic bytes under the same locked toolchain.

The lockfile's presence is required; this tool does not prove that an existing `node_modules` matches its integrity entries. That is the preceding frozen installation/CI gate's responsibility. The archive checker limits compressed and streaming expanded bytes, rejects unsafe/symlink paths and checks manifest entries. It intentionally does not replace the Rust installer's ZIP/transaction/compatibility/signature validation.
