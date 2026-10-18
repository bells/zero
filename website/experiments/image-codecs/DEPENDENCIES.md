# Candidate distribution review

Reviewed on 2026-10-17. Source/license/rebuild materials for the experimental
candidate are assembled and independently checked. Public release approval is
still false: no public image-tool pages or real iPhone acceptance exist.

## Fixed components and provenance

| Component | Fixed input | Retained license/source material |
| --- | --- | --- |
| heic-to | 1.6.6, npm gitHead 4045b8d7607e326c2b479cc424c7a60519b42dae | LGPL-3.0 npm field; package LICENSE grants version 3 or later. Installed generated binding is the comparison baseline. |
| verified HEIC decoder | libheif 1.23.6 + libde265 1.0.16, Emscripten 6.0.12 | Original corresponding sources, full GPLv3/LGPLv3 texts, pinned build recipe and independently replaceable ES module. No C/C++ patch. |
| @jsquash/jpeg | 1.6.0, gitHead 1f62015f53e28bd18b2d7c8a3ca3326577efc445 | Apache wrapper; MozJPEG 3.3.1 sources and IJG/BSD/zlib notices. |
| @jsquash/webp | 1.5.0, gitHead 8bcd212da8c2be7c9c223e8f222eb3d9574a713b | Apache wrapper; libwebp d2e245ea9e959a5a79e1db0ed2085206947e98f2 sources, BSD and PATENTS. |
| @jsquash/png | 3.1.1, gitHead b7fa9ac9ec02f224847ad23d19d115f9e296a368 | Apache wrapper, original codec notice/source, Cargo.lock and 25 vendored Rust dependencies. |
| @jsquash/oxipng | 2.3.0, gitHead 68a7201e5b4d9703bf65670fb0284d16536dd145 | Apache wrapper, MIT codec notice/source, Cargo.lock and 65 vendored Rust dependencies including optional parallel dependencies. |
| image-meta | 0.3.0 (existing website dependency) | MIT, including Pooya Parsa and image-size / Aditya Yadav attribution; no runtime dependencies. Full installed package source and notice included. |
| fflate | 0.8.3 | MIT source/notice in fixed package. |
| wasm-feature-detect | 1.9.0 | Apache-2.0 source/notice in fixed transitive package. |
| Emscripten runtime | 6.0.12 | Compiler/runtime, libc++/libc++abi/libunwind, musl, compiler-rt and LLVM/mimalloc notices retained conservatively. |

The independent website lockfile fixes npm artifacts and integrity values.
`fetch-sources.mjs` records source refs, URLs, exact archive bytes and SHA-256.
It validates complete tar/gzip files and rejects a changed recorded cache.
Ten source archives are present, including the wasm_sync crate's exact Git
commit. Two additional source packages contain the original PNG/oxipng Rust
bindings and their fully vendored locked dependency trees.

All 90 Rust dependency records retain their declared license expressions,
crate checksums and notices. `unicode-ident` includes the additional Unicode
license. `wasm_sync` 0.1.2 declares MIT OR Apache-2.0, but both its crate and
Git commit omit the text. The materials explicitly select Apache-2.0, retain
its original Cargo declaration, and include the official unmodified license
from https://www.apache.org/licenses/LICENSE-2.0.txt. No author/year notice was
invented. The codec root crates have no SPDX field; their complete original
source plus the jSquash repository and codec notices are preserved.

Required attribution is included verbatim:

> This software is based in part on the work of the Independent JPEG Group.

## LGPL distribution and replacement mechanism

The selected reproducible HEIC candidate is the locally rebuilt decoder,
not an assumption that the generated npm binding is byte-identical. Only
libde265 is enabled; all other codec backends, threads and plugin loading are
explicitly disabled. The asm.js module uses no unsafe-eval. SDK 6.0.12 marks
WASM=0 deprecated; retaining the pinned SDK supports this recipe, but a later
WASM migration needs separate build/CSP/behavior evidence.

The following engineering conditions are documented and verified for the
experimental distribution, with LGPL section 4(d)(1) as the chosen mechanism:

1. State that HEIC uses LGPL libheif/libde265 and retain their copyright and
   full GPL/LGPL license texts with the distribution.
2. Supply the exact library sources, recipe/tool versions, modifications to
   the upstream convenience recipe, and replacement instructions. C/C++
   sources are unmodified; wrapper adapter changes are available in source.
3. Keep the library in an independently loaded module with no host SRI/hash
   rejection of an interface-compatible modified library. The browser probe
   replaces only that module; every host/worker JS hash remains unchanged.
4. Permit modification/use and reverse engineering for debugging modified
   LGPL libraries. The accompanying notice states this permission; it does
   not relicense other components.

The actual replacement bytes are reread from the local HTTP server and
checked against the source build's SHA-256. Real 12MP/48MP HEIC, limit refusal,
termination, timeout and restrictive CSP/base tests pass with that module.
The SDK 6 factory returns a Promise; the typed adapter awaits both original
synchronous and rebuilt asynchronous factories. This is recorded as adapter
behavior, not a C++ source patch.

See [REBUILD.md](REBUILD.md) for exact commands, recipes and the independent
replacement proof. Compiler warnings are retained, including wasm32 integer
narrowing warnings and the asm.js deprecation. This evidence does not resolve
all image/container safety, color or resource questions. Synthetic HEIC irot rotations are verified; camera/Safari orientation remains pending. Both image-meta and libheif handle dimensions can reflect a maliciously underreported ispe; a mismatching-grid fixture fails decode. These guards do not bound all internal library allocations.

## Reviewable local material bundle

`collect-license-materials.mjs` assembles ignored
`website/output/image-codecs/license-materials/` with:

- Original source archives and exact notices; original/vendored Rust source.
- Npm/native/Rust/compiler license texts and required attribution.
- Experimental host source, package/lockfile and rebuild instructions.
- Rebuilt decoder, source-build manifest, browser replacement evidence and
  the exercised browser experiment.
- A per-file SHA-256 inventory, checked by `license-materials.test.mjs`.

The assembler requires matching successful build and independent replacement
proof; it cannot mark missing or failed evidence as complete. Public release
approval remains false. A future public build must use the verified decoder
and carry the same notices/source/replacement boundary. Its final asset map
must be checked again during integration; merely installing devDependencies
or creating a lazy chunk is insufficient. Device/resource acceptance remains
pending, separately from this preflight review.
