# Product

## Register

product

## Users

Zero is for desktop users who want small native utilities close at hand without opening a full workspace app. They usually enter through the status bar or tray, act quickly, then return to another task.

## Product Purpose

Zero is a Tauri desktop toolbox. It provides compact tray access for fast actions, a standalone main window for tools and preferences, and a separate about window. Success means users can discover, launch, configure, and understand tools without the app feeling like a crowded control panel.

The five bundled tools are Zero Snap, Zero Awake, Zero Paper, Zero Launch, and Zero File. Capability and release readiness vary by platform; use [the project overview](docs/project-overview.md) for the current implementation and verification boundaries. Mobile remains a future design consideration.

## Brand Personality

Calm, capable, compact. The product should feel like a well-kept desktop control center: practical, quiet, native-aware, and ready for expansion.

## Anti-references

- Generic SaaS dashboards with large marketing sections inside the app shell.
- A tray-only utility that hides every important workflow behind tiny controls.
- Decorative system-monitor clones that copy Lemon's metrics without serving Zero's plugin model.
- Overly playful widgets, loud color fields, or unfamiliar controls that slow down a desktop utility workflow.

## Design Principles

- Keep the tray panel fast: status-bar entry points should remain lightweight and predictable.
- Give the main window room to grow: plugins need a real home with navigation, summaries, and future categories.
- Apply this surface distinction to every plugin: keep status-bar/tray tool pages concise; let main-window tool pages use the available space for fuller controls and useful visualizations. Shared behavior does not require identical layouts or tray-sized main content.
- Separate system surfaces: preferences, about, update, and quit controls should be clear, stable, and not compete with plugin work.
- Preserve native expectations: window size, focus, taskbar behavior, and platform capabilities are part of the UX.
- Prefer earned density: compact information is good when hierarchy and click targets stay readable.

## Accessibility & Inclusion

Target WCAG AA contrast for product UI text and controls. All interactive controls need visible focus states, keyboard access, reduced-motion alternatives, and labels that still make sense in Chinese and English.
