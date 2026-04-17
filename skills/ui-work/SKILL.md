---
name: ui-work
description: Implement or modify UI and presentation for this Phaser dungeon crawler. Use when changing HUD, minimap, overlays, menus, tooltips, floor labels, responsive layout, screen-edge anchoring, UI scaling, or other work centered on `src/scenes/UIScene.ts`, `src/scenes/GameScene.ts`, `src/main.ts`, and `index.html`.
---

# UI Work

Read only the files needed for the request. Start with [CLAUDE.md](../../CLAUDE.md), then inspect the most relevant files:

- `src/scenes/UIScene.ts` for HUD, minimap, counters, cooldowns, and screen-anchored UI
- `src/scenes/GameScene.ts` for world camera framing, overlay triggers, and gameplay-to-UI events
- `src/main.ts` for viewport sizing and Phaser scale mode
- `index.html` for page-level CSS and browser interaction guards
- `src/lang.ts` if visible UI text changes

Follow these project rules:

- Preserve pixel-art presentation and existing asset style.
- Keep responsive behavior compatible with the current `Phaser.Scale.RESIZE` setup.
- Anchor HUD to the real viewport. Do not rely on zooming or scrolling the `UIScene` camera to fake scaling.
- Scale UI elements explicitly with `setScale`, `setDisplaySize`, font sizes, and layout math.
- Keep gameplay and UI decoupled through `game.events.emit(...)` / listeners when possible.
- Do not add dependencies or rewrite the project structure for UI-only work.

Use this workflow:

1. Classify the issue first: HUD layout, world camera framing, boot/menu flow, or page/container CSS.
2. Edit `UIScene.ts` for fixed-screen UI. Edit `GameScene.ts` only for world camera or scene-level overlays. Edit `main.ts` only for viewport/bootstrap behavior.
3. Use viewport-based layout math for anchored elements. Recompute positions on resize.
4. Keep minimap, stats, floor text, HP bar, coins, and hotkeys attached to screen edges instead of virtual camera space.
5. If text is added or changed, update localization paths instead of hardcoding one language.
6. Build after edits with `npm run build`.

Use these heuristics:

- If the player sees the wrong amount of world, inspect `GameScene` camera zoom logic.
- If HUD pieces drift, disappear, or cluster incorrectly, inspect `UIScene` viewport math and explicit scale values.
- If the canvas or page scrolls, inspect `index.html` and `main.ts` before touching scene code.
- If a new gameplay state needs UI, prefer emitting state through scene events and handling the draw logic in `UIScene`.

Before finishing, verify:

- HUD remains visible and anchored after resize
- UI scale matches the intended feel at the baseline viewport
- world camera framing and UI layout are not solving each other’s problems
- `npm run build` passes
