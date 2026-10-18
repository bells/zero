# Source, license and HEIC rebuild evidence

2026-10-17 follow-up. Task **1.4 complete** for the experimental candidate;
overall progress **3/40**. No public page/category, commit, push, deployment,
specification sync or archive was added by this follow-up.

## Material/provenance review

- [Source inventory](source-inventory.json): ten complete fixed source archives,
  original refs/URLs, byte lengths, SHA-256 and extracted original notices.
- [Materials inventory](license-materials-manifest.json): the assembled local
  bundle, including the seven npm candidates, original native sources, PNG's
  25 and oxipng's 65 locked Rust dependency records (including shared crates),
  complete vendor source packages, compiler/runtime notices and attribution.
  All **314 files** outside the self-referencing manifest have byte/hash records.
- [Rebuilt artifact manifest](rebuild-manifest.json): original libheif 1.23.6 /
  libde265 1.0.16 source hashes and a real Emscripten **6.0.12** build.
- [Independent replacement run](replacement-preflight.json): Chrome evidence
  linking the tested module bytes to that source build, with host/worker
  hashes unchanged and zero console/page errors.
- [Resulting experiment inventory](dependency-inventory-rebuilt.json): the
  exact candidate files and 38 browser experiment artifacts after replacement.

The material bundle lives in ignored
`website/output/image-codecs/license-materials/`. It contains corresponding
sources, GPLv3/LGPLv3 and other component notices, rebuild/application source,
the source-built decoder and the tested browser experiment. Generated binaries,
source archives, Rust vendors and toolchains are not checked into the repo.
Sources and materials were hashed and tar/gzip integrity was checked; a rerun
with an unavailable proxy passed entirely from the verified source cache.

The review includes IJG/BSD/zlib, Apache/MIT/0BSD and Unicode notices rather
than inferring all codec terms from jSquash's top-level Apache declaration.
`wasm_sync` 0.1.2's crate and Git commit omit license text despite declaring
MIT OR Apache-2.0. Its record explicitly selects Apache-2.0, retains the
original declaration, and supplies the official verbatim text. No copyright
holder/year was invented.

## Rebuild and replacement result

Sources and installed tools remain inside the website's ignored experiment
directory. No global compiler/Python/Homebrew installation was modified.
The successful build uses Emscripten 6.0.12, CMake 3.31.6 and make; only libde265
is enabled. The C/C++ and upstream post.js sources are unmodified.

Rebuilt module: **3,340,062 bytes**, SHA-256
`5c7b2c8ce7a3a9161c7ed5dd33fdd43ed4fb26b972cd331f03a4163b14ceb3ca`.

The test builds the reference host once, records every host/worker JS hash,
replaces only its independently loaded libheif file with the rebuilt module,
then checks those host hashes remain unchanged. It also rereads the served
module from local HTTP and checks its hash against the recorded source build.
This tests an actual compatible-library replacement, rather than treating a
lazy chunk or a second host build as evidence of independent replacement.

| Source fixture | First fresh worker | Second fresh worker | Decoded dimensions |
| --- | --- | --- | --- |
| Synthetic 12MP HEIC | 675.2 ms | 597.9 ms | 4032×3024 |
| Synthetic 48MP HEIC | 1659.1 ms | 1524.4 ms | 8064×6048 |

The runs verify primary image selection, full output dimensions, refusal
before application RGBA allocation under a test limit, actual HEIC worker
termination, deterministic timeout, same-origin non-root base and restrictive
CSP without unsafe-eval or COOP/COEP. Codec/PNG RGBA/ZIP checks also pass.
No late result was delivered in the cancellation observation window. These
times do not measure process peaks, persistent warm decoders or reclamation.

The LGPL route documented for the candidate is section 4(d)(1): a separately
replaceable library, original notices and full license texts, corresponding
source/recipe and permission to modify/use and reverse engineer for debugging
modified libraries. Future public integration must preserve this mechanism
and deliver the same materials; the inventory's `publicReleaseApproved` is
deliberately false.

## Findings resolved and retained

- Proxy downloads were slow/time-limited. Direct acquisition completed; the
  fetcher now has bounded streaming, separate partial files, completed-archive
  validation and digest-checked cache reuse.
- The release's old config.sub accepts `--host=wasm32`, but rejects the longer
  emscripten target. The explicit accepted cross target avoids trying to run
  a WASM configure probe as a native macOS binary.
- SDK 4.0.11 lacks libheif's three-argument val::set pointer-policy interface.
  SDK 6.0.12 has it; no pointer policy was removed to get a build.
- Symbol extraction excludes archive-member headings; the C++ link uses em++
  so the C++ runtime is included. Ambient host compiler/include flags are
  cleared. The exact recipe changes are retained in `rebuild-heic.mjs`.
- SDK 6's module factory returns a Promise. The explicit type and awaiting
  adapter support both original synchronous and rebuilt asynchronous factories.
  The failed original assumption and successful replacement rerun are retained
  in ignored review logs.
- Upstream wasm32 integer-narrowing warnings and SDK 6's WASM=0 deprecation
  remain visible in build logs. They are maintenance/safety follow-up evidence,
  not silently suppressed warnings or a claim that all containers are safe.

Reproduction and all commands are in
`website/experiments/image-codecs/REBUILD.md`. Validation completed in this
follow-up: original codec/fixture experiment; independent replacement browser
experiment; assembled-material integrity test **1/1**; website check, domain
tests **33/33**, build and SEO **9/9**. Final strict OpenSpec/whitespace/path
audits are recorded by the implementation summary.

## Remaining acceptance

[Device plan](mobile-device-plan.json) retains only iPhone 17 Pro and iOS
27.0.1 from the user's About screenshot. No screenshot, name, model/serial
number, photo library statistics or other personal fields were copied.
Safari version/UA and every device result remain unverified.

Tasks 1.2, 1.5, 1.6 and public UI work remain open: original camera files,
HEIC orientation/color/alpha/malformed cases, desktop Safari/real iPhone,
peak memory/reclamation, retained results and ZIP overhead, actual downloads
and final limits/defaults. This work does not approve a public image-tool
release or replace those checks with desktop Chrome evidence.
