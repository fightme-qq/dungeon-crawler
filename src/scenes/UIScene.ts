import Phaser from 'phaser';
import balance from '../data/balance.json';
import { TILE_WALL } from '../systems/DungeonGenerator';
import { t } from '../lang';

const MAX_HP = balance.player.hp;
const PAD    = 10;

// ── CrimsonFantasyGUI HP бар (CriticalDamage-Sheet.png) ──────────────────────
// 20 фреймов 64×16, фрейм 0 = полный, фрейм 19 = пустой
// Два слоя: пустой бар внизу + полный бар с setCrop сверху → плавное заполнение
const HP_SCALE       = 4;  // 64×4=256px широкий, 16×4=64px высокий
const BAR_H          = 16 * HP_SCALE;  // 64px
const FILL_SRC_START = 16; // источник x: до x=16 — сердце (не кропаем)
const FILL_SRC_W     = 48; // источник px: ширина зоны заполнения (x=16..63)
const FILL_SRC_H     = 16; // высота фрейма в источнике

// ── Ability hotkey icons ──────────────────────────────────────────────────────
const AB_SZ = 48;   // icon square size px
const MM_W = 150;
const MM_H = 150;

const REVEAL_RADIUS = 5;
const ENEMY_VISION  = 8;

// Tile colors
const C_FLOOR_DIM    = 0x333333;
const C_WALL_DIM     = 0x555555;
const C_FLOOR_BRIGHT = 0x777777;
const C_WALL_BRIGHT  = 0xaaaaaa;
const C_STAIR        = 0xddcc22;
const C_START        = 0x44aaff;
const C_PLAYER       = 0x44ff44;
const C_ENEMY        = 0xcc2222;

export class UIScene extends Phaser.Scene {
  private hpBarEmpty!:  Phaser.GameObjects.Sprite; // всегда виден (пустые слоты)
  private hpBarFill!:   Phaser.GameObjects.Sprite; // кропается по HP%
  private hpBarDamage!: Phaser.GameObjects.Sprite; // overlay — анимация урона
  private hpBarHeal!:   Phaser.GameObjects.Sprite; // overlay — анимация хила
  private hpCropW      = FILL_SRC_START + FILL_SRC_W; // текущая ширина crop в src px
  private hpText!:    Phaser.GameObjects.Text;
  private floorText!: Phaser.GameObjects.Text;
  private prevHp      = MAX_HP;
  private viewportW   = 1280;
  private viewportH   = 720;

  private coinIcons!: [Phaser.GameObjects.Image, Phaser.GameObjects.Image, Phaser.GameObjects.Image];
  private coinTexts!: [Phaser.GameObjects.Text,  Phaser.GameObjects.Text,  Phaser.GameObjects.Text];
  private coinY = 0;

  // Ability cooldown state (0 = ready, 1 = just used)
  private abCd = { q: 0, e: 0 };
  private abGfx!: Phaser.GameObjects.Graphics;
  private qIcon!: Phaser.GameObjects.Image;
  private eIcon!: Phaser.GameObjects.Image;
  private qLabel!: Phaser.GameObjects.Text;
  private eLabel!: Phaser.GameObjects.Text;
  private abQx = 0;
  private abEx = 0;
  private abY = 0;

  private statText!:  Phaser.GameObjects.Text;
  private statIcon!:  Phaser.GameObjects.Image;
  private arrowText!: Phaser.GameObjects.Text;
  private arrowIcon!: Phaser.GameObjects.Image;
  private armorText!: Phaser.GameObjects.Text;
  private armorIcon!: Phaser.GameObjects.Image;

  // Minimap data
  private tiles:    number[][] = [];
  private revealed: boolean[][] = []; // cumulative, never resets mid-floor
  private mapW = 0;
  private mapH = 0;
  private mmScale = 1;
  private stairTX = 0;
  private stairTY = 0;
  private startTX = 0;
  private startTY = 0;

  // Purchased item icons row
  private itemIconsRow: Phaser.GameObjects.Image[] = [];

  // Visibility this frame (radius 5 around player)
  private currentVisible = new Set<number>(); // encoded row*mapW+col
  private prevPlayerTile = -1;

  // Minimap gfx layers
  private exploredGfx!: Phaser.GameObjects.Graphics; // dim explored tiles — redraws on new reveals
  private visibleGfx!:  Phaser.GameObjects.Graphics; // bright current-view — redraws every frame
  private unitGfx!:     Phaser.GameObjects.Graphics; // player + enemies

  private minimapBorder!: Phaser.GameObjects.Rectangle;
  private minimapBg!: Phaser.GameObjects.Rectangle;
  private exploredDirty = false;

  private playerTX = 0;
  private playerTY = 0;
  private visibleEnemies: { tileX: number; tileY: number }[] = [];

  constructor() {
    super({ key: 'UIScene' });
  }

  private syncViewportSize() {
    this.viewportW = this.scale.gameSize.width;
    this.viewportH = this.scale.gameSize.height;
  }

  private getMinimapX() {
    return this.viewportW - PAD - MM_W;
  }

  private getMinimapY() {
    return this.viewportH - PAD - MM_H;
  }

  private layoutItemIconsRow() {
    if (this.itemIconsRow.length === 0) return;
    const SZ = 24;
    const GAP = 4;
    const totalW = this.itemIconsRow.length * (SZ + GAP) - GAP;
    const x0 = this.viewportW / 2 - totalW / 2;
    const y = this.viewportH - SZ / 2 - 2;
    this.itemIconsRow.forEach((ic, i) => {
      ic.setPosition(x0 + i * (SZ + GAP) + SZ / 2, y);
    });
  }

  private relayoutHud() {
    this.syncViewportSize();

    this.abY = this.viewportH - PAD - AB_SZ / 2;
    this.abQx = PAD + AB_SZ / 2;
    this.abEx = PAD + AB_SZ + 8 + AB_SZ / 2;

    this.hpBarEmpty.setPosition(PAD, PAD);
    this.hpBarFill.setPosition(PAD, PAD);
    this.hpBarDamage.setPosition(PAD, PAD);
    this.hpBarHeal.setPosition(PAD, PAD);
    this.hpText.setPosition(PAD + 8 * HP_SCALE, PAD + BAR_H / 2);

    this.coinY = PAD + BAR_H + 6;
    this.onCoinsChanged(this.registry.get('coinValue') ?? 0);

    this.qIcon.setPosition(this.abQx, this.abY);
    this.eIcon.setPosition(this.abEx, this.abY);
    this.qLabel.setPosition(this.abQx + AB_SZ / 2 - 2, this.abY + AB_SZ / 2 - 2);
    this.eLabel.setPosition(this.abEx + AB_SZ / 2 - 2, this.abY + AB_SZ / 2 - 2);

    this.floorText.setPosition(this.viewportW - PAD, PAD + BAR_H / 2);

    const mmX = this.getMinimapX();
    const mmY = this.getMinimapY();
    this.minimapBorder.setPosition(mmX + MM_W / 2, mmY + MM_H / 2);
    this.minimapBg.setPosition(mmX + MM_W / 2, mmY + MM_H / 2);

    const iconSz = 20;
    const rowH = iconSz + 4;
    const iconX = mmX - PAD - iconSz / 2;
    const textX = iconX - iconSz / 2 - 4;
    const armY = mmY + MM_H - iconSz / 2;
    const arwY = armY - rowH;
    const atkY = arwY - rowH;

    this.armorIcon.setPosition(iconX, armY);
    this.armorText.setPosition(textX, armY);
    this.arrowIcon.setPosition(iconX, arwY);
    this.arrowText.setPosition(textX, arwY);
    this.statIcon.setPosition(iconX, atkY);
    this.statText.setPosition(textX, atkY);

    this.layoutItemIconsRow();
  }

  private handleResize() {
    this.relayoutHud();
    this.exploredDirty = true;
  }

  create() {
    this.syncViewportSize();

    // Reset instance state that survives scene stop/launch (constructor doesn't re-run)
    this.itemIconsRow = [];

    // ── HP бар (CrimsonFantasyGUI CriticalDamage-Sheet) ─────────────────────
    // Нижний слой: пустой бар (фрейм 19) — всегда виден полностью
    this.hpBarEmpty = this.add.sprite(PAD, PAD, 'hp-bar', 19)
      .setScale(HP_SCALE).setOrigin(0, 0)
      .setScrollFactor(0).setDepth(100);
    // Верхний слой: полный бар (фрейм 0) — кропается до текущего HP%
    this.hpBarFill = this.add.sprite(PAD, PAD, 'hp-bar', 0)
      .setScale(HP_SCALE).setOrigin(0, 0)
      .setScrollFactor(0).setDepth(101);

    // Overlay анимации поверх бара (damage / heal) — ADD blend чтобы не скрывать бар
    this.hpBarDamage = this.add.sprite(PAD, PAD, 'hp-damage', 0)
      .setScale(HP_SCALE).setOrigin(0, 0).setScrollFactor(0).setDepth(103)
      .setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.hpBarHeal = this.add.sprite(PAD, PAD, 'hp-heal', 0)
      .setScale(HP_SCALE).setOrigin(0, 0).setScrollFactor(0).setDepth(103)
      .setBlendMode(Phaser.BlendModes.ADD).setVisible(false);
    this.hpBarDamage.on('animationupdate', () => this.hpBarDamage.setCrop(0, 0, this.hpCropW, FILL_SRC_H));
    this.hpBarHeal.on('animationupdate',   () => this.hpBarHeal.setCrop(0, 0, this.hpCropW, FILL_SRC_H));
    this.hpBarDamage.on('animationcomplete', () => this.hpBarDamage.setVisible(false));
    this.hpBarHeal.on('animationcomplete',   () => this.hpBarHeal.setVisible(false));

    // Текст HP — depth 104, выше overlays
    this.hpText = this.add.text(PAD + 8 * HP_SCALE, PAD + BAR_H / 2, `${MAX_HP}`, {
      fontSize: '14px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#000000', strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(104);

    // Coin display — below HP bar (icons hidden until player has that coin type)
    this.coinY = PAD + BAR_H + 6;
    const iconSz = 18;
    const bc = balance.coins;
    const coinFrames = [bc.redFrame, bc.goldFrame, bc.silverFrame] as const;
    this.coinIcons = coinFrames.map(frame =>
      this.add.image(0, 0, 'icons', frame)
        .setDisplaySize(iconSz, iconSz).setScrollFactor(0).setDepth(100).setVisible(false)
    ) as unknown as [Phaser.GameObjects.Image, Phaser.GameObjects.Image, Phaser.GameObjects.Image];
    this.coinTexts = coinFrames.map(() =>
      this.add.text(0, 0, '0', {
        fontSize: '11px', color: '#ffffff', stroke: '#000000', strokeThickness: 2,
      }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(101).setVisible(false)
    ) as unknown as [Phaser.GameObjects.Text, Phaser.GameObjects.Text, Phaser.GameObjects.Text];
    this.onCoinsChanged(this.registry.get('coinValue') ?? 0);

    // ── Ability icons (Q = lunge, E = arrow) ──────────────────
    {
      // Square icon sprites — no circle background
      this.qIcon = this.add.image(0, 0, 'icons', 1122)
        .setDisplaySize(AB_SZ, AB_SZ).setScrollFactor(0).setDepth(200);
      this.eIcon = this.add.image(0, 0, 'icons', 1124)
        .setDisplaySize(AB_SZ, AB_SZ).setScrollFactor(0).setDepth(200);

      // Cooldown overlay gfx (pie sweep drawn in update, over the square)
      this.abGfx = this.add.graphics().setScrollFactor(0).setDepth(201);

      // Key letters — bottom-right corner of each icon
      this.qLabel = this.add.text(0, 0, 'Q', {
        fontSize: '13px', fontStyle: 'bold', color: '#ffffff',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(1, 1).setScrollFactor(0).setDepth(202);
      this.eLabel = this.add.text(0, 0, 'E', {
        fontSize: '13px', fontStyle: 'bold', color: '#ffffff',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(1, 1).setScrollFactor(0).setDepth(202);
    }

    // Floor label
    this.floorText = this.add.text(0, 0, t().floor(1), {
      fontSize: '13px', color: '#ffffff', stroke: '#000000', strokeThickness: 3,
      backgroundColor: '#00000099', padding: { x: 6, y: 3 },
    }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(100);

    // Minimap frame
    this.minimapBorder = this.add.rectangle(0, 0, MM_W + 2, MM_H + 2, 0xaaaaaa)
      .setScrollFactor(0).setDepth(109);
    this.minimapBg = this.add.rectangle(0, 0, MM_W, MM_H, 0x000000)
      .setScrollFactor(0).setDepth(110);

    // Three gfx layers (all fixed to screen)
    this.exploredGfx = this.add.graphics().setScrollFactor(0).setDepth(111);
    this.visibleGfx  = this.add.graphics().setScrollFactor(0).setDepth(112);
    this.unitGfx     = this.add.graphics().setScrollFactor(0).setDepth(113);

    // Stats panel — left of minimap, top-aligned, each row: [number] [icon]
    {
      const iconSz  = 20;
      const rowH    = iconSz + 4;
      const iconX   = this.getMinimapX() - PAD - iconSz / 2;   // icon center X
      const textX   = iconX - iconSz / 2 - 4;    // text right edge

      // Bottom-aligned: armor at bottom, arrow above, sword at top
      const armY = this.getMinimapY() + MM_H - iconSz / 2;
      this.armorIcon = this.add.image(iconX, armY, 'icons', 1818)
        .setDisplaySize(iconSz, iconSz).setScrollFactor(0).setDepth(100);
      this.armorText = this.add.text(textX, armY, '10', {
        fontSize: '13px', fontStyle: 'bold', color: '#aaddff',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(100);

      const arwY = armY - rowH;
      this.arrowIcon = this.add.image(iconX, arwY, 'icons', 1788)
        .setDisplaySize(iconSz, iconSz).setScrollFactor(0).setDepth(100);
      this.arrowText = this.add.text(textX, arwY, '80', {
        fontSize: '13px', fontStyle: 'bold', color: '#ffdd88',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(100);

      const atkY = arwY - rowH;
      this.statIcon = this.add.image(iconX, atkY, 'icons', 670)
        .setDisplaySize(iconSz, iconSz).setScrollFactor(0).setDepth(100);
      this.statText = this.add.text(textX, atkY, '100', {
        fontSize: '13px', fontStyle: 'bold', color: '#ffdd88',
        stroke: '#000000', strokeThickness: 3,
      }).setOrigin(1, 0.5).setScrollFactor(0).setDepth(100);
    }

    this.onFloorChanged(this.registry.get('floor') ?? 1);
    this.onHpChanged(this.registry.get('playerHp') ?? MAX_HP, MAX_HP);
    const dungeonData = this.registry.get('dungeonData');
    if (dungeonData) this.onDungeonReady(dungeonData);

    // Restore purchased item icons that survived a floor transition
    const savedItems: { frame: number; name: string }[] = this.registry.get('purchasedItems') ?? [];
    for (const item of savedItems) this.onItemBought(item);

    this.game.events.on('playerHpChanged', this.onHpChanged,     this);
    this.game.events.on('floorChanged',    this.onFloorChanged,  this);
    this.game.events.on('dungeonReady',    this.onDungeonReady,  this);
    this.game.events.on('playerMoved',     this.onPlayerMoved,   this);
    this.game.events.on('coinsChanged',    this.onCoinsChanged,  this);
    this.game.events.on('abilityState',       this.onAbilityState,    this);
    this.game.events.on('playerStatsChanged', this.onStatsChanged,    this);
    this.game.events.on('itemBought',         this.onItemBought,      this);
    this.scale.on('resize', this.handleResize, this);

    this.relayoutHud();

    this.events.once('shutdown', () => {
      this.game.events.off('playerHpChanged',    this.onHpChanged,     this);
      this.game.events.off('floorChanged',       this.onFloorChanged,  this);
      this.game.events.off('dungeonReady',       this.onDungeonReady,  this);
      this.game.events.off('playerMoved',        this.onPlayerMoved,   this);
      this.game.events.off('coinsChanged',       this.onCoinsChanged,  this);
      this.game.events.off('abilityState',       this.onAbilityState,  this);
      this.game.events.off('playerStatsChanged', this.onStatsChanged,  this);
      this.game.events.off('itemBought',         this.onItemBought,    this);
      this.scale.off('resize', this.handleResize, this);
    });
  }

  update(_t: number, _delta: number) {
    // Redraw dim layer only when new tiles discovered
    if (this.exploredDirty) {
      this.redrawExplored();
      this.exploredDirty = false;
    }

    // Bright layer + units — every frame
    this.redrawVisible();
    this.redrawUnits();
    this.redrawAbilityCooldowns();
  }

  // ── Event handlers ────────────────────────────────

  private onHpChanged(current: number, max: number) {
    const pct        = Math.max(0, Math.min(1, current / max));
    this.hpCropW     = FILL_SRC_START + FILL_SRC_W * pct;
    this.hpBarFill.setCrop(0, 0, this.hpCropW, FILL_SRC_H);
    this.hpBarDamage.setCrop(0, 0, this.hpCropW, FILL_SRC_H);
    this.hpBarHeal.setCrop(0, 0, this.hpCropW, FILL_SRC_H);
    this.hpText.setText(`${Math.round(current)}`);

    if (current < this.prevHp) {
      this.hpBarDamage.setVisible(true).play('hp-damage-anim', true);
    } else if (current > this.prevHp) {
      this.hpBarHeal.setVisible(true).play('hp-heal-anim', true);
    }
    this.prevHp = current;
  }

  private onCoinsChanged(total: number) {
    const bc = balance.coins;
    const counts = [
      Math.floor(total / bc.redValue),
      Math.floor((total % bc.redValue) / bc.goldValue),
      total % bc.goldValue,
    ];
    const ICON_SZ  = 18;
    const GAP      = 4;  // px between icon+text groups
    const TEXT_GAP = 2;  // px between icon and number
    let curX = PAD;
    const midY = this.coinY + ICON_SZ / 2;
    for (let i = 0; i < 3; i++) {
      const visible = counts[i] > 0;
      this.coinIcons[i].setVisible(visible);
      this.coinTexts[i].setVisible(visible);
      if (visible) {
        this.coinIcons[i].setPosition(curX + ICON_SZ / 2, midY);
        this.coinTexts[i].setText(String(counts[i])).setPosition(curX + ICON_SZ + TEXT_GAP, midY);
        curX += ICON_SZ + TEXT_GAP + (this.coinTexts[i].width) + GAP;
      }
    }
  }

  private onFloorChanged(floor: number) {
    this.floorText?.setText(t().floor(floor));
  }

  private onDungeonReady(data: {
    tiles: number[][];
    mapWidth: number; mapHeight: number;
    stairTileX: number; stairTileY: number;
    startTileX: number; startTileY: number;
  }) {
    this.tiles   = data.tiles;
    this.mapW    = data.mapWidth;
    this.mapH    = data.mapHeight;
    this.stairTX = data.stairTileX;
    this.stairTY = data.stairTileY;
    this.startTX = data.startTileX;
    this.startTY = data.startTileY;
    this.mmScale = Math.min(MM_W / this.mapW, MM_H / this.mapH);

    // Reset fog — new floor
    this.revealed = Array.from({ length: this.mapH }, () =>
      new Array<boolean>(this.mapW).fill(false)
    );
    this.currentVisible.clear();
    this.prevPlayerTile = -1;

    this.exploredGfx.clear();
    this.visibleGfx.clear();
    this.exploredDirty = false;
  }

  private onPlayerMoved(data: {
    tileX: number; tileY: number;
    enemies: { tileX: number; tileY: number }[];
  }) {
    this.playerTX = data.tileX;
    this.playerTY = data.tileY;

    const ptx = Math.floor(data.tileX);
    const pty = Math.floor(data.tileY);

    // Only recompute visibility if player moved to a different tile
    const tileKey = pty * this.mapW + ptx;
    if (tileKey === this.prevPlayerTile) {
      // Still update enemy list
      this.updateEnemyList(data.tileX, data.tileY, data.enemies);
      return;
    }
    this.prevPlayerTile = tileKey;

    // Rebuild current visible set and accumulate revealed
    this.currentVisible.clear();

    for (let dy = -REVEAL_RADIUS; dy <= REVEAL_RADIUS; dy++) {
      for (let dx = -REVEAL_RADIUS; dx <= REVEAL_RADIUS; dx++) {
        if (dx * dx + dy * dy > REVEAL_RADIUS * REVEAL_RADIUS) continue;
        const tx = ptx + dx;
        const ty = pty + dy;
        if (tx < 0 || ty < 0 || tx >= this.mapW || ty >= this.mapH) continue;
        this.currentVisible.add(ty * this.mapW + tx);
        this.revealed[ty][tx] = true; // persists forever
      }
    }

    this.exploredDirty = true; // always redraw dim layer when visible zone shifts

    this.updateEnemyList(data.tileX, data.tileY, data.enemies);
  }

  private updateEnemyList(
    px: number, py: number,
    enemies: { tileX: number; tileY: number }[]
  ) {
    this.visibleEnemies = enemies.filter(e => {
      const dx = e.tileX - px;
      const dy = e.tileY - py;
      return dx * dx + dy * dy <= ENEMY_VISION * ENEMY_VISION;
    });
  }

  // ── Draw layers ───────────────────────────────────

  /** Dim explored tiles (all revealed, not just current view). Updates only on new reveals. */
  private redrawExplored() {
    if (!this.tiles.length) return;
    this.exploredGfx.clear();
    const s = this.mmScale;
    const mmX = this.getMinimapX();
    const mmY = this.getMinimapY();

    for (let row = 0; row < this.mapH; row++) {
      for (let col = 0; col < this.mapW; col++) {
        if (!this.revealed[row][col]) continue;
        // Skip tiles currently visible — drawn bright in visibleGfx
        const key = row * this.mapW + col;
        if (this.currentVisible.has(key)) continue;

        const color = this.tiles[row][col] === TILE_WALL ? C_WALL_DIM : C_FLOOR_DIM;
        this.exploredGfx.fillStyle(color, 1);
        this.exploredGfx.fillRect(mmX + col * s, mmY + row * s, Math.max(1, s), Math.max(1, s));
      }
    }
  }

  /** Bright current-view tiles. Redrawn every frame when player moves. */
  private redrawVisible() {
    if (!this.tiles.length) return;
    this.visibleGfx.clear();
    const s = this.mmScale;
    const mmX = this.getMinimapX();
    const mmY = this.getMinimapY();

    for (const key of this.currentVisible) {
      const row = Math.floor(key / this.mapW);
      const col = key % this.mapW;
      const color = this.tiles[row][col] === TILE_WALL ? C_WALL_BRIGHT : C_FLOOR_BRIGHT;
      this.visibleGfx.fillStyle(color, 1);
      this.visibleGfx.fillRect(mmX + col * s, mmY + row * s, Math.max(1, s), Math.max(1, s));
    }

    // Stair — yellow, only if revealed
    if (this.revealed[this.stairTY]?.[this.stairTX]) {
      const sx = mmX + (this.stairTX + 0.5) * s;
      const sy = mmY + (this.stairTY + 0.5) * s;
      this.visibleGfx.fillStyle(C_STAIR, 1);
      this.visibleGfx.fillCircle(sx, sy, Math.max(2, s * 0.8));
    }

    // Start — blue, only if revealed
    if (this.revealed[this.startTY]?.[this.startTX]) {
      const sx = mmX + (this.startTX + 0.5) * s;
      const sy = mmY + (this.startTY + 0.5) * s;
      this.visibleGfx.fillStyle(C_START, 1);
      this.visibleGfx.fillCircle(sx, sy, Math.max(2, s * 0.8));
    }
  }

  private onAbilityState(data: { qPct: number; ePct: number }) {
    this.abCd.q = data.qPct;
    this.abCd.e = data.ePct;
  }

  private onStatsChanged(data: { attack: number; arrowDamage: number; armor: number }) {
    this.statText?.setText(String(data.attack));
    this.arrowText?.setText(String(data.arrowDamage));
    this.armorText?.setText(String(data.armor));
  }

  private onItemBought(data: { frame: number; name: string }) {
    const SZ  = 24;
    const y = this.viewportH - SZ / 2 - 2;

    const icon = this.add.image(0, y, 'icons', data.frame)
      .setDisplaySize(SZ, SZ)
      .setScrollFactor(0)
      .setDepth(500)
      .setAlpha(0.9);

    this.itemIconsRow.push(icon);
    this.layoutItemIconsRow();
  }

  /** Clockwise pie-sweep cooldown overlay for Q and E ability icons. */
  private redrawAbilityCooldowns() {
    this.abGfx.clear();
    const entries: [number, number][] = [[this.abQx, this.abCd.q], [this.abEx, this.abCd.e]];
    for (const [cx, pct] of entries) {
      if (pct <= 0) continue;
      // Square overlay: fills from top down proportional to cooldown pct
      const left = cx - AB_SZ / 2;
      const top  = this.abY - AB_SZ / 2;
      const h    = AB_SZ * pct;
      this.abGfx.fillStyle(0x000000, 0.72);
      this.abGfx.fillRect(left, top, AB_SZ, h);
    }
  }

  /** Player dot + enemy dots. Redrawn every frame. */
  private redrawUnits() {
    this.unitGfx.clear();
    const s = this.mmScale;
    const r = Math.max(1.5, s * 0.6);
    const mmX = this.getMinimapX();
    const mmY = this.getMinimapY();

    // Enemies
    this.unitGfx.fillStyle(C_ENEMY, 1);
    for (const e of this.visibleEnemies) {
      this.unitGfx.fillCircle(
        mmX + (e.tileX + 0.5) * s,
        mmY + (e.tileY + 0.5) * s,
        r
      );
    }

    // Player dot
    {
      this.unitGfx.fillStyle(C_PLAYER, 1);
      this.unitGfx.fillCircle(
        mmX + (this.playerTX + 0.5) * s,
        mmY + (this.playerTY + 0.5) * s,
        Math.max(2, s * 0.8)
      );
    }
  }
}
