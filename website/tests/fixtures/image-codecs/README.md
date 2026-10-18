# Synthetic HEIC browser fixtures

These two fixtures contain generated colored quadrants, no camera originals
or personal data. `manifest.json` retains their generator, provenance, sizes
and SHA-256 from the experimental corpus. They are versioned so Linux CI can
exercise real HEIC decoding and rotation without macOS ImageIO or an ignored
`output/` cache. They are test inputs and are never copied into public assets.

To regenerate on macOS, run `pnpm experiment:images:fixtures` from `website/`,
then copy only `synthetic-12mp.heic` and `heic-rotate-1.heic` and their updated
manifest records from `output/image-codecs/fixtures/` into this directory.
The original generator and orientation mutation recipe live in
`experiments/image-codecs/`. Run `pnpm test` and `pnpm test:browser` afterwards.
