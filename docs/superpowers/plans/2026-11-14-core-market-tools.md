# Core Market Tools Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement task-by-task. Track evidence in the OpenSpec change; do not commit or publish without the maintainer's requested scope.

**Goal:** Let core install independently owned tools through a verified package/runtime boundary, preserving actual platform functionality.

**Architecture:** Share versioned native providers in the host; keep UI, domain rules, configuration, localization and background entry points in independently built packages. Reuse the existing isolated WebView/SDK and registry, extending actual capabilities and lifecycle rather than importing static tool panels into core.

**Tech Stack:** Tauri 2, Rust 2021, React 19, TypeScript, Vite, pnpm 10.33.0; existing serde/semver/Ed25519/ZIP tooling.

**Spec:** [Approved design](../../../openspec/changes/enable-core-market-tools/design.md) and both specs in that change.

## Global Constraints

- Preserve `com.watson.ztool`, `~/.zero`, five canonical IDs, preferences, platform differences and File engine approval.
- No TypeScript `any`, peer-tool imports, plugin imports of private host/Tauri implementations, arbitrary native plugins or unsigned official identities.
- Formal runtime and package availability must match native evidence; no release/push/real signing-key provisioning in this execution.
- Work on `codex/core-market-tools`, preserving the earlier uncommitted market/recovery fix and approved proposal.
- Only the controller prepares `/private/tmp/zero-tests`; shared fixture/build jobs run serially.

## Review Focus

- Existing manifests with absent new optional fields must retain behavior; malformed ranges, duplicate capabilities and unsafe background entries must be rejected.
- A signed archive with the wrong plugin ID/version/digest must never override an official tool; identity does not grant permissions.
- A dynamically built plugin cannot include peer code through transitive imports or aliases.
- Stopping/updating one tool cannot revoke another tool's native lease or permit late commits.
- Core/standard migration cannot reseed an explicitly removed tool or mark missing code ready.

### Task 1: Ownership map and contracts (OpenSpec 1.1–1.4)

**Files:** `openspec/changes/enable-core-market-tools/evidence/ownership.md`, public SDK contracts, `src-tauri/src/plugins/protocol.rs`, capability helpers, `schemas/plugin-manifest-v2.schema.json`, shared fixtures/tests.

**Interfaces:** manifest optional `requiredCapabilities: {id:string;version:string}[]`, optional `background: {main:string;events:string[]} `; `HostCapability {id,version}`; explicit capability reports. Preserve omission in wire serialization.

- [ ] Audit five tools' imports/native calls/background behavior and assign every owner; record source pointers.
- [ ] Add failing Rust/TS/shared fixture tests for missing/malformed capabilities, incompatible versions, unsafe background paths and absent optional fields.
- [ ] Implement DTO/schema validation using existing SemVer and path rules, keeping runtime unavailable until implemented.
- [ ] Publish a self-contained local SDK build; independently compile it without private host source.
- [ ] Verify focused tests and a real package import-boundary rejection; mark only proven OpenSpec tasks complete.

### Task 2: Official archive authority and independent build (3.1–3.3)

**Files:** new `src-tauri/src/plugins/publisher.rs`, package input/market contracts, package validation integration, `scripts/` single-plugin packaging/boundary tooling, tests.

**Interfaces:** versioned signature envelope binding plugin ID, package version, SHA-256 and key ID; `verify_official_package` accepts trusted public keys, expected identity and measured digest. No real key material in tests.

- [ ] Write failing real Ed25519 fixture tests for identity/version/digest/key mismatch, tampering, unknown envelope and missing authority.
- [ ] Implement strict verification with existing libraries and bind preflight/install to verified measured bytes.
- [ ] Add standalone single-tool bundling/ZIP construction and transitive source-boundary checks; write tests using fixture projects and inspect actual outputs.
- [ ] Validate installation failures preserve registry and package assets, with negative tests for official-ID impersonation.

### Task 3: Versioned providers and execution ownership (2.1–2.4)

**Files:** Rust provider registry/commands, existing session dispatcher, SDK requests, service composition and profile scripts.

**Interfaces:** provider catalog advertises only implemented public methods; requests validate live session, permissions and owner generation before side effects. Thin commands retain symmetric Result DTOs.

- [ ] Add failing capability/permission/revocation tests, including separate tool owners and the old core capability set.
- [ ] Separate compiled providers from bundled metadata/seed state; avoid starting absent tool services.
- [ ] Connect explicit provider methods through the session Bridge, with bounded network/storage/window/contribution contracts and no raw invoke escape.
- [ ] Implement native lease cleanup, ready/deactivate and cancellation; exercise late-response and cross-tool isolation cases.

### Task 4: Background scheduling and individual tool migration (2.5–2.6, 4.1–4.7)

**Files:** persistent scheduler/occurrence owner, isolated background sessions, package-owned entry points under each tool, corresponding providers and tests.

**Interfaces:** scheduled event identifies plugin/digest/generation/task/occurrence and bounded payload; package background module runs at most 60s without interactive approvals.

- [ ] Pin scheduler restart/DST/coalescing/non-reentrancy behavior with failing tests; use maintained time rules.
- [ ] Implement on-demand hidden-session execution and cleanup; verify occurrence deduplication and revoked-generation refusal.
- [ ] Migrate Awake first, including power lease/plan/battery behavior, and exercise a real isolated core-installed package.
- [ ] Migrate Paper, Launch, Snap and File individually, with package-owned policies and existing platform behavior; each gets its own test cycle and native evidence.
- [ ] Leave actual unavailable File signing/release evidence unchecked; do not substitute a weakened policy or synthetic conversion result.

### Task 5: Profile installation, migration and rollback (3.4–3.5, 5.1–5.5)

**Files:** registry transactions/migrations, seeded package manifest, profile collectors, market UI/contracts, fixtures.

**Interfaces:** core supplies no package; standard supplies exactly the same four signed archives as the market. Source records provenance, never trust.

- [ ] Test update readiness failure, concurrent mutation, fsync/rename failure and crash recovery before implementing the transaction.
- [ ] Preserve previous package/grants/intent until ready; publish one authoritative registry revision per committed change.
- [ ] Pin legacy absence/uninstalled intent, preferred shortcuts and data preservation; implement explicit recommendation/restore without silent downgrade or reseed.
- [ ] Verify core/standard archive digests, no eager static loaders, and truthful offline/incompatible/empty states.

### Task 6: Whole-flow verification and handoff (6.1–6.6)

- [ ] Run `pnpm test`, each frontend profile build, Rust fmt/check/test, build graph and strict OpenSpec serially where fixtures/assets overlap; preserve first failures.
- [ ] Inspect actual macOS installed-package flows; record Windows and missing external release approvals separately if unavailable.
- [ ] Produce local measured artifacts, checksum/signature contracts, compatibility matrix and reviewable market/Release attachment list without uploading.
- [ ] Run fresh review against the approved design and independence constraints; correct findings, update evidence and bilingual docs, leaving manual/unreleased work visibly unchecked.
