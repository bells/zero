# HEIC source, rebuild and replacement procedure

This procedure concerns the standalone experimental HEIC decoder. It does not
deploy a site or establish iPhone support. All downloads, source extractions,
toolchains, binaries and material bundles stay in ignored
`website/output/image-codecs/`.

## Fixed inputs

- libheif 1.23.6 and libde265 1.0.16; exact acquired archive hashes are in
  `sources/manifest.json` and the recorded evidence snapshot.
- Emscripten **6.0.12**, SDK release hash
  `6e9f6885cb17a3d6c8fd488a5cff730f50aba61d` (macOS ARM64 in this run).
- CMake **3.31.6**, Ninja **1.11.1.4**; native `/usr/bin/make` is used by the
  actual build. Ninja is available but is not required by the selected generator.
- Node **24.20.0**, pnpm **10.33.0** in the recorded run.

Emscripten 4.0.11 was tested and failed at libheif's three-argument
`emscripten::val::set` call: its header accepts two arguments only. No change
was made to the source binding to remove its pointer policy. Its portable
Python 3.13.3 was used to bootstrap SDK 6.0.12 because this Mac's system Python
is 3.9, below the new SDK manager's Python 3.10 minimum. This bootstrap SDK is
not the compiler used for the final decoder.

## Prepare sources and tools

From `website/`, install the website's exact locked dependencies, then run:

```sh
node experiments/image-codecs/fetch-sources.mjs
```

The acquisition script validates completed tar/gzip archives, checks an existing
cache against its manifest, writes partial downloads separately, and records
refs, byte lengths, SHA-256 and notices. The local proxy was slow in this run;
direct network acquisition completed. If needed, unset proxy environment
variables for this command or select an available proxy. An interrupted or
failed archive is not a successful source record.

Install the official SDK manager source tag `6.0.12` beneath
`output/image-codecs/toolchain/emsdk-6.0.12`. With Python 3.10+:

```sh
cd output/image-codecs/toolchain/emsdk-6.0.12
python3 emsdk.py install 6.0.12
python3 emsdk.py activate 6.0.12
```

Activation writes that SDK directory's `.emscripten`, not a global configuration.
On a Python 3.9 host, the optional portable bootstrap uses the SDK 4.0.11
manager (which supports Python 3.9); invoke the new manager with its installed
`../emsdk/python/3.13.3_64bit/bin/python3`. Do not run the shell `emsdk` wrapper
as a Python file; the Python entry is `emsdk.py`.

From `website/`, install CMake/Ninja into the local target:

```sh
python3 -m pip install --no-cache-dir --target output/image-codecs/toolchain/python cmake==3.31.6 ninja==1.11.1.4
node experiments/image-codecs/rebuild-heic.mjs
```

The rebuilder checks source archive hashes, extracts original sources, clears
ambient compiler/header flags, configures libde265 with its accepted
`--host=wasm32` target and `-O3`, and builds a static decoder. The release
archive's old `config.sub` rejects `wasm32-unknown-emscripten`; this is why the
short accepted target is explicit. Host executables are not run as WASM tests.

libheif is built with threads, plugin loading, example programs and all other
codec backends disabled. Only libde265 is enabled. The link step uses the
unmodified upstream `post.js`, explicit exported HEIF/de265 functions,
`WASM=0`, `DYNAMIC_EXECUTION=0`, `MODULARIZE`, `EXPORT_ES6`, and memory growth.
No C/C++ source patch or Homebrew `llvm-nm` rewrite is needed: the script uses
the pinned SDK's own `llvm-nm`. These are explicit recipe changes from the
upstream convenience build script, retained in `rebuild-heic.mjs`.

The output is `rebuild/libheif-rebuilt.js` plus `rebuild/build-manifest.json`.
It is a new compatible build, not a claim of byte identity to heic-to's
generated npm binding. Compiler warnings and build failures must be retained
in the build log; successful compilation alone is not browser verification.
The actual C++ link uses `em++`; SDK 6's C driver did not link the required
C++ runtime automatically. Export discovery accepts only complete identifier
names, excluding llvm-nm archive-member headers. SDK 6.0.12 deprecates WASM=0;
the fixed recipe remains exercised, and a future WASM migration is separate.

## Prove independent replacement

After compilation, from `website/`:

```sh
IMAGE_CODEC_DROP_IN_BINDING="$PWD/output/image-codecs/rebuild/libheif-rebuilt.js" node experiments/image-codecs/probe.test.mjs
```

The probe first builds the original experiment, snapshots every host/worker JS
hash, replaces only the independently loaded libheif chunk with the rebuilt
module, and asserts the host hashes remain unchanged. It then exercises real
12MP/48MP HEIC decode, limit refusal, cancellation, timeout and CSP/base paths.
It checks the served replacement bytes' SHA-256 and records
`results-rebuilt.json`. There is no runtime SRI/checksum gate rejecting a
compatible modified module; file hashes are evidence checks in the development
probe. The module's default export/interface must remain compatible.
The adapter explicitly awaits the factory: the original binding returns a
module synchronously, while the SDK 6 rebuilt binding returns a Promise.

`IMAGE_CODEC_HEIF_BINDING` is an alternative absolute local Vite alias override
for rebuilding the host against a different binding. Use one override at a
time. The drop-in test is the stronger evidence that the library can be
replaced independently of the application, relevant to LGPL section 4(d)(1).
Future public builds must preserve the replaceable boundary and accompanying
license/source materials; this experiment does not approve a future layout.

## Assemble notices and corresponding-source materials

For PNG and oxipng, vendor dependencies with each acquired codec's existing
`Cargo.lock` using `cargo vendor --locked --versioned-dirs`. Keep `CARGO_HOME`
inside `output/image-codecs/toolchain/cargo-home`. Generate offline
`cargo metadata --locked --offline --all-features --format-version 1` into
`review/png-metadata.json` and `review/oxipng-metadata.json`. The extraction
roots and vendor directories are `rebuild/png-codec` and
`rebuild/oxipng-codec`. Vendoring all features conservatively includes the
parallel codec's licenses even though this experiment runs single-threaded.

Then run:

```sh
node experiments/image-codecs/audit-dependencies.mjs
node experiments/image-codecs/collect-license-materials.mjs
```

The local `license-materials/` bundle contains exact upstream source archives,
Rust binding/dependency source packages, npm/native/Rust notices, an index of
crate licenses/checksums, the application experiment and rebuild recipes, and
the required IJG attribution. GPLv3 and LGPLv3 are included in the original
libheif/libde265 COPYING texts. The `wasm_sync` 0.1.2 source explicitly offers
MIT OR Apache-2.0 but omits license text; the bundle selects Apache-2.0, retains
its original declaration, and supplies the official Apache license verbatim.

Application terms must permit the use and reverse engineering required to
debug modified LGPL libraries. The bundle records this permission without
changing other components' licenses. It is a reviewable experimental
distribution material set. Public release, phone acceptance, codec budgets and
any later host integration remain separate verification steps.
