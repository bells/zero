## Why

Snap's macOS menu overlaps the menu bar, its capture shortcut is fixed, and capture can take seconds to become visible while the user moves the pointer. Windows currently has only a system capture launcher and no Zero OCR flow. The maintainer confirmed the complete scope in a numbered grilling interview on 2026-10-25.

## What Changes

- Position the native macOS Snap menu below its clicked glyph, within that display's available menu area.
- Make Snap capture and capture-OCR shortcuts editable, clearable and resettable in the main preferences window, with transactional registration, persistence, real menu hints and localized errors. Defaults: Alt+A (Option+A on macOS), OCR unassigned. Launch remains read-only.
- Measure trigger-to-interactive capture stages before optimizing demonstrated bottlenecks. A stationary pointer must not prevent reveal; compare first/repeated capture and menu/shortcut/main entry points.
- Add a Windows-only OCR selection capture flow while retaining the system tool for ordinary Windows capture. Bundle a CPU offline Chinese/English OCR provider and required models, without Python, cloud calls or system language-pack installation.
- Preserve explicit selection confirmation, one-display geometry, editable result and explicit clipboard copy. Separate compiled/source evidence from macOS/Windows device and packaged offline evidence.

## Capabilities

### New Capabilities
- `snap-entry-menu-placement`: Native menu anchoring without status-bar overlap.
- `snap-configurable-shortcuts`: Persisted capture/OCR actions, defaults, clearing and transactional conflict recovery.
- `snap-startup-observability`: Bounded, privacy-safe trigger-to-interactive measurement and input-independent reveal.
- `snap-windows-offline-ocr`: Windows OCR-only screen selection and bundled local printed Chinese/English recognition.

### Modified Capabilities

None in main specs. This change explicitly supersedes the read-only Snap bindings in active `optimize-preferences-settings`, the macOS-only OCR boundary in `enhance-snap-and-share-offline-ocr`, and the fixed capture shortcut in earlier Snap deltas. It retains their scenario behavior otherwise; no incidental sync/archive.

## Impact

Host shortcut service/commands, preferences UI/contracts, native status-bar coordinator, Snap capture lifecycle/frontend, shared OCR provider boundary, Windows resources and packaging checks. macOS keeps Vision. No website/feedback work, full Windows annotation editor, cross-display stitching, File engine approval, commit, push or release is included.
