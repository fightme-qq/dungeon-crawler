---
name: gameplay-work
description: Implement or modify gameplay features for this Phaser dungeon crawler. Use when adding enemies, combat mechanics, loot, traps, progression, balance changes, run-state logic, dungeon interactions, or other gameplay systems in `src/entities`, `src/systems`, `src/scenes/GameScene.ts`, and `src/data/balance.json`.
---

# Gameplay Work

Read only the files needed for the requested feature. Start with [CLAUDE.md](../../CLAUDE.md), then inspect the smallest relevant owner among:

- `src/data/balance.json` for every numeric value
- `src/entities/*` for player or enemy behavior
- `src/systems/*` for reusable gameplay systems
- `src/scenes/GameScene.ts` only for orchestration and scene wiring
- `src/scenes/BootScene.ts` only when new gameplay assets must be preloaded

Follow these project rules:

- Keep all gameplay numbers in `src/data/balance.json`. Do not hardcode damage, HP, cooldowns, prices, drop chances, or spawn weights in code.
- Use `body.bottom` for depth sorting of moving actors and props.
- Use Arcade physics bodies for hit detection. Do not use `displayWidth`, `displayHeight`, or visual sprite bounds as hitboxes.
- Keep `GameScene` as the orchestrator. Put enemy-specific behavior in the enemy class or a dedicated system.
- Preserve the current Yandex integration and responsive setup unless the request explicitly touches them.

Use this workflow:

1. Find the narrowest owner for the feature before editing. Prefer `entities/` or `systems/` over inflating `GameScene`.
2. Extend existing patterns before inventing new ones. Reuse `game.events`, registry values, `RunState`, `EnemySpawner`, `AttackResolver`, `LootSystem`, `ShopSystem`, and `TrapSystem` where they already fit.
3. If adding a new enemy, add stats to `balance.json`, preload assets in `BootScene`, implement behavior in its class, and wire spawn selection through `EnemySpawner`.
4. If changing combat or formulas, keep shared math in `src/utils/combat.ts` or the responsible system instead of duplicating logic.
5. If a gameplay change affects HUD, emit or reuse scene events instead of coupling gameplay code directly to UI objects.
6. Build after edits with `npm run build`.

When adding a new item, follow this checklist:

1. Put every gameplay number in `src/data/balance.json`: stat values, rarity data, prices, spawn chances, special-effect values, premium product ids, and portal prices.
2. Add every visible item string to `src/lang.ts`: item name, rarity-facing labels if needed, special-effect text, prompt text, and any premium/persistent badge text.
3. Keep item roll/build logic in `src/systems/ShopSystem.ts`. Use `GameScene.ts` only to decide where and when the item should spawn or be purchased.
4. If the item changes run-wide stats or unlocks, persist that through `src/systems/RunState.ts` or owned Yandex purchase state instead of ad-hoc scene variables.
5. If the item has a gameplay behavior effect, apply it in the narrowest owner: player/attack system/projectile system, not inside UI code.
6. If the item needs a new icon or asset, preload it in `BootScene.ts` only when it is not already part of an existing atlas/spritesheet.
7. For premium items, keep the Yandex-specific purchase metadata in `balance.json`, restore ownership on startup, and make sure the item does not respawn once owned when that is the intended behavior.

Use these heuristics:

- Touch `Player.ts` for movement, attacks, input-driven abilities, or player stats application.
- Touch `BaseEnemy.ts` or a subclass for AI states, reactions, and enemy-only mechanics.
- Touch `systems/` for shared mechanics used by more than one actor or scene.
- Touch `GameScene.ts` only for object creation, collider wiring, event flow, and scene-level transitions.

Before finishing, verify:

- the feature still respects balance-file-only numbers
- no enemy behavior leaked into `GameScene`
- no hitbox/depth regression came from visual-size math
- `npm run build` passes
