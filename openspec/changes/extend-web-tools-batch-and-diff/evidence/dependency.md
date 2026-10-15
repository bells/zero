# Text comparison dependency evidence

Selected `diff` (jsdiff), pinned **9.0.0**, BSD-3-Clause. No third-party runtime requests.

Official package metadata: https://registry.npmjs.org/diff/latest (fetched 2026-10-15 using the provided proxy). Returned version 9.0.0, repository https://github.com/kpdecker/jsdiff, maintainers Kevin Decker and Mark Amery, and BSD-3-Clause. Package includes TypeScript contracts and documents Unicode-code-point `diffChars`, line/token `diffArrays`, and algorithm timeouts. Runtime imports are isolated to `text-diff.ts`, loaded only by the explicit-comparison Worker.

Official repository API: https://api.github.com/repos/kpdecker/jsdiff (fetched 2026-10-15): 9,213 stars, `pushed_at=2026-10-14T17:05:50Z`, `archived=false`, license BSD-3-Clause. This is evidence of current maintenance, not a security audit.

Installed from the existing local dependency store with `pnpm add diff@9.0.0 --save-exact --offline --store-dir output/pnpm-store`; this avoided changing package scripts or the store configuration. An initial offline install using pnpm's default store failed with `ERR_PNPM_UNEXPECTED_STORE`; rerunning with the existing store succeeded. Package is already present transitively, but is now a declared direct dependency. License is copied verbatim from the package to `website/public/licenses/text-diff.txt`.

Why jsdiff: maintained and typed, with established upstream-tested Myers-style token and Unicode code-point algorithms. The tool retains its own strict UTF-8 decoding, source/result budgets, Worker lifecycle and bounded DOM rendering. No editor dependency is introduced.
