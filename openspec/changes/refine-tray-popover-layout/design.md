## Context

See proposal.md for motivation. The maintainer approved the two-row header, actual-icon caret targeting, rightward context menus, and macOS positioning scope in the grilling interview. Tray is 400 × 500 logical pixels and Paper is 400 × 360. The grouped macOS status item already resolves exact 22-point cells. Snap already uses a per-cell native menu placement helper.

## Goals / Non-Goals

The implementation connects host-owned geometry to a reusable frontend popover wrapper. Launch continues to use its centered search surface. Snap and Awake retain their existing native interactions. Windows receives the shared shell layout and its native tray menu positioning.

## Decisions

### Header and content space

Use existing Lucide Settings, Info and PanelTop icons with translated title and accessible labels. The first row contains Zero, tool count, Settings and About. The second row contains the existing scrollable tool strip and a fixed Open Zero button, separated by spacing and a divider. Delete footer-only state and styles. Preserve the current outer dimensions, keyboard dismissal and action error feedback. Use 36-pixel header buttons and a 44-pixel workspace button as implementation sizing choices.

### Approaches

The approved approach uses a transparent top inset and a shared CSS caret. Rust computes the target offset from the clicked cell and final screen-clamped window position. A decorative caret fixed at 50% would drift at screen edges. Replacing native menus with web menus would expand the interaction and accessibility work. The existing AppKit placement path supplies the requested native menu behavior.

### Host placement and retained snapshots

Reuse `position_anchored_tool_window` for Zero and Paper. Return the logical horizontal anchor offset after successful positioning, or no offset for the safe centered fallback. A host `PopoverState` retains a revisioned `{ revision, anchorX }` snapshot independently for tray and paper. `anchorX` is a nullable number in logical pixels relative to the outer window. Restrict `get_popover_placement` to these two callers and emit `zero://popover-placement` only to the affected window. React subscribes before fetching its retained snapshot and rejects older revisions. This handles lazy Paper creation, listener timing and repeated openings.

The wrapper reserves 8 logical pixels above the body only for a valid macOS anchor, while the caret uses the supplied offset. Place it against the body's flat top edge and constrain its extent within the window. The tray and Paper use matching opaque body/caret colors to avoid a seam. Invalid or unavailable geometry uses the existing centered fallback with a plain body. Preserve normal positioner behavior for Windows and other existing entry points.

The clicked cell carries the native status window's backing scale. On macOS, convert its center to global logical coordinates before monitor lookup, then move the popover with a logical position computed using the destination display scale. This avoids Tao interpreting destination physical coordinates with the popover's previous display scale. Placement events use an explicit label target so independent tray and Paper revisions cannot affect one another.

### Native menus

Apply the existing exact-cell AppKit placement branch to every grouped item, preserving Snap's capture-display setup, native menu tracking, cell highlight lifecycle and post-menu cleanup. Reuse `menu_position::popup_origin` for screen edge adjustment.

## Risks / Trade-offs

- Mixed DPI and secondary screens require physical-to-logical conversion using the target monitor scale and negative-origin geometry checks.
- First window creation can precede the React listener. A retained snapshot plus monotonically increasing revisions covers that race.
- The transparent inset reduces body height by 8 pixels. Footer removal still returns most of its previous height to plugin controls.
- Native acceptance depends on available desktop automation. Record device limitations separately from automated checks.

## Verification

Add focused regressions for anchor offsets, missing geometry, independent snapshots/caller restrictions and menu edge placement. Run repository desktop gates, build graph checks, strict OpenSpec validation, and macOS tray/Paper/menu smoke checks. Keep unavailable Windows or multi-display acceptance visible in the tasks and evidence.
