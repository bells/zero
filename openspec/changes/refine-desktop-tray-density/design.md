## Context

See [proposal.md](proposal.md) for the user problem and approved product choices. The maintainer accepted all recommendations in the grilling conversation: two lines for Launch name/path with right-aligned actions; content-dependent tray height; menu-bar attachment with native fallback; compact long-content limits.

Current evidence is source inspection, not a fresh native reproduction:

- `popover.css` reserves 8 logical pixels inside the window for its caret. Both native tray and Paper gap are already zero. `tool_windows.rs` clamps the whole window to the work area, preventing the caret from entering the menu bar.
- Tray is 400 × 500. `navigation.css` stretches most plugin cards; Awake content stays at the top. Snap already opts out of card stretching. Launch and File have internal scroll regions as well as the host overflow.
- Launch's running cache expires every two seconds. Each refresh emits an event that schedules a search; query pending becomes `isLoading`, changing the index status text and shortcut opacity. This is not a two-second full index rebuild.
- At widths up to 560px, Launch CSS deliberately moves actions below name/path. Existing text ellipsis works. File draws a 1px connector and a separate 12px SVG in the same element.

## Goals / Non-Goals

**Goals:** Fix the four reported issues through host-owned geometry and bounded plugin presentation changes. Keep controls reachable, status feedback accurate, English/Chinese layouts usable, and shortcut activation tied to displayed item IDs/revisions.

**Non-Goals:** New plugin features, changed index TTL, new native menus, a redesign of the main shell, resizing the dedicated Launch window, resizing the dedicated Paper window, File engine/release changes, Linux/mobile support claims, publishing, commits, spec synchronization or archiving.

## Decisions

### 1. Host measures natural content; Rust applies bounded geometry

Keep the tray width at 400 logical pixels. Its total outer height is natural content height capped at 500 logical pixels and at the available destination-monitor space, whichever is smaller. These numeric values are implementation choices preserving the current width/long-content envelope, not additional choices attributed to the maintainer. Header, navigation, shell padding and caret are included in the total.

Remove unconditional plugin stretching only in the tray. Measure a natural-content wrapper independently of the applied viewport height, with ResizeObserver and animation-frame coalescing. Changes smaller than one logical pixel do not trigger IPC. One request is in flight; newer measurements replace queued older ones. Disconnect observers and cancel pending work when hidden/unmounted. Retain the last applied height while opening, then reconcile on activation; do not persist dimensions to preferences.

The host owns a current layout generation tied to the selected plugin and opening epoch. Late measurements or responses from a previous generation cannot resize the newly selected plugin. Hidden-window updates cannot reposition or reveal a panel. Timers and running-status refreshes do not themselves request resize; actual structural changes such as expanding Awake plans or adding File jobs can.

Rust retains the triggering native anchor and desired height and recomputes the final size/position when opening, resizing, or moving to a different monitor. Native policy rejects nonfinite/nonpositive desired heights, enforces fixed width, clamps to the monitor and compact cap, and never trusts a frontend path, window label or monitor rectangle. Failure retains the last usable geometry and produces a typed error; it cannot cause an observer retry loop. Missing anchors use safe centered placement without a caret.

Alternatives considered: keep a fixed outer height but shorten only the card (still leaves external blank space); stretch controls/images to fill the old height (changes practical control sizes). The maintainer selected natural height with a compact cap.

### 2. Explicit IPC boundary

Add a thin tray-only command in `commands/app.rs`, with business policy/state in a host service. Proposed contract (names finalized in implementation without changing behavior):

```rust
#[derive(serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayLayoutRequest {
    pub generation: u64,
    pub desired_height: f64,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TrayLayoutSnapshot {
    pub generation: u64,
    pub applied_height: f64,
    pub max_height: f64,
}

// window is injected by Tauri; ensure its label is exactly "tray".
#[tauri::command]
pub fn update_tray_layout(
    input: TrayLayoutRequest,
    window: tauri::WebviewWindow,
    app: tauri::AppHandle,
) -> Result<TrayLayoutSnapshot, TrayLayoutError>;
```

```typescript
interface TrayLayoutRequest { generation: number; desiredHeight: number }
interface TrayLayoutSnapshot {
  generation: number;
  appliedHeight: number;
  maxHeight: number;
}
interface TrayLayoutError { code: string; message: string }

invoke<TrayLayoutSnapshot>("update_tray_layout", { input });
```

Use safe integer generations within JavaScript's range. A generation is monotonic within the current document and latest accepted by Rust; reload starts a new host-authorized layout session rather than comparing against an old document's generation. An implementation may add an opaque session ID to both contracts to enforce this. Unrelated windows, including `zero-file-engine`, cannot call this command. Do not broaden default capabilities or export native resize access to plugin windows. Reuse retained placement revisions for caret updates; independent tray/Paper placement revisions remain independent.

### 3. One scroll owner for each visible region

The tray header and navigation remain fixed. Short Awake/Paper/Snap content uses natural height with normal bottom padding. Long simple content scrolls in the host content viewport. Launch results and File jobs may retain their existing internal viewport for keyboard selection / queue controls, but their enclosing host content must not add a second scrollbar: the host constrains their available viewport and measures a bounded desired height. Footer actions and errors remain reachable.

Plugin adapters expose only presentation sizing hints if needed; core must not import plugin implementations or depend on plugin DOM selectors to discover business state. Measure host-owned wrappers or a typed layout contract, not a CSS chain that repeatedly measures its own applied height. Main-window cards keep their existing full-workspace behavior. Dedicated Paper keeps its current size.

### 4. Body attaches to menu-bar lower edge

For macOS anchored Zero and dedicated Paper, allow only the existing 8-logical-pixel caret band above the work-area top, clamped within the full monitor bounds; body content remains below the menu bar. Maintain horizontal work-area clamping and actual-icon caret offsets. Convert all overlap values with the destination monitor scale. On resize, the top/trigger anchor stays stable and the bottom changes.

The preferred body top is the menu-bar lower edge. Test menu layering, clipping, status-icon clicks, dismissal and reopening in the real app. If AppKit layering or hit testing prevents a usable caret overlap, retain the nearest valid below-menu placement with an attached caret. This fallback is explicitly accepted by the maintainer; record what was actually achieved. Windows keeps native taskbar positioning, adapting height within its work area without a macOS caret. Snap/Awake native menus and dedicated Launch placement are untouched.

### 5. Separate background freshness from visible loading

Preserve the two-second running-status policy. Track initial loading / explicit index refresh / user query pending separately from background running-state reconciliation. Background work preserves displayed results, selection and status text until a current-generation result can be applied. A user query takes precedence; a slow background completion cannot replace it.

A background poll alone must not toggle the visible index status, `aria-live` status, result busy state or shortcut opacity. Keep stale-item/revision protections in Rust and the displayed-target shortcut resolver. If a background refresh only updates running badges, merge by item ID into the current displayed result without relabeling positions. If an index revision actually changes, treat it as a genuine result invalidation and reconcile safely. Do not simply remove pending checks globally or allow shortcuts to select a new result by old numeric position.

Implementation refinement after review: background reconciliation uses `get_quick_launcher_running_items`, not another ranked search. Its explicit camelCase input is `{ itemIds: string[] }` (at most 24 host-indexed IDs); output is `{ indexRevision: number, states: Record<string, QuickLauncherRunningState> }`. Rust `QuickLauncherRunningItemsInput` / `QuickLauncherRunningItems` match those interfaces through serde. The frontend calls `invoke<QuickLauncherRunningItems>("get_quick_launcher_running_items", { input: { itemIds } })`. This avoids top-24 membership changing merely because running bonuses change, while actual revision changes still invalidate the result. Unknown/unindexed IDs are omitted; arbitrary paths or commands are not accepted.

The implemented tray session is issued by `begin_tray_layout`, returning `{ session, maxHeight }`. Every update includes that host-issued session alongside generation and desiredHeight; plugin switches, document reloads and reopening replace the session. The outer host owns scrolling for all five tray plugin panels; plugin-local vertical scrolling is disabled only under the natural tray wrapper. ResizeObserver measures natural content/chrome, and MutationObserver covers later shell-message insertion/removal and caret attachment changes.

Initial loading, manual refresh, query changes, activation and recoverable errors retain appropriate visible feedback. Test races between polling, typing, numeric shortcuts, hiding and genuine index changes. Choose the smallest scheduling change satisfying these invariants; avoid introducing a second unbounded search pipeline.

### 6. Launch columns and File connector

Use three columns at tray width: icon / `minmax(0, 1fr)` name-and-path / nonshrinking action-and-shortcut. Name and path stay stacked; ellipsis applies to both. Full text is exposed to assistive technology and the complete path is available via hover/focus hint. Keep row click target, focus ring, running badge and numeric shortcut semantics. Verify long English labels, long titles/paths, CJK names and Windows Ctrl-digit labels at 400px.

File uses a single continuous arrow graphic through the existing Lucide/SVG setup instead of a background line plus independently positioned arrow. Verify its optical alignment between the two file tokens at normal and scaled rendering. No new dependency is needed.

## Risks / Trade-offs

- Resize feedback loops or stale plugin measurements → natural wrapper measurement, generation/session rejection, one-in-flight IPC, pixel deduplication and hidden-surface cleanup.
- Changing height moves the bottom edge → accepted in the interview; retain the top anchor and avoid decorative resize animations.
- Small screens / mixed DPI / negative-origin monitors → native destination-monitor geometry tests and explicit device evidence, separate from browser screenshots.
- Menu-bar overlap may not work at the current native window level → bounded experiment and accepted below-menu fallback; do not raise every app window's level.
- Silent background reconciliation could weaken shortcut safety → test displayed-ID/revision activation during poll and user-query races before changing visible pending semantics.
- Long labels compete with actions → shrink only text, validate both locales and 400px geometry; do not restore action wrapping to hide overflow.

## Verification and rollout

Add behavioral tests for geometry limits/caller restrictions, measurement lifecycle/races, and Launch background reconciliation before implementing those changes. Check low-impact arrow and CSS changes visually rather than adding source-text tests that duplicate their markup. Run the desktop gates and isolated build graph output described in AGENTS.md, strict OpenSpec validation, and `git diff --check`.

Run `pnpm tauri dev` for all five actual tray plugins plus affected main-window File/Launch flows. Record widths/heights, scroll ownership, menu-bar position and poll stability with screenshots where available. macOS single-monitor success does not establish mixed-DPI or Windows acceptance. If automation is unavailable, leave the corresponding tasks unchecked. No persistent migration is required; reverting these host/presentation changes restores the previous layout without changing user data.
