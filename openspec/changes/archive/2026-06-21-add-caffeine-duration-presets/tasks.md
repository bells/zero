## 1. Contract and model tests

- [x] 1.1 Add Rust unit tests for allowed caffeine duration presets, unsupported duration rejection, and no-limit duration handling.
- [x] 1.2 Add Rust unit tests for finite-session expiry metadata and stale-timer/session-generation protection.
- [x] 1.3 Add a TypeScript helper test covering caffeine duration preset list, compact labels, elapsed formatting, and remaining-time formatting.

## 2. Rust caffeine service and IPC

- [x] 2.1 Extend CaffeineSnapshot with duration_minutes and expires_at_ms while preserving enabled, started_at_ms, and message.
- [x] 2.2 Extend toggle_keep_awake to accept optional duration_minutes and validate it against the allowed preset list.
- [x] 2.3 Update CaffeineState to store duration, expiry timestamp, and a session generation id.
- [x] 2.4 Implement backend-owned automatic expiry for finite sessions with stale-timer protection.
- [x] 2.5 Preserve existing platform behavior for macOS caffeinate, Windows SetThreadExecutionState, and unsupported platforms.

## 3. Frontend caffeine plugin

- [x] 3.1 Add a focused caffeine duration helper module for preset definitions, labels, elapsed formatting, and remaining-time formatting.
- [x] 3.2 Update useCaffeinePlugin to consume the extended CaffeineSnapshot contract and send duration_minutes when enabling.
- [x] 3.3 Refresh caffeine state when a finite countdown reaches zero so the UI follows backend truth after expiry.
- [x] 3.4 Update CaffeinePanel with compact duration controls for no limit, 5m, 10m, 15m, 30m, 1h, 2h, and 5h.
- [x] 3.5 Show selected duration, elapsed time, remaining time for finite sessions, and no-limit status for indefinite sessions.
- [x] 3.6 Add zh-CN and en-US i18n strings for duration options, remaining time, no-limit mode, and switching duration.

## 4. Verification

- [x] 4.1 Run the new caffeine TypeScript helper test with a focused tsc compile output under /private/tmp.
- [x] 4.2 Run node --test tests/*.mjs.
- [x] 4.3 Run pnpm build.
- [x] 4.4 Run cd src-tauri && cargo check && cargo test.
- [x] 4.5 Run git diff --check.
- [ ] 4.6 Run pnpm tauri dev and manually verify no-limit enable/disable, finite expiry, duration switching, and unsupported-platform error handling where applicable.
