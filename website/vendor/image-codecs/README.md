# Pinned image codec build materials

`materials.zip` is a versioned build input, not an optional local cache. It
contains the independently rebuilt HEIC decoder, ten upstream source archives,
PNG/oxipng Rust sources and vendored dependencies, complete license notices,
build recipes and the recorded independent replacement evidence.
`bundle.json` pins its byte length and SHA-256, the original material manifest
hash and the decoder hash. The ZIP's own manifest indexes each material.

Normal `pnpm dev` and `pnpm build` read this bundle without network access or
`output/`. Preparation validates the bundle, every material and the existing
license/replacement requirements before atomically replacing
`public/image-codecs/`. The current public application source is refreshed from
an explicit allowlist. Browser experiments and fixtures are omitted from the
bundle; private environment files and user inputs must never be included.

To update a codec, follow `../../experiments/image-codecs/REBUILD.md` through
source acquisition, rebuild, browser replacement, dependency review and
license collection. Then run from `website/`:

```sh
pnpm package:image-codecs
pnpm test
pnpm build
```

Review the decoder and source version changes, source/license inventory,
`bundle.json` and archive together. Packaging verifies the input hashes and
uses fixed timestamps and file order for reproducibility; it never runs as
part of normal build. Commit the ZIP, lock and updated recipes together when
a commit is authorized. Do not use Git LFS: normal CI and static-site build
checkouts need the actual bytes. The source material bundle is necessarily
large; storing only the decoder would omit corresponding sources.

This preserves the existing local candidate and device acceptance boundaries.
It does not approve a public release or replace native rebuild/device tests.
