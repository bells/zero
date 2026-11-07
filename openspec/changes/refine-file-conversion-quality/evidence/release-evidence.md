# R01 evidence inventory — no release approval

Date: 2026-11-03. Task 8.3 delivers this inventory; it does **not** run R01. No signed package is produced, policy is not approved, and no Windows direction is enabled. Native checks are reserved for the maintainer. A generated corpus or passing source tests cannot fill any of the rows below.

| Required record | Acceptance / artifact to retain | Current result |
| --- | --- | --- |
| Exact identity | Candidate version/protocol, host API range, asset manifest hash, package SHA-256, signature algorithm/key ID, actual signature verification and notarization/signing logs | Baseline 1.2.0/protocol 2 is unapproved; final next-candidate digest/signature **pending**. Read current policy at release time. |
| Artifacts and profiles | Signed app/engine package absolute or durable release URI, platform/architecture, full/standard/core contents, measured reproducible package manifest | **Pending**, no signed artifact in this task. File remains excluded from standard/core. |
| Offline clean install | Fresh profile/device with network disabled after explicit asset provisioning; install/launch/convert both qualified directions; filesystem and resource availability record | **Pending**. Debug `ZERO_FILE_ENGINE_DEV_ASSETS=1` cannot substitute. |
| Complete outputs | P/F/D acceptance outputs with input/output hashes, full text order/cells/merges/figures, page dimensions and visual checks; N04 actual editor save/reopen | Quality input contracts exist; **engine outputs/native editor evidence pending**. |
| Size | Actual exact compressed artifact bytes <= 20MiB, installed engine bytes <= 45MiB; notices and resource/model ownership separate | **Pending**. Old prepared-source byte values do not measure the signed candidate. |
| Readiness | Cold and warm ready timestamps including resource/font readiness; exact hardware/OS/runtime; ready <= 2000ms policy gate | **Pending**. Source timer tests alone cannot establish this. |
| Memory | Peak RSS and sample method for representative/large corpus including OCR/native printing; baseline, peak, teardown, repeats | **Pending**; baseline policy memory ceiling is null and must be explicitly measured/decided before approval. Do not invent a ceiling or claim a null ceiling passed. |
| Cancellation | OCR/packing/printing separately; user cancel→ack <= 2000ms; no final output or leaked staging, stale generation rejected, subsequent task runs on safe instance | **Pending**; deterministic lifecycle contract E07 is not this device measurement. |
| Windows runtime | OS build, WebView2 installed version, QueryInterface/PrintSettings capabilities, local OCR DLL/model versions and hashes, N02/N03 outputs at 100%/150% | **Pending / no Windows device evidence**. Provider remains disabled until independent prototype gate passes. |
| External providers | Installed Word/LibreOffice exact versions, explicit selections, actual exports, permission/activation/uninstall failure recovery, no fallback | **Pending**, per N05 provider/platform; do not install or claim these apps implicitly. |
| Upgrade/rollback | Install approved previous package→candidate→rollback; verify old outputs unchanged, preference compatibility/reselection, no arbitrary command/path behavior | **Pending**. Preserve user-owned output and source files. |
| Repair/tamper | Missing asset, wrong digest/signature/protocol/version, offline interrupted install, repair attempt and safe unavailable message; previous working package retained | **Pending**, exact before/after digest logs required. |
| Approval | Independent completed corpus/device/release evidence linked from policy and approved digest list | **Not authorized by this task; remains false/empty**. |

Evidence should include timestamp, machine/OS/architecture, runtime and application/provider versions, command or interaction, case IDs, observed errors/warnings, and artifact SHA-256. Never place document text or user paths in runtime diagnostic logs. Synthetic fixture artifacts may be retained under a dedicated acceptance output directory with explicit hashes. Link each result here before a separately authorized release reviewer changes policy.
