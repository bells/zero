# Verification — 2026-10-11

Evidence is local macOS Apple Silicon unless explicitly stated. No commit, push, tag, hosted workflow, Draft mutation or formal publication occurred.

## Automated checks

- Frontend: pnpm test, 362 passed.
- Default full production build and independent build-graph budget passed; historical tracked evidence was not overwritten.
- core frontend: 382,984 bytes, zero concrete tool modules. standard frontend: 493,285 bytes, 52 concrete tool modules; neither includes File modules or public/file-engine assets. Vite reports actual loaded modules in build-profile.json and build fails if exclusions leak.
- cargo fmt --check and locked cargo check passed for full/core/standard.
- Full Rust final unsandboxed serial run: 367 passed, 2 ignored. Core and standard build_profiles integration: 2 passed each (clean seed, preserve five disabled records on disk across profile saves).
- Initial sandbox full Rust run: 254 passed, 2 failed (private pasteboard and Vision), 1 ignored. First unsandboxed serial run fixed both native failures but had the timed child-process timeout; final serial run passed. No assertion or production timeout was weakened. A parallel test-fixture directory collision was corrected with a process-local atomic suffix and exclusive creation.
- OpenSpec strict: 27 passed, 0 failed. Existing icon archive dependency information remains unrelated.
- actionlint 1.7.12 passed ci.yml and release.yml (shellcheck disabled). Download checksum verified against the public release checksum list. This is workflow syntax/expression validation, not hosted execution.
- git diff --check passed.

## Local commit gates

The requested local commit reran frontend tests (362 passed), full/core/standard production builds and locked Cargo checks, Rust formatting, the separate build-graph budget, strict validation of this change, workflow actionlint and installer checksums. The first serial Rust rerun hit the existing one-second child-process timeout; that test passed unchanged in isolation, then the complete serial suite passed again (367 passed, 2 ignored). Core and standard build_profiles tests passed again (2 each). Native trial and hosted workflow gates below remain open.

## Real local installers

Both built using final pnpm package:desktop --profile <profile> --target aarch64-apple-darwin --ci. First sandbox DMG creation failed; subsequent builds used approved sandbox-external hdiutil. Early linker-only signatures did not pass complete bundle verification; final scripts set signingIdentity=- and require codesign --verify --deep --strict after packaging.

| Profile | DMG bytes | DMG MiB | .app bytes | .app MiB |
| --- | ---: | ---: | ---: | ---: |
| core | 7,315,350 | 6.98 | 19,672,174 | 18.76 |
| standard | 8,758,530 | 8.35 | 24,056,414 | 22.94 |

Final DMGs were mounted read-only, inspected and detached. Both passed hdiutil verify, manifest bytes/SHA-256, complete bundle signature verification, CFBundleIdentifier=com.watson.ztool and CFBundleShortVersionString=0.1.0. File engine resources and File command literals are absent. Four representative native tool command literals are absent in core and present in standard. These are packaged artifact checks, not runtime or user-interaction acceptance. Exact checksums and machine-readable inspection reports are in ignored build/packages/<profile>/SHA256SUMS.txt, sizes.json and bundle-verification.json.

## Remaining evidence

An existing Zero process was detected and left running. The user requested local download/trial; no app instance was replaced, stopped or launched for UI smoke. Native startup, four-tool interactions, system-bar/shortcut behavior and Gatekeeper acceptance are unverified for these specific packages. Complete ad-hoc signing is not Apple notarization or developer-certificate signing.

Hosted Actions has not run on this revision. Intel macOS and Windows installers and Windows device installation/runtime remain unverified. Manual dispatch uploads artifacts without creating tags/releases; tag dispatch only attaches to a Draft. Remote Git operations and workflow dispatch remain outside this turn's authorized mutations.
