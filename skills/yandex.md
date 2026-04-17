---
name: yandex-publish
description: Prepare and validate an HTML5 game for Yandex Games platform publishing. Use when integrating the Yandex Games SDK, fixing moderation rejection issues, or preparing a build for submission. Covers ALL SDK requirements, ad rules, localization, technical requirements, promo materials, and common rejection reasons from the full Yandex requirements (sections 1-8).
allowed-tools: Read, Grep, Glob, Edit, Write, Bash, WebFetch
---

# Yandex Games Publishing — Complete Reference

SDK Docs: https://yandex.com/dev/games/doc/en/sdk/sdk-about
Requirements: https://yandex.ru/dev/games/doc/ru/concepts/requirements
Draft Form: https://yandex.com/dev/games/doc/en/console/add-new-game/draft

---

## 1. No External Dependencies (CRITICAL)

- **NEVER use external CDN links** (Google Fonts, CDN-hosted libraries, etc.) in the game HTML
- `fonts.googleapis.com` and other Google services are frequently slow or blocked in Russia — a render-blocking `<link>` in `<head>` will cause a blank page for moderators and Russian users
- **Self-host ALL fonts**: download woff2 files, place in `public/fonts/`, use local `@font-face` declarations with `font-display: swap`
- Self-host any other external assets (icon libraries, CSS frameworks loaded via CDN)
- The ONLY external `<script>` allowed is the Yandex SDK itself (`/sdk.js`)
- **Rejection symptom**: "The game was not loading" — often means a render-blocking external resource timed out

```css
@font-face {
  font-family: 'MyFont';
  font-style: normal;
  font-weight: 300 700;
  font-display: swap;
  src: url('./fonts/MyFont-latin.woff2') format('woff2');
  unicode-range: U+0000-00FF;
}
```

---

## 2. SDK Connection (MANDATORY — Rule 1.1)

- Load SDK **synchronously** in `<head>`: `<script src="/sdk.js"></script>` (relative path for Yandex-hosted games)
- For iframe integration use absolute URL: `<script src="https://sdk.games.s3.yandex.net/sdk.js"></script>`
- Initialize with `YaGames.init()` — returns the `ysdk` object
- Store `ysdk` on `window` for cross-module access: `window.ysdk = ysdk`
- Prefer synchronous `<script>` in `<head>` over dynamic loading — ensures SDK is available before any game code runs
- **Rule 1.19.1**: Initialization must follow SDK documentation exactly

---

## 3. SDK Initialization & Game Events (MANDATORY — Rules 1.19.2, 1.19.3, 1.19.4)

### LoadingAPI.ready()
- Call `ysdk.features.LoadingAPI?.ready()` when the game is fully loaded and ready for interaction
- Must be called BEFORE removing any loading screen
- Do NOT call during SDK init — wait until assets, cloud save, and localization are loaded
- Use optional chaining `?.` (feature may not be available)
- **CRITICAL**: Call `LoadingAPI.ready()` in ALL code paths — including the error/catch path of SDK initialization. If SDK init fails and you skip this call, Yandex shows its loading overlay forever
- **CRITICAL (п. 1.19)**: `LoadingAPI.ready()` must fire BEFORE `gameLoop()` starts or the game becomes interactive. If `gameLoop()` runs before this call, moderators will reject with "GRA вызывается после того, как игра доступна для игры". See **Correct Startup Pattern** below.

### Correct Startup Pattern for Phaser games (MANDATORY)

Phaser can't delay its own init — the engine must start to load assets. The correct approach:
1. Start Phaser immediately (Yandex overlay covers game until `LoadingAPI.ready()` fires)
2. Use two sync flags: `__sdkDone` and `__bootDone` — call `LoadingAPI.ready()` only when BOTH are true
3. Apply language from SDK BEFORE any scene text is rendered (refresh in BootScene or before first scene starts)

```typescript
// main.ts
declare const YaGames: { init(): Promise<any> } | undefined;

(window as any).__sdkDone  = false;
(window as any).__bootDone = false;

function trySignalReady() {
  if ((window as any).__sdkDone && (window as any).__bootDone) {
    (window as any).ysdk?.features?.LoadingAPI?.ready();
  }
}
(window as any).__trySignalReady = trySignalReady;

// Fallback — if SDK doesn't init in 5s, proceed anyway
setTimeout(() => {
  if (!(window as any).__sdkDone) {
    (window as any).__sdkDone = true;
    trySignalReady();
  }
}, 5000);

(async () => {
  try {
    if (typeof YaGames !== 'undefined') {
      const ysdk = await YaGames.init();
      (window as any).ysdk = ysdk;
      refreshLang(ysdk); // reads ysdk.environment.i18n.lang directly — required for п. 2.14 green indicator

      // Pause/resume handling (Rule 1.3, 1.19.4)
      ysdk.on('game_api_pause', () => {
        (window as any).__phaserGame?.pause();
        ysdk.features?.GameplayAPI?.stop();
      });
      ysdk.on('game_api_resume', () => {
        (window as any).__phaserGame?.resume();
        ysdk.features?.GameplayAPI?.start();
      });
    }
  } catch {
    // SDK unavailable (local dev) — continue without it
  } finally {
    (window as any).__sdkDone = true;
    trySignalReady();
  }
})();

// Store game reference for pause/resume access
(window as any).__phaserGame = new Phaser.Game(config);
```

```typescript
// BootScene.ts — signal boot complete after all assets are loaded
(window as any).__bootDone = true;
(window as any).__trySignalReady?.();
```

### GameplayAPI.start() / stop()
- Call `start()` when active gameplay begins (scene create / resume after game over)
- Call `stop()` when gameplay pauses: game over, any overlay, before showing ads
- For Phaser: emit from GameScene on scene start and on game over:
  ```typescript
  // GameScene create():
  (window as any).ysdk?.features?.GameplayAPI?.start();

  // On game over:
  (window as any).ysdk?.features?.GameplayAPI?.stop();
  ```

### game_api_pause / game_api_resume Events (Rule 1.3, 1.19.4)
- Platform sends these on: tab switch, ad overlay, purchase dialog, window minimization
- **Must actually pause the game** — Yandex debug panel has a pause button to verify
- For Phaser: `game.pause()` / `game.resume()` freezes/unfreezes the entire game loop
- Subscribe in `main.ts` after SDK init (see startup pattern above)
- If game has audio: mute all sound in pause handler, unmute in resume handler (Rule 1.3)
- **VERIFY**: open game with Yandex debug panel → click pause button → game must freeze

---

## 4. Production Error Prevention (CRITICAL — Rule 1.14)

Yandex moderators check browser DevTools — any console output, unhandled errors, crashes, or freezes = rejection.

### Console Stripping (Vite)
```ts
// vite.config.ts
esbuild: {
  drop: ['console', 'debugger'],
},
```
Verify after build: `grep -c 'console\.' dist/assets/*.js` must return 0.

### Unhandled Promise Catches
Add `.catch(() => {})` to ALL Yandex SDK promise chains (ads, banners, player data). The SDK rejects when ads are unavailable or blocked — unhandled rejections show as errors in DevTools:
```ts
// BAD
ysdk.adv.getBannerAdvStatus().then(...)
// GOOD
ysdk.adv.getBannerAdvStatus().then(...).catch(() => {});
ysdk.adv.showBannerAdv().catch(() => {});
platform.showRewardedAd().then(...).catch(() => {});
```

### Game Loop Resilience (Canvas Games)
Wrap the game loop body in try-catch so a single rendering/logic error doesn't kill the animation loop:
```js
function gameLoop(timestamp) {
  if (gameState !== 'playing') { requestAnimationFrame(gameLoop); return; }
  try { _gameLoopInner(timestamp); } catch(e) {
    _showGameError('gameLoop: ' + (e.message || e));
  }
  requestAnimationFrame(gameLoop);
}
```
- Also wrap `startGame()` and audio initialization in separate try-catch blocks
- Use a one-time auto-dismissing error overlay (not `console.error`) for production diagnostics:
```js
let _errShown = false;
function _showGameError(msg) {
  if (_errShown) return;
  _errShown = true;
  const d = document.createElement('div');
  d.style.cssText = 'position:fixed;top:0;left:0;background:rgba(200,0,0,0.9);color:#fff;padding:8px;font-size:12px;z-index:9999';
  d.textContent = msg;
  document.body.appendChild(d);
  setTimeout(() => { d.remove(); _errShown = false; }, 8000);
}
```

### Variable Shadowing in Single-File Games (GOTCHA)
In large single-file HTML games, local variable names can shadow global functions. This causes cryptic "X is not a function" errors:
```js
// GLOBAL
function t(key) { return STRINGS[lang][key]; } // translation function

// BUG — inside a loop or block:
const t = Math.min(1, timer / 2500); // shadows t() !
ctx.fillText(t('game_over'), ...);   // ERROR: t is not a function
```
**Prevention**: Never reuse short names (`t`, `e`, `d`, `r`) as local variables if they match global functions. Use descriptive names: `prog`, `tgt`, `tr`, `evt`.

---

## 5. Advertising (MANDATORY — Rules 1.5, 1.12, 4.1-4.7)

### Fullscreen Interstitial Ads
- `ysdk.adv.showFullscreenAdv({ callbacks: { onOpen, onClose, onError } })`
- Show at logical pauses ONLY: between levels, on restart, after game over acknowledgment
- NEVER show during active gameplay or immediately after death (Rule 4.4)
- NEVER show without user action triggering the transition
- `onClose(wasShown)` — `wasShown` indicates if ad actually displayed
- Frequency is controlled by Yandex platform (no client-side cooldown needed)

### Rewarded Video Ads
- `ysdk.adv.showRewardedVideo({ callbacks: { onOpen, onRewarded, onClose, onError } })`
- Grant reward in `onRewarded` callback, NOT in `onClose`
- Must be user-initiated (player chooses to watch)
- Ad button must clearly show: user watches reward ad AND expected reward (Rule 4.5.1)
- Reward must be a bonus (boosters, extra actions, level skip), NOT core progression (Rule 4.5.2)

### Sticky Banner Ads
- `ysdk.adv.getBannerAdvStatus()` → check availability
- `ysdk.adv.showBannerAdv()` → show persistent banner
- `ysdk.adv.hideBannerAdv()` → hide during fullscreen ads
- Show after SDK init; additional blocks limited to sticky banners only (Rule 4.6.1)
- No custom RTB banners (Rule 4.6.2)

### Ad Rules
- **Pause game AND mute ALL audio** in `onOpen` callback (Rule 4.7)
- Resume game and unmute audio in `onClose` callback
- Await the ad promise before starting gameplay (don't fire-and-forget)
- Do not call ads during gameplay — accidental clicks are ad fraud
- All ads must go through Yandex SDK exclusively (Rules 1.5, 4.1)
- No modification of ad block content/appearance; no imitation of service ads (Rule 1.16)

---

## 6. Localization (MANDATORY — Rules 2.10, 2.14, 8.2.3)

### Language Detection
- Use `ysdk.environment.i18n.lang` (NOT `navigator.language`) — returns ISO 639-1 code
- **CRITICAL**: Read `i18n.lang` **directly from the ysdk object** passed from `YaGames.init()`. Yandex's debug panel monitors this property access — if you read it through an indirect reference or skip it (e.g. early return on URL param), the indicator stays red.
- **CRITICAL BUG**: URL params like `?lang=ru` (which Yandex itself adds) must NOT cause early return before SDK is read. Always read SDK first:
  ```typescript
  // lang.ts
  let LANG: 'ru' | 'en' = detectLangFallback(); // browser fallback at module load

  // Called after YaGames.init() — receives ysdk object directly
  function refreshLang(ysdk?: any): void {
    try {
      const sdkLang: string | undefined = ysdk?.environment?.i18n?.lang; // Yandex detects this access
      if (sdkLang) {
        LANG = ['ru', 'be', 'kk', 'uk', 'uz'].includes(sdkLang) ? 'ru' : 'en';
        return;
      }
    } catch {}
    LANG = detectLangFallback(); // fallback only if SDK unavailable
  }

  function detectLangFallback(): 'ru' | 'en' {
    const urlLang = new URLSearchParams(window.location.search).get('lang');
    if (urlLang === 'ru') return 'ru';
    if (urlLang === 'en') return 'en';
    return navigator.language.startsWith('ru') ? 'ru' : 'en';
  }
  ```
  ```typescript
  // main.ts — pass ysdk directly, not window.ysdk
  const ysdk = await YaGames.init();
  (window as any).ysdk = ysdk;
  refreshLang(ysdk); // ← ysdk object, not (window as any).ysdk
  ```
- Why: Yandex Browser's `navigator.language` is always `'ru'` regardless of platform language
- Map CIS languages (be, kk, uk, uz) to Russian if no dedicated translation
- Detect language AFTER SDK init (not before) — Rule 2.14

### Required Languages
- Minimum: English (`en`) and Russian (`ru`) — Rule 2.10
- ALL visible text must be localized — no hardcoded strings
- Common missed spots: HUD badges, tooltips, floating combat text (`+10 HP`, `Critical!`), error messages, achievement/skill/mutation names, sitelock messages

### Name Consistency (Rule 5.1.3)
- Game name must be **identical** in the game itself AND all draft materials (title fields, promo images)
- Must be unique within the Yandex catalog across all selected languages (Rule 5.12)
- Do NOT translate the game name to Russian unless the draft title is also in Russian

---

## 7. Technical Requirements (Rules 1.6-1.24)

### Mobile (Rules 1.6.1.*)
- **1.6.1.1** Fullscreen mode during gameplay
- **1.6.1.2** Keyboard auto-appears on input field focus
- **1.6.1.3** Elements don't distort with orientation/size changes
- **1.6.1.5** Entirely gesture-controlled (no keyboard-only actions)
- **1.6.1.6** No system media players in any browser
- **1.6.1.7** No WebGL warnings
- **1.6.1.8** Long-tap doesn't trigger selection or context menu

### Desktop (Rules 1.6.2.*)
- **1.6.2.1** Active game field stretches to screen edge (excluding sticky banners)
- **1.6.2.2** Aspect ratio doesn't exceed 1:2
- **1.6.2.3** No disproportionate element distortion on resize
- **1.6.2.4** Keyboard/mouse control by default
- **1.6.2.6** No hotkeys conflicting with OS/browser (Ctrl+W, F5, etc.)
- **1.6.2.7** Interaction doesn't trigger text selection or context menu

### Display & Layout (Rules 1.10.*)
- **1.10.1** Game field doesn't exceed screen bounds; no clipped elements
- **1.10.2** No browser scrollbars or swipe-to-refresh
- **1.10.3** Elements don't overlap or obscure each other
- **1.10.4** One-handed control possible; main scene accessible without extra scrolling

### Phaser Scaling For Moderation (PRACTICAL)
- For Phaser landscape games targeting Yandex moderation, prefer `Phaser.Scale.RESIZE` over `FIT` when possible. `FIT` often leaves letterbox bars on unusual aspect ratios and can trigger complaints under desktop rule **1.6.2.1** ("active game field stretches to screen edge").
- Keep the canvas edge-to-edge via CSS `width: 100%; height: 100%; overflow: hidden; position: fixed;`, but preserve the old gameplay framing by compensating with camera zoom based on the current viewport.
- Treat world rendering and HUD separately:
  - world camera may adapt `zoom`
  - UI camera should usually stay at `zoom = 1`, `scroll = 0`
  - scale and anchor HUD from the real viewport size, not from a virtual `1280x720` camera
- If you convert an existing `FIT 1280x720` Phaser game to `RESIZE`, verify all of these manually:
  - player framing still matches the pre-change feel
  - HUD corners stay pinned to the real screen edges
  - minimap and bottom-row items do not drift off-screen
  - no letterboxing remains on desktop ultrawide and narrow laptop sizes
- Do not "solve" edge-to-edge by stretching sprites non-uniformly. Preserve aspect ratio and adapt layout/zoom instead.

### Browser Scrolling & Swipe-to-Refresh (Rule 1.10.2)
```css
html, body {
  overflow: hidden;
  position: fixed;
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
  touch-action: none;
  overscroll-behavior: none;
}
*::-webkit-scrollbar { display: none; }
* { scrollbar-width: none; -ms-overflow-style: none; }
#root { overflow: hidden; position: fixed; width: 100%; height: 100%; }
```
```js
document.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
document.addEventListener('wheel', e => e.preventDefault(), { passive: false });
```
**AVOID `h-screen` / `100vh`** — includes browser chrome, causes overflow. Use `h-full` / `100%`.

### Context Menu & Selection (Rule 1.6.2.7)
- CSS: `user-select: none` on `*`, body, canvas, and game container
- CSS: `-webkit-touch-callout: none` on body and canvas
- CSS: `-webkit-tap-highlight-color: transparent` on `*`
- JS: `onContextMenu={e => e.preventDefault()}` on root game element and canvas

### Architecture & Files
- **1.7** No hardcoded absolute URLs to Yandex S3 servers
- **1.9** Internal progress saves immediately after player action; page refresh preserves data
- **1.11** Cloud saves must be declared in draft form checkbox
- **1.15** Finished appearance — not in development or beta testing phase
- **1.21** Uncompressed game files max **100 MB**
- **1.22** `index.html` at archive root; **no spaces or Cyrillic** in filenames
- **1.23** No interactive AI (chat, generation); pre-generated AI content is allowed
- **1.24** Updates must preserve core concept; complete game substitution forbidden

### Platform Compatibility (Rule 1.20)
Must work correctly on:
- Browsers: Yandex Browser, Chrome, Firefox, Opera, Safari
- Desktop: Windows Vista/7/8/10, macOS 10.6+
- Mobile: Android 5.0+, iOS 9.0+
- TV: Android TV (if selected)

### Authentication (Rules 1.2.*)
- No third-party registration/authorization required
- Yandex ID auth only after explicit user action with clear explanation (Rule 1.2.1)
- Guest mode or play-without-auth option required with progress saving (Rule 1.2.2)

### Payments (Rules 1.4, 1.13.*)
- Payments only through Yandex Games SDK (Rule 1.4)
- Consumption method implemented (1.13.1)
- Currency follows SDK standards (1.13.2)
- Progress syncs server-side across devices (1.13.3)
- All purchases show numeric cost and currency (1.13.4)

### In-App Purchases Implementation Notes (MANDATORY IF USED)
- Preload payments with `const payments = await ysdk.getPayments().catch(() => null)` after SDK init. Store the object somewhere accessible.
- On startup always call `payments.getPurchases().catch(() => [])` and restore ownership before the first purchasable item is shown.
- For **non-consumable** purchases (for example, permanent unlocks like `disable_ads` or a unique divine relic):
  - use `payments.purchase({ id })`
  - on success, grant the unlock immediately
  - on every future startup, re-check `getPurchases()` and reapply the unlock if the product is present
  - do **not** call `consumePurchase()`
- For **consumable** purchases (currency packs, boosters):
  - after `payments.purchase({ id })`, credit the reward first
  - save the updated player state
  - only then call `payments.consumePurchase(purchase.purchaseToken)`
- **CRITICAL**: Unprocessed purchases are moderation-sensitive. If a purchase can remain pending or uncredited after network issues, you must handle it through `getPurchases()` on startup.
- Purchase buttons and cards must display a clear numeric price and currency in the game UI, not only inside the Yandex payment dialog.
- If a product is unique and one-time, make sure the same premium item no longer spawns/offers after ownership is detected.
- Localhost often won't exercise the full purchase dialog. Final testing should happen in Yandex draft preview or the official local launch flow with purchases enabled.

---

## 8. User Experience Requirements (Rules 2.1-2.14)

- **2.1** Polished in content, usability, and gameplay quality
- **2.2** Complete control instructions in-game or in draft "How to Play" field
- **2.3** Genre alignment with selected categories
- **2.4** Meets minimum gameplay mechanics criteria
- **2.6** Progress saving for story/level games; high-score saving for endless/score games
- **2.7** Age rating tag matches content
- **2.8** Progressive difficulty and clear narrative/setting
- **2.9** Main content playable **10+ minutes**. Examples: casual 10-20 levels, multi-theme 15-20 questions each, puzzle tasks. Quizzes require 100+ non-duplicate questions.
- **2.13** Games with rating below 30 for 3 weeks get removed

---

## 9. Player Data & Cloud Saves (RECOMMENDED)

- `ysdk.getPlayer({ signed: false })` → get player object (20 req/5min limit)
- `player.setData(data, flush)` → save (200KB limit, 100 req/5min)
- `player.getData(keys?)` → load (100 req/5min)
- `player.setStats(stats)` / `player.getStats(keys?)` → numeric stats (10KB, 60 req/min)
- `player.incrementStats(increments)` → atomic increment
- Save to BOTH localStorage and cloud (localStorage for speed, cloud for persistence)
- On startup: load from cloud, compare timestamps with local, use newer
- **iOS iframe**: `localStorage` can be wiped — use `ysdk.getStorage()` for safe storage
- `player.isAuthorized()` → check if user is logged in
- `ysdk.auth.openAuthDialog()` → prompt login

---

## 10. Game Rating (STRONGLY RECOMMENDED)

- `ysdk.feedback.canReview()` → returns `{ value: boolean, reason?: string }`
- `ysdk.feedback.requestReview()` → returns `{ feedbackSent: boolean }`
- Call at a positive moment: new high score, achievement unlock
- **Once per session maximum**
- Always call `canReview()` before `requestReview()`
- Rejection reasons: `NO_AUTH`, `GAME_RATED`, `REVIEW_ALREADY_REQUESTED`, `REVIEW_WAS_REQUESTED`, `UNKNOWN`

---

## 11. Desktop Shortcut (RECOMMENDED)

- `ysdk.shortcut.canShowPrompt()` → returns `{ canShow: boolean }`
- `ysdk.shortcut.showPrompt()` → returns `{ outcome: string }`
- Show a button in menu/game over screen when `canShow` is true
- `outcome === 'accepted'` means shortcut was added

---

## 12. Promo Materials & Draft Form (REQUIRED — Rules 5.*, 8.*)

### Draft Form — Per-Language Text Fields

Each supported language (minimum EN + RU) requires ALL of these:

| Field | Min | Max | Notes |
|-------|-----|-----|-------|
| **Название** (Name) | — | 50 chars | Identical across languages unless draft specifies different names |
| **Описание для SEO** (SEO description) | 50 | 160 chars | Concise pitch with keywords |
| **Об игре** (About the game) | 100 | 1000 chars | Features, mechanics, what makes it fun |
| **Как играть** (How to play) | 100 | 1000 chars | Step-by-step instructions + tips |
| **Ключевые слова** (Keywords) | — | 100 chars | Lowercase, comma-separated |

- Tags: max 20 total, must match game theme (Rule 5.4)
- Categories: max 2 selectable (Rule 5.2)
- No repeated symbols (spaces, dashes) for character minimums (Rule 5.11)
- No duplicate text across different fields (Rule 5.11)
- Descriptions must reflect actual mechanics; no misleading content (Rule 8.2.2)
- Correct spelling/punctuation per language (Rule 8.2.1)

### Draft Form — Global Fields (shared across all languages, NOT translated)

These fields appear ONCE in the draft form and apply to the entire game:

| Field | Notes |
|-------|-------|
| **Игра переведена на / Languages** | Select all supported languages (minimum: Русский + Английский) |
| **Возрастной рейтинг / Age Rating** | Select appropriate rating: 0+, 6+, 12+, 16+, 18+ (Rule 2.7) |
| **Категории / Categories** | Select up to **2** categories that match the game genre (Rule 5.2). Examples: Приключения, Стратегии, Головоломки, Аркады, Для двоих, Гонки, Спортивные |
| **Теги / Tags** | Select up to **20** tags from Yandex's predefined list. Must match game theme (Rule 5.4). Same tags for all languages — NOT translated. |
| **Ключевые слова / Keywords** | Comma-separated, lowercase. Same for all languages — NOT translated. Max 100 chars. Example: `roguelike, dungeon, terminal, ascii, turn-based, rpg` |
| **Игра использует облачные сохранения / Cloud Saves** | Checkbox — only enable if you implemented `player.setData()`/`player.getData()` (Rule 1.11) |
| **Отсроченная публикация / Deferred Publication** | Optional — schedule publication for a future date instead of publishing immediately after moderation |
| **Комментарий разработчика / Developer Comment** | Optional free-text note to moderators (e.g., explaining game mechanics, known limitations, or changes since last submission) |

**IMPORTANT**: Tags, keywords, and categories are the SAME across all languages. Only the text fields (name, SEO description, about, how to play) and visual assets (screenshots, cover) need per-language versions.

### Required Visual Assets — PER LANGUAGE

The Yandex draft form has separate media sections for each language. Upload to the matching language tab.

| Asset | Dimensions | Format | Per-Language? | Rules |
|-------|-----------|--------|--------------|-------|
| **Icon** | 512x512 | PNG | Can share via "use Russian value" | NOT a screenshot; no game UI (Rule 5.6, 8.3.4). **Icon must contain ONLY the game title text on a solid/gradient background — no gameplay imagery, no background art, no subtitles.** |
| **Maskable Icon** | 512x512 | PNG | Can share | Critical elements in circular safe zone; test at maskable.app. Same rule: **game title text only, no background art.** |
| **Cover** | 800x470 | PNG | **YES — each language needs one** | NOT a screenshot; no game UI; branded art (Rule 5.6, 8.3.4) |
| **Screenshots (desktop)** | 1280-2560px long side, 16:9 | JPEG or 24-bit PNG | **YES** | Real gameplay 70%+; game HUD OK (Rule 5.1.1.2) |
| **Screenshots (mobile portrait)** | 1280-2560px long side, 9:16 | JPEG or 24-bit PNG | **YES** | Same rules; only if game supports portrait |
| **Screenshots (mobile landscape)** | 1280-2560px long side, 16:9 | JPEG or 24-bit PNG | **YES** | Same rules |
| **Video horizontal** | 1920x1080 (min 1280x720), 16:9 | MP4 | Optional | Max 28s, max 100MB, 70%+ gameplay (Rule 5.1.1.3) |
| **Video vertical** | 1080x1920 (min 720x1280), 9:16 | MP4 | Optional | Same specs |
| **Advertising videos** | Same as above | MP4 | Optional | Up to 20 videos |

### Media Quality Rules (Rules 8.3.*)
- **8.3.1** High technical quality — no compression artifacts, no excessive darkening, no monochrome frames, no clipped text. Use PNG, not JPEG for covers/icons.
- **8.3.2** Materials must represent the actual game, not arbitrary imagery
- **8.3.3** No frames or rounded corners on any asset
- **8.3.4** No system UI (status bar, battery indicator) or Yandex UI (badges, ratings). Game HUD (health bars, score) is OK in screenshots but **PROHIBITED on icons and covers**.
- **8.3.5-8.3.7** Content must be safe, ethical, appropriate for all ages

### Content Rules (Rules 5.*)
- **5.1.1.1** No cross-game or duplicate promo materials
- **5.1.1.2** Screenshots: real gameplay occupying **70%+** of image area
- **5.1.1.3** Videos: real gameplay occupying **70%+** of duration
- **5.1.2** Materials must demonstrate game essence, features, or uniqueness
- **5.1.3** Game title **identical** in-game and in all draft materials across all languages
- **5.6** Icon and cover **CANNOT be screenshots**. Styled game art with overlays is acceptable; raw gameplay captures are not. **Icons specifically must contain ONLY the game title text on a plain solid/gradient background — no gameplay imagery or background art at all.**
- **5.9** Black borders acceptable only if part of game design (not scaling artifacts)

### Recommended Promo Directory Structure

```
yandex_promo/
├── en/
│   ├── cover_800x470.png          # Cover for EN language tab
│   ├── icon_512x512.png           # Icon for EN tab (or share from RU)
│   ├── desktop_1.png              # 1600x900 gameplay EN
│   ├── desktop_2.png              # 1600x900 different moment
│   ├── mobile_1.png               # 900x1600 gameplay EN
│   └── mobile_2.png               # 900x1600 different moment
├── ru/
│   ├── cover_800x470.png          # Cover for RU language tab
│   ├── icon_512x512.png           # Icon for RU tab
│   ├── desktop_1.png              # 1600x900 gameplay RU
│   ├── desktop_2.png              # 1600x900 different moment
│   ├── mobile_1.png               # 900x1600 gameplay RU
│   └── mobile_2.png               # 900x1600 different moment
├── icon_maskable_512x512.png      # Shared maskable icon
├── video_horizontal.mp4           # Optional — 16:9, max 28s
└── video_vertical.mp4             # Optional — 9:16, max 28s
```

### Icon Corner Fix (Rule 8.3.3 — NO rounded corners)

Icons generated via canvas/CSS or design tools often have rounded corners via `border-radius` or alpha-channel transparency. Yandex REJECTS icons with rounded corners. **Always flatten icons to RGB with solid background.**

```python
# Fix rounded-corner icons: flatten RGBA transparency onto solid background
from PIL import Image

icon = Image.open("yandex_promo/icon_512x512.png").convert("RGBA")
# Sample background color from visible area of the icon
bg_color = icon.getpixel((80, 80))[:3]  # or hardcode e.g. (11, 22, 34)
bg = Image.new("RGBA", (512, 512), bg_color + (255,))
bg.paste(icon, (0, 0), icon)  # alpha-composite
result = bg.convert("RGB")    # drop alpha channel entirely
result.save("yandex_promo/icon_512x512.png", "PNG")
# Verify: mode must be RGB, corners must be opaque
```

**Validation check** (add to pre-submission):
```python
from PIL import Image
img = Image.open("icon_512x512.png")
assert img.mode == "RGB", f"Icon must be RGB, got {img.mode} (has transparency = rounded corners)"
assert img.size == (512, 512), f"Icon must be 512x512, got {img.size}"
```

---

## 13. Automated Screenshots (Puppeteer)

### Setup
- Install: `npm install --save-dev puppeteer` (remove after use)
- Intercept `/sdk.js` on localhost — return empty script:
  ```js
  page.on('request', req => {
    if (req.url().includes('/sdk.js'))
      req.respond({ status: 200, contentType: 'application/javascript', body: '// no SDK' });
    else req.continue();
  });
  ```
- Set `protocolTimeout: 120000` for longer capture sessions
- Skip tutorials via localStorage injection before page load:
  ```js
  await page.evaluateOnNewDocument(saveJSON => {
    localStorage.setItem('game_save_key', saveJSON);
  }, JSON.stringify(saveData));
  ```

### Language Spoofing
For non-default languages, spoof `navigator.language` BEFORE page load:
```js
await page.evaluateOnNewDocument(() => {
  Object.defineProperty(navigator, 'language', { get: () => 'ru-RU' });
  Object.defineProperty(navigator, 'languages', { get: () => ['ru-RU', 'ru'] });
});
```
Setting language after load won't work for canvas games — the frame is already drawn.

### Gameplay Tips for Visually Rich Screenshots
- Use defensive skill builds (high regen/defense, no offensive skills) so the heart survives long enough while enemies accumulate on screen for visual density
- Capture at 30s and 36s for two distinct game moments
- Each screenshot needs a fresh page (new tab) — language spoofing is per-page
- Click center of page twice (2s apart) to start the game past any menus

### Capture 8 Screenshots (4 EN + 4 RU)
```
EN: desktop_1 (1600x900, 30s), desktop_2 (1600x900, 36s)
EN: mobile_1 (900x1600, 30s), mobile_2 (900x1600, 36s)
RU: desktop_1 (1600x900, 30s), desktop_2 (1600x900, 36s)
RU: mobile_1 (900x1600, 30s), mobile_2 (900x1600, 36s)
```

### Cover Generation via Puppeteer
Render an HTML page with:
- Gameplay screenshot as full-bleed background (base64 encoded)
- Dark vignette gradient overlay
- Game title in branded font (e.g., Space Grotesk Bold) with glow effect
- Capture at 800x470 (cover) and 512x512 (icon)

---

## 14. Multiplayer & External Server Connections (CSP)

### The Problem
Yandex Games enforces a strict Content Security Policy (CSP) on the game iframe. The `connect-src` directive only allows connections to `*.yandex.*` domains and specific analytics/ad partners. **All WebSocket (`wss://`) and HTTP (`https://`) connections to external game servers are silently blocked by the browser.**

### How to Check CSP
```bash
curl -sI "https://yandex.ru/games/app/YOUR_APP_ID" | grep -i content-security-policy
```
Look at the `connect-src` directive — your server domain must be listed.

### How to Whitelist Your Server
In the **Yandex Games Console** → your game → **Settings** tab:
1. Find the field for adding external hosts
2. Add your server domain (e.g., `my-game-server.onrender.com`)
3. Explain the reason (e.g., "Multiplayer game server — WebSocket connections for real-time gameplay")
4. After saving, Yandex adds the domain to the CSP `connect-src` for your game's iframe

**CRITICAL**: This is required for BOTH `wss://` WebSocket AND `https://` HTTP connections. Without it, `new WebSocket('wss://your-server.com')` and `fetch('https://your-server.com')` both fail silently.

### Free-Tier Server Sleep (Render.com, Railway, etc.)
Free hosting tiers (e.g., Render.com) sleep after ~15 minutes of inactivity. WebSocket connections alone may not wake the server.

**Pattern: HTTP wake-up ping + extended WebSocket retries**
```js
// Fire-and-forget HTTP ping to wake sleeping server
try { fetch(httpHealthUrl, { mode: 'cors' }).catch(() => {}); } catch(_) {}
// Start WebSocket connection attempts immediately (will retry)
connectToServer(); // retry up to 20 times (~60s) for cold start
```

WebSocket `onclose` handler should retry with increasing attempts:
```js
ws.onclose = () => {
  if (reconnectAttempts > 20) { showError('Server offline'); return; }
  reconnectAttempts++;
  setTimeout(() => connectToServer(), 3000);
};
```

### Multiplayer Performance on Yandex
- **Input throttling**: Send client inputs at 20Hz max (not every frame). Skip duplicate inputs:
  ```js
  const INPUT_INTERVAL = 50; // ms
  let lastInputStr = null, lastInputTime = 0;
  function sendInput(input) {
    const str = JSON.stringify(input);
    const now = Date.now();
    if (str === lastInputStr && now - lastInputTime < INPUT_INTERVAL) return;
    lastInputStr = str; lastInputTime = now;
    socket.send(str);
  }
  ```
- **Entity interpolation**: Lerp remote entities toward server positions (0.3-0.4 factor). Snap if delta > 50px.
- **Server payload optimization**: Use dirty flags — only send doors/caught/events when changed. Skip default field values (e.g., `hiding: false`). Pre-stringify the state message once, send to all clients.
- **CORS headers**: Server must send `Access-Control-Allow-Origin: *` on HTTP endpoints for wake-up pings from the Yandex iframe.

### Server-Side Disconnect Handling
When a player's WebSocket closes during gameplay:
- **Human players**: Kill the entity (set `alive = false`) so the game continues naturally
- **Creature/critical role**: Convert to bot AI so remaining players aren't stuck
- **Lobby phase**: Remove from player list, cancel countdown if below minimum

---

## 15. Links & External Content (Rules 8.4.*)

- **8.4.1** Only SDK-embedded links permitted; must navigate to your games in the catalog
- **8.4.2** No external resource links (creator sites, app stores, studios, partners, downloads)
- **8.4.3** Social media links allowed ONLY if: community dedicated to developer's catalog games, titled "Yandex Games", free of external links
- **8.4.4** No auto-redirects or external resource recommendations
- **1.18** No technical URL-based game restrictions (domain locks are forbidden)

---

## 16. Common Rejection Reasons

| Code | Issue | Fix |
|------|-------|-----|
| — | "Game was not loading" | External CDN (Google Fonts) blocked in Russia — self-host all assets |
| — | Infinite loading overlay | `LoadingAPI.ready()` missing from error/catch path |
| 1.3 | Sound continues when minimized | Mute on `game_api_pause`; resume on `game_api_resume` |
| 1.6.1.8 | Long-tap triggers selection on mobile | CSS `-webkit-touch-callout: none`; `-webkit-user-select: none` |
| 1.6.2.1 | Game doesn't stretch to screen edge | Use `width: 100%; height: 100%`; avoid fixed dimensions |
| 1.6.2.7 | Text selection / context menu | CSS `user-select: none` + JS `onContextMenu` prevention |
| 1.10.2 | Browser scrollbar / swipe-to-refresh | CSS `overflow: hidden`, `position: fixed`, `overscroll-behavior: none` |
| 1.14 | Console errors / unhandled rejections | Strip console in prod; `.catch()` all SDK promises; ErrorBoundary |
| 1.15 | Game looks unfinished / beta | Polish UI, remove debug elements, placeholder art |
| 1.19 | SDK usage doesn't match docs | Follow exact init pattern; call LoadingAPI.ready() before gameplay |
| 1.21 | Archive > 100MB uncompressed | Optimize assets; compress images; remove unused files |
| 1.22 | Bad filenames in archive | No spaces, no Cyrillic; `index.html` at root |
| 2.9 | Less than 10 min playable content | Add more levels, questions, or gameplay depth |
| 2.14 | i18n indicator stays red | Pass ysdk object directly to refreshLang — read `.i18n.lang` from it, not via window.ysdk; URL param like `?lang=ru` must NOT cause early return before SDK read |
| 4.4 | Ads during gameplay | Only show at logical pauses (restart, between levels) |
| 4.7 | Sound/gameplay not paused during ads | Pause + mute in `onOpen`, resume in `onClose` |
| 5.1.1.2 | Screenshots < 70% gameplay | Active gameplay with HUD; no loading/Game Over/menus |
| 5.1.3 | Game name mismatch | Identical name in-game, in draft title, and in all materials |
| 5.6 | Screenshot used as icon/cover | Icons/covers must be branded art, not raw screenshots |
| 8.2.3 | Untranslated text visible | Localize ALL strings; verify both EN and RU |
| 8.3.1 | Cover/media quality — artifacts | Use PNG (not JPEG); no AI-generated art with artifacts |
| 8.3.3 | Frames or rounded corners on assets | Ensure edge-to-edge content on all promo materials |
| 8.3.4 | System UI in screenshots | No status bar, battery, phone frame; no Yandex badges |
| — | Multiplayer / external server not connecting | CSP `connect-src` blocks external domains — add host in Console Settings tab |
| — | WebSocket silently fails (no error visible) | CSP blocks `wss://` connections; check browser DevTools Network tab for blocked requests |
| — | Game freezes / "X is not a function" | Variable shadowing — local `const t` shadows global `t()` function in single-file games |
| — | JS/assets 404 despite correct ZIP structure | ZIP created with PowerShell on Windows — backslash path separators (`assets\x.js`) not recognized on Linux servers. Use Python to create ZIP (Section 18) |

---

## 17. MANDATORY Pre-Submission Validation (BLOCKING — DO NOT SKIP)

**STOP. You MUST complete ALL validation steps below before packaging ANY Yandex build. Do NOT proceed to Section 18 (Build & Submit) until every check passes. If any check fails, fix the issue first. Report all results to the user before packaging.**

### 17.0 Automated Code Validation Script

Run this validation script against the build entry file (index.html or dist/index.html). **Every check must pass.**

```bash
#!/bin/bash
FILE="index.html"  # or dist/index.html for Vite builds
echo "=== YANDEX PRE-SUBMISSION VALIDATION ==="

check() {
  local label="$1" val="$2" op="$3" expected="$4"
  local result="FAIL"
  case "$op" in
    eq0)  [ "$val" = "0" ] && result="PASS" ;;
    gt0)  [ "$val" -gt 0 ] 2>/dev/null && result="PASS" ;;
    le1)  [ "$val" -le 1 ] 2>/dev/null && result="PASS" ; [ "$result" = "FAIL" ] && result="WARN" ;;
  esac
  echo "[$result] $label: $val ($expected)"
}

cnt() { local n; n=$(grep -c "$1" "$FILE" 2>/dev/null) || true; echo "${n:-0}"; }

check "Console statements"         "$(cnt 'console\.')" eq0 "must be 0"
check "External CDN refs"          "$(cnt 'googleapis\|cdnjs\|unpkg\|jsdelivr\|cloudflare')" eq0 "must be 0"
check "SDK relative path"          "$(cnt 'src=\"/sdk.js\"')" gt0 "must be >0"
check "LoadingAPI.ready()"         "$(cnt 'LoadingAPI.*ready')" gt0 "must be >0"
check "GameplayAPI start/stop"     "$(cnt 'GameplayAPI')" gt0 "must be >0"
check "game_api_pause handler"     "$(cnt 'game_api_pause')" gt0 "must be >0"
check "SDK i18n.lang detection"    "$(cnt 'i18n.*lang')" gt0 "must be >0"
check "navigator.language refs"    "$(cnt 'navigator\.language')" le1 "should be 0-1, fallback only"
check "100vh usage"                "$(cnt '100vh')" eq0 "must be 0"
check "Context menu prevention"    "$(cnt 'contextmenu')" gt0 "must be >0"
check "Scroll prevention"          "$(cnt 'overscroll-behavior\|overflow.*hidden')" gt0 "must be >0"

# Rewarded ad button — both languages must mention "ad"
AD_EN=$(cnt 'Watch Ad\|watch ad\|Ad:')
AD_RU=$(cnt 'Реклама\|реклама')
if [ "$AD_EN" -gt 0 ] 2>/dev/null && [ "$AD_RU" -gt 0 ] 2>/dev/null; then
  echo "[PASS] Rewarded ad button text: EN=$AD_EN RU=$AD_RU (both must be >0)"
else
  echo "[FAIL] Rewarded ad button text: EN=$AD_EN RU=$AD_RU (both must be >0)"
fi

echo "=== END VALIDATION ==="
```

### 17.0.1 Manual Code Inspection (REQUIRED)

After automated checks pass, **manually verify these patterns by reading the code**:

1. **LoadingAPI.ready() fires BEFORE gameLoop starts** (п. 1.19)
   - Search for `gameLoop()` call site — it must be AFTER `LoadingAPI.ready()`
   - The game must NOT be playable/interactive before LoadingAPI.ready()
   - If gameLoop starts independently (e.g., at page load), this is a **FAIL** — restructure startup to wait for SDK

2. **SDK language applied BEFORE first visible frame** (п. 2.14)
   - `applySdkLanguage()` (or equivalent using `ysdk.environment.i18n.lang`) must execute BEFORE `gameLoop()` starts
   - `navigator.language` fallback must ONLY run if SDK is unavailable (timeout/error)
   - If game renders any frame with browser language before SDK overrides it, this is a **FAIL**

3. **Rewarded video button clearly says "ad"** (п. 4.5.1)
   - The button/text triggering `showRewardedVideo` must contain words like "Watch Ad" / "Реклама" / "Ad:" in BOTH languages
   - AND must show the expected reward (e.g., "+1 AP", "+1 life")
   - A button that only says "Retry" or "Bonus" without mentioning "ad" is a **FAIL**

4. **All .catch() handlers on SDK promises** (п. 1.14)
   - Every `showFullscreenAdv`, `showRewardedVideo`, `showBannerAdv`, `getBannerAdvStatus`, `getPlayer`, `getData`, `setData` call must have `.catch()`
   - Missing catch = unhandled rejection in DevTools = **FAIL**

### 17.1 Pre-Submission Moderation Checklist

Run through this checklist **EVERY TIME** before uploading a build to Yandex:

### Code & Error Prevention (Rule 1.14)
- [ ] `grep -c 'console\.' dist/assets/*.js` returns **0** (console stripping active)
- [ ] ErrorBoundary wraps root `<App />` in entry file
- [ ] All SDK promise chains have `.catch()` handlers
- [ ] No `debugger` statements in production bundle
- [ ] No unhandled promise rejections (test with DevTools open)

### SDK Integration (Rules 1.1, 1.19)
- [ ] SDK loaded as `/sdk.js` (relative path): `grep 'sdk.js' dist/index.html`
- [ ] `LoadingAPI.ready()` called only when BOTH sdk AND boot are done (two-flag pattern)
- [ ] `LoadingAPI.ready()` called in ALL code paths including error/catch/timeout
- [ ] `GameplayAPI.start()` on gameplay begin; `GameplayAPI.stop()` on game over / overlay
- [ ] `game_api_pause` → `game.pause()` + GameplayAPI.stop(); `game_api_resume` → `game.resume()` + GameplayAPI.start()
- [ ] **VERIFY**: open with Yandex debug panel → click pause button → game must visually freeze
- [ ] Ads only shown at logical pauses, never during gameplay
- [ ] Sound mutes on ad open and `game_api_pause`; resumes on ad close and `game_api_resume` (Rule 4.7) — skip if no audio

### Assets & Dependencies
- [ ] No external CDN: `grep -c 'googleapis\|cdnjs\|unpkg\|jsdelivr' dist/index.html` = **0**
- [ ] All fonts self-hosted in `dist/fonts/`
- [ ] Uncompressed archive ≤ 100MB (Rule 1.21)
- [ ] `index.html` at archive root; no spaces/Cyrillic in filenames (Rule 1.22)

### Display & Input
- [ ] No browser scrollbars or swipe-to-refresh (Rule 1.10.2)
- [ ] Context menu disabled; no text selection (Rule 1.6.2.7)
- [ ] Game stretches to screen edge (Rule 1.6.2.1)
- [ ] No element overlap or clipping on resize (Rules 1.10.1, 1.10.3)
- [ ] Long-tap doesn't trigger selection on mobile (Rule 1.6.1.8)
- [ ] No `100vh` in game containers (use `100%`)

### Localization (Rules 2.10, 2.14)
- [ ] Language detection uses `ysdk.environment.i18n.lang` (not `navigator.language`)
- [ ] ALL visible text localized: HUD, buttons, floating text, achievements, errors
- [ ] Both EN and RU translations complete and spell-checked
- [ ] Game name identical across all languages and draft materials (Rule 5.1.3)

### Promo Materials (Rules 5.*, 8.*) — COMMON REJECTION SOURCE

**Automated promo validation** (run against `yandex_promo/` directory):
```bash
PROMO="yandex_promo"
echo "=== PROMO MATERIAL VALIDATION ==="
# Check required files exist
for LANG in en ru; do
  for F in cover_800x470.png icon_512x512.png; do
    [ -f "$PROMO/$LANG/$F" ] && echo "[PASS] $LANG/$F exists" || echo "[FAIL] $LANG/$F MISSING"
  done
  # Count screenshots
  DESK=$(ls "$PROMO/$LANG"/desktop_*.png 2>/dev/null | wc -l | tr -d ' ')
  MOB=$(ls "$PROMO/$LANG"/mobile_*.png 2>/dev/null | wc -l | tr -d ' ')
  echo "[$([ "$DESK" -ge 2 ] && echo "PASS" || echo "FAIL")] $LANG desktop screenshots: $DESK (need ≥2)"
  echo "[$([ "$MOB" -ge 2 ] && echo "PASS" || echo "FAIL")] $LANG mobile screenshots: $MOB (need ≥2)"
done
# Check icon dimensions (must be exactly 512x512 with sharp corners)
for ICON in "$PROMO"/*/icon_512x512.png; do
  if command -v sips &>/dev/null; then
    DIM=$(sips -g pixelWidth -g pixelHeight "$ICON" 2>/dev/null | awk '/pixel/{print $2}' | tr '\n' 'x')
    echo "[INFO] $ICON dimensions: $DIM (must be 512x512)"
  fi
done
echo "=== END PROMO VALIDATION ==="
```

**Visual inspection checklist** (CANNOT be automated — agent MUST open and verify each image):
- [ ] **Cover (800x470 PNG)** exists in BOTH `en/` and `ru/` directories
- [ ] **Cover title matches game name EXACTLY** per language (Rule 5.1.3) — if draft EN name is "Merge Conquest", cover must say "Merge Conquest" not "MERGE CONQUEST" or a translation
- [ ] **Icon (512x512 PNG)** — **NO rounded corners, NO border radius** (Rule 8.3.3). Export as square PNG with sharp 90° corners. If generating icons with canvas/CSS, ensure `border-radius: 0`
- [ ] **Maskable icon (512x512 PNG)** exists with safe zone
- [ ] Cover and icon are NOT screenshots; no game HUD on them (Rules 5.6, 8.3.4)
- [ ] **Icon contains ONLY game title text** on solid/gradient background — no gameplay imagery or background art
- [ ] All promo images: clean PNG, no JPEG compression artifacts (Rule 8.3.1)
- [ ] No frames, rounded corners, system UI, or Yandex badges (Rules 8.3.3, 8.3.4)
- [ ] **Screenshots: 70%+ active gameplay** — not menus, not loading screens, not game over screens, not upgrade screens (Rule 5.1.1.2). HUD elements (health, score, turn counter) are OK and encouraged.
- [ ] **EN screenshots show ONLY English text; RU screenshots show ONLY Russian text** (Rule 8.2.3). Verify by zooming into every text element in each screenshot.
- [ ] No loading spinners, Game Over screens, or menus in screenshots
- [ ] **Screenshot language verification**: For canvas games, screenshots MUST be captured with the correct language active. Use Puppeteer language spoofing (Section 13) to ensure text renders in the correct language BEFORE capture.

### Draft Form Text
- [ ] Name: ≤50 chars, identical across languages
- [ ] SEO description: 50-160 chars per language
- [ ] About game: 100-1000 chars per language
- [ ] How to play: 100-1000 chars per language
- [ ] Keywords: ≤100 chars, lowercase, comma-separated
- [ ] Categories selected (max 2); tags selected (max 20)
- [ ] Cloud saves checkbox matches actual implementation

### Multiplayer / External Connections (if applicable)
- [ ] External server domain added in Yandex Games Console → Settings → External hosts
- [ ] Server CORS headers include `Access-Control-Allow-Origin: *`
- [ ] WebSocket connection has retry logic (20+ attempts for free-tier cold start)
- [ ] Client input throttled to ≤20Hz with duplicate detection
- [ ] Disconnect handling: human dies, creature becomes bot
- [ ] Test multiplayer from Yandex draft preview (not just localhost)

### Build & Package
- [ ] Fresh production build (`npx vite build`)
- [ ] **On Windows: create ZIP with Python, NOT PowerShell** (PowerShell produces backslash paths → 404 on Yandex Linux servers)
- [ ] Verify ZIP entries use forward slashes: `python -c "import zipfile; print(zipfile.ZipFile('game.zip').namelist()[:3])"`
- [ ] Zip structure: `index.html` + `assets/` at root (verify with `unzip -l game.zip | head`)

---

## 18. Build & Submit

### Vite-based games
1. `npx vite build`
2. Verify: `grep -c 'console\.' dist/assets/*.js` → 0
3. Create ZIP using Python (see below — **do NOT use PowerShell**)

### Single-file HTML games
1. Verify no CDN refs: `grep -c 'googleapis\|cdnjs\|unpkg\|jsdelivr' index.html`
2. Verify SDK is relative: `grep 'sdk.js' index.html`
3. Create ZIP using Python (see below)

### CRITICAL: ZIP Creation — Use Python, NOT PowerShell (Windows)

**PowerShell's `Compress-Archive` creates ZIP entries with backslash separators** (`assets\index.js`).  
Yandex servers run Linux — they require forward slashes (`assets/index.js`).  
ZIP with backslashes causes **404 on all JS/asset files** — game loads HTML but nothing else.

**ALWAYS use this Python script to create the ZIP on Windows:**

```python
# Run from project root: python make_zip.py
import zipfile, os

dist_dir = 'dist'
output_zip = 'game.zip'

with zipfile.ZipFile(output_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(dist_dir):
        for file in files:
            abs_path = os.path.join(root, file)
            # Always forward slashes in ZIP entries (Linux compatibility)
            rel_path = os.path.relpath(abs_path, dist_dir).replace(os.sep, '/')
            zf.write(abs_path, rel_path)

print(f'Created {output_zip}')
```

Or as a one-liner:
```bash
python -c "
import zipfile, os
with zipfile.ZipFile('game.zip', 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk('dist'):
        for f in files:
            p = os.path.join(root, f)
            zf.write(p, os.path.relpath(p, 'dist').replace(os.sep, '/'))
print('Done')
"
```

**Verify** that entries use forward slashes before uploading:
```bash
python -c "import zipfile; [print(n) for n in zipfile.ZipFile('game.zip').namelist()[:5]]"
# Should show: index.html, assets/index-xxx.js   (forward slashes)
# NOT:         assets\index-xxx.js               (backslashes = BAD)
```

On Linux/macOS the standard `zip` command is fine:
```bash
cd dist && zip -r ../game.zip .
```

### Upload
1. Upload zip to Yandex Games Console
2. Test in Yandex preview environment before submitting for moderation
3. Moderation takes 3-5 working days
4. **Warning "Обнаружена ссылка на сервисное хранилище"** — safe to ignore after switching to `/sdk.js`

---

## 19. Procedural Audio (Web Audio API — Zero Audio Files)

For games that need sound but want to minimize build size (Rule 1.21: max 100MB), all sounds can be generated procedurally via Web Audio API with zero audio files.

### AudioManager Pattern
```js
const AudioManager = {
  ctx: null, master: null, muted: false, initialized: false,
  volumes: { master: 0.7, sfx: 0.8, ambient: 0.5 },
  init() {
    if (this.initialized) return;
    this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.volumes.master;
    this.master.connect(this.ctx.destination);
    this.initialized = true;
  },
  ensure() { // Call on first user interaction (click/key)
    if (!this.initialized) this.init();
    if (this.ctx.state === 'suspended') this.ctx.resume();
  },
  // ... per-sound methods
};
```

### Common Procedural Sounds
| Sound | Technique |
|-------|-----------|
| Footsteps | Filtered noise burst (80ms), pitch varies by speed |
| Ambient drone | Low-freq oscillator (40-60Hz) + filtered noise, subtle pitch drift |
| Heartbeat | Two sine thuds (40Hz, 60ms apart), rate scales with danger |
| Door open/close | Noise sweep (low→high for open, high→low for close) |
| UI click | Short sine pip (800Hz, 30ms decay) |
| Growl/screech | Sawtooth + distortion + bandpass filter sweep |

### Spatial Audio
- Pan L/R based on sound source position relative to camera
- Volume falloff with distance (quadratic)
- Creature proximity modulates ambient drone intensity

### Yandex Compliance
- Lazy-init AudioContext on first user interaction (browser autoplay policy)
- **Must mute on `game_api_pause`** and ad `onOpen` callback (Rules 1.3, 4.7)
- Resume on `game_api_resume` and ad `onClose`
- Provide volume controls (master/sfx/ambient) and mute toggle (M key)

---

## 20. Type Definitions for SDK

```typescript
interface YandexSDK {
  features: {
    LoadingAPI?: { ready(): void };
    GameplayAPI?: { start(): void; stop(): void };
  };
  adv: {
    showFullscreenAdv(config: { callbacks: { onOpen?(), onClose?(wasShown: boolean), onError?(err: Error) } }): void;
    showRewardedVideo(config: { callbacks: { onOpen?(), onRewarded?(), onClose?(), onError?(err: Error) } }): void;
    getBannerAdvStatus(): Promise<{ stickyAdvIsShowing: boolean; reason?: string }>;
    showBannerAdv(): Promise<{ stickyAdvIsShowing: boolean }>;
    hideBannerAdv(): Promise<{ stickyAdvIsShowing: boolean }>;
  };
  environment: {
    app: { id: string };
    i18n: { lang: string; tld: string };
    payload?: string;
  };
  feedback: {
    canReview(): Promise<{ value: boolean; reason?: string }>;
    requestReview(): Promise<{ feedbackSent: boolean }>;
  };
  shortcut: {
    canShowPrompt(): Promise<{ canShow: boolean }>;
    showPrompt(): Promise<{ outcome: string }>;
  };
  getPlayer(opts?: { signed?: boolean }): Promise<YandexPlayer>;
  getStorage(): Promise<Storage>;
  auth: { openAuthDialog(): Promise<void> };
  on(event: string, callback: () => void): void;
  off(event: string, callback: () => void): void;
}

interface YandexPlayer {
  isAuthorized(): boolean;
  getUniqueID(): string;
  getName(): string;
  getPhoto(size: 'small' | 'medium' | 'large'): string;
  getData(keys?: string[]): Promise<Record<string, unknown>>;
  setData(data: Record<string, unknown>, flush?: boolean): Promise<void>;
  getStats(keys?: string[]): Promise<Record<string, number>>;
  setStats(stats: Record<string, number>): Promise<void>;
  incrementStats(increments: Record<string, number>): Promise<Record<string, number>>;
  getPayingStatus(): string;
  getIDsPerGame(): Promise<Array<{ appID: string; userID: string }>>;
  signature: string;
}
```
