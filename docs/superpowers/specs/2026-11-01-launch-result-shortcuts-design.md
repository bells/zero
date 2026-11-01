# Launch result shortcuts

Approved in chat on 2026-11-01: all four initial decisions, the pending-search safeguard, and the final request to implement.

## Intent and scope

Make Launch results directly executable using macOS Command+1–9 and Windows Ctrl+1–9. Both the floating launcher and embedded panel use the current ordered result list, including applications and system settings. Empty queries and text searches behave alike. The first nine results keep their absolute numbers when scrolled; Enter continues to execute the current selection. Keep the current ranking, action labels, window dimensions, and dismissal/error behavior.

Show each assigned shortcut alongside its action label, including the first result. During pending searches, refreshes, activation, hidden surfaces, composition, and repeated keydown, numeric shortcuts must not execute. Capture the displayed item's ID and revision; never resolve a delayed keypress against a newly reordered list. A keypress during a pending search is ignored rather than queued.

## Approach

Use the existing shared React view, controller, and Rust activation command. Global digit registration would affect unrelated apps; separate surface implementations would duplicate behavior. The chosen local handler and shared activation path keep the behavior within Launch. No dependency or IPC contract changes are needed.

## Implementation choices

Handle numeric chords within the Launch section, including when a result or refresh button has focus. Accept only the platform modifier without Alt/Shift or the other platform modifier. Expose scheduler pending state to guard synchronous events as well as rendered loading state. Preserve native revision validation, duplicate activation prevention, and current failure feedback. Use existing colors, typography, and narrow-width layout conventions.

## Acceptance

Test both modifiers, positions 1/9/out of range, applications/settings, pending and rapid queries, reorder identity, repeat/composition, activation failures, and inactive surfaces. Run frontend regression/build/performance checks, relevant OpenSpec validation, and real macOS desktop interaction. Report Windows device acceptance separately.
