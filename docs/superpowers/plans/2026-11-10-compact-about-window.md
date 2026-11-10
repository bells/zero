# Compact About window implementation plan

The maintainer approved this design in chat on 2026-11-10.

## Goal and architecture

Make the default 500 × 560 About window fit Chinese and English content without scrolling while details are collapsed. React owns layout and presentation. Rust enables resizing with the existing 420 × 360 minimum. Reuse the existing diagnostics hook, native metadata, icons and support commands.

## Approved design

Merge identity, version and a short description. Remove the duplicate page heading. Use compact project links and three horizontal support actions. Move architecture copy into Tools & runtime. Keep both detail sections collapsed initially and allow internal scrolling when expanded or resized smaller.

The chosen approach reorganizes the existing single view. Tabs would add navigation for this small amount of content. Increasing the default window size would leave the space allocation problem unresolved.

## Task 1

- [x] Update the existing native window test to require a resizable About window with default 500 × 560 and minimum 420 × 360. Run it before and after enabling resizing.
- [x] Remove the redundant header in `src/App.tsx`, consolidate identity and move technical copy in `src/core/preferences/AboutPanel.tsx`.
- [x] Update only About rules in `src/App.css`. Keep buttons and summaries at least 40 CSS pixels high, readable labels, visible focus and nonshrinking content inside the scrolling panel.

## Task 2

- [x] Check both languages at default and minimum sizes using the actual components. Verify folded details, expanded diagnostics, first-copy preview, reviewed copy, error feedback, keyboard access and enlarged text.
- [x] Run frontend tests/build, performance graph and Rust fmt/check/tests. Record strict OpenSpec validation and diff hygiene in the evidence document.
- [ ] Inspect the native flow, resizing and system text/display scaling. `pnpm tauri dev` built and launched, but desktop automation timed out while acquiring state.
- [x] Update the existing change design/spec/tasks with the agreed layout and verification evidence. Keep broader outstanding native/device acceptance tasks open.

## Review focus

Check long English labels, long asynchronous feedback, the 420 × 360 minimum, enlarged text and expanded preview. At small sizes scrolling must preserve reachability without shrinking targets or clipping content horizontally. First copy must still generate a preview before explicit clipboard approval.
