import Phaser from 'phaser';
import balance from '../data/balance.json';
import { TILE_WALL } from '../systems/DungeonGenerator';
import { LeaderboardRow, loadLeaderboardRows } from '../systems/LeaderboardSystem';
import { t } from '../lang';

const MAX_HP = balance.player.hp;
const PAD    = 10;
const BASE_UI_W = 1280;
const BASE_UI_H = 720;

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
const LB_BUTTON_FRAME = 14;
const LB_VISIBLE_ROWS = 20;

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
  private uiScale     = 1;

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
  private leaderboardButtonBg!: Phaser.GameObjects.Rectangle;
  private leaderboardButtonIcon!: Phaser.GameObjects.Image;
  private leaderboardButtonText!: Phaser.GameObjects.Text;
  private leaderboardBackdrop!: Phaser.GameObjects.Rectangle;
  private leaderboardPanel!: Phaser.GameObjects.Rectangle;
  private leaderboardTitle!: Phaser.GameObjects.Text;
  private leaderboardClose!: Phaser.GameObjects.Text;
  private leaderboardStatus!: Phaser.GameObjects.Text;
  private leaderboardHint!: Phaser.GameObjects.Text;
  private leaderboardHeaderTexts: Phaser.GameObjects.Text[] = [];
  private leaderboardRowsMaskShape!: Phaser.GameObjects.Graphics;
  private leaderboardRowsMask!: Phaser.Display.Masks.GeometryMask;
  private leaderboardRows: {
    bg: Phaser.GameObjects.Rectangle;
    rank: Phaser.GameObjects.Text;
    name: Phaser.GameObjects.Text;
    floor: Phaser.GameObjects.Text;
    items: Phaser.GameObjects.Image[];
    itemsOverflow: Phaser.GameObjects.Text;
    moneyIcons: [Phaser.GameObjects.Image, Phaser.GameObjects.Image, Phaser.GameObjects.Image];
    moneyTexts: [Phaser.GameObjects.Text, Phaser.GameObjects.Text, Phaser.GameObjects.Text];
  }[] = [];
  private leaderboardEntries: LeaderboardRow[] = [];
  private leaderboardOpen = false;
  private leaderboardLoading = false;
  private leaderboardScrollOffset = 0;
  private leaderboardVisibleRows = LB_VISIBLE_ROWS;

  constructor() {
    super({ key: 'UIScene' });
  }

  private syncViewportSize() {
    this.uiScale = Math.min(
      this.scale.gameSize.width / BASE_UI_W,
      this.scale.gameSize.height / BASE_UI_H,
    );
    this.viewportW = this.scale.gameSize.width;
    this.viewportH = this.scale.gameSize.height;
  }

  private getMinimapWidth() {
    return MM_W * this.uiScale;
  }

  private getMinimapHeight() {
    return MM_H * this.uiScale;
  }

  private getMinimapX() {
    return this.viewportW - PAD * this.uiScale - this.getMinimapWidth();
  }

  private getMinimapY() {
    return this.viewportH - PAD * this.uiScale - this.getMinimapHeight();
  }

  private layoutItemIconsRow() {
    if (this.itemIconsRow.length === 0) return;
    const SZ = 24 * this.uiScale;
    const GAP = 4 * this.uiScale;
    const leftSafeX = 84 * this.uiScale;
    const rightSafeX = this.getMinimapX() - 16 * this.uiScale;
    const availableW = Math.max(SZ, rightSafeX - leftSafeX);
    const maxPerRow = Math.max(1, Math.floor((availableW + GAP) / (SZ + GAP)));
    const rows = Math.max(1, Math.ceil(this.itemIconsRow.length / maxPerRow));
    const baseY = this.viewportH - SZ / 2 - 2 * this.uiScale;

    this.itemIconsRow.forEach((ic, i) => {
      const row = Math.floor(i / maxPerRow);
      const col = i % maxPerRow;
      const itemsInRow = row === rows - 1
        ? this.itemIconsRow.length - row * maxPerRow
        : maxPerRow;
      const rowW = itemsInRow * (SZ + GAP) - GAP;
      const x0 = leftSafeX + (availableW - rowW) / 2;
      const y = baseY - row * (SZ + GAP);
      ic.setDisplaySize(SZ, SZ);
      ic.setPosition(x0 + col * (SZ + GAP) + SZ / 2, y);
    });
  }

  private relayoutHud() {
    this.syncViewportSize();
    const s = this.uiScale;
    const pad = PAD * s;
    const barH = BAR_H * s;
    const hpScale = HP_SCALE * s;
    const abilitySize = AB_SZ * s;

    this.abY = this.viewportH - pad - abilitySize / 2;
    this.abQx = pad + abilitySize / 2;
    this.abEx = pad + abilitySize + 8 * s + abilitySize / 2;

    this.hpBarEmpty.setScale(hpScale).setPosition(pad, pad);
    this.hpBarFill.setScale(hpScale).setPosition(pad, pad);
    this.hpBarDamage.setScale(hpScale).setPosition(pad, pad);
    this.hpBarHeal.setScale(hpScale).setPosition(pad, pad);
    this.hpText
      .setStyle({ fontSize: `${Math.max(14, Math.round(14 * s))}px`, strokeThickness: Math.max(4, Math.round(4 * s)) })
      .setPosition(pad + 8 * hpScale, pad + barH / 2);

    this.coinY = pad + barH + 6 * s;
    this.onCoinsChanged(this.registry.get('coinValue') ?? 0);

    this.qIcon.setDisplaySize(abilitySize, abilitySize).setPosition(this.abQx, this.abY);
    this.eIcon.setDisplaySize(abilitySize, abilitySize).setPosition(this.abEx, this.abY);
    this.qLabel
      .setStyle({ fontSize: `${Math.max(13, Math.round(13 * s))}px`, strokeThickness: Math.max(3, Math.round(3 * s)) })
      .setPosition(this.abQx + abilitySize / 2 - 2 * s, this.abY + abilitySize / 2 - 2 * s);
    this.eLabel
      .setStyle({ fontSize: `${Math.max(13, Math.round(13 * s))}px`, strokeThickness: Math.max(3, Math.round(3 * s)) })
      .setPosition(this.abEx + abilitySize / 2 - 2 * s, this.abY + abilitySize / 2 - 2 * s);

    this.floorText
      .setStyle({
        fontSize: `${Math.max(13, Math.round(13 * s))}px`,
        strokeThickness: Math.max(3, Math.round(3 * s)),
        padding: { x: Math.max(6, Math.round(6 * s)), y: Math.max(3, Math.round(3 * s)) },
      })
      .setPosition(this.viewportW - pad, pad + barH / 2);

    const lbBtnH = 30 * s;
    const iconSize = 20 * s;
    const iconTextGap = 7 * s;
    this.leaderboardButtonText
      .setStyle({ fontSize: `${Math.max(11, Math.round(12 * s))}px`, strokeThickness: Math.max(2, Math.round(2 * s)) });
    const textWidth = this.leaderboardButtonText.width;
    const contentW = iconSize + iconTextGap + textWidth;
    const lbBtnW = Math.max(140 * s, contentW + 20 * s);
    const lbBtnY = pad + barH / 2;
    const lbBtnX = this.floorText.x - this.floorText.displayWidth - 8 * s - lbBtnW / 2;
    this.leaderboardButtonBg
      .setSize(lbBtnW, lbBtnH)
      .setPosition(lbBtnX, lbBtnY);
    const contentLeft = lbBtnX - contentW / 2;
    this.leaderboardButtonIcon
      .setDisplaySize(iconSize, iconSize)
      .setPosition(contentLeft + iconSize / 2, lbBtnY + 0.5 * s);
    this.leaderboardButtonText
      .setPosition(contentLeft + iconSize + iconTextGap, lbBtnY + 0.5 * s);

    const mmX = this.getMinimapX();
    const mmY = this.getMinimapY();
    const mmW = this.getMinimapWidth();
    const mmH = this.getMinimapHeight();
    this.minimapBorder
      .setSize(mmW + 2 * s, mmH + 2 * s)
      .setDisplaySize(mmW + 2 * s, mmH + 2 * s)
      .setPosition(mmX + mmW / 2, mmY + mmH / 2);
    this.minimapBg
      .setSize(mmW, mmH)
      .setDisplaySize(mmW, mmH)
      .setPosition(mmX + mmW / 2, mmY + mmH / 2);

    const iconSz = 20 * s;
    const rowH = iconSz + 4 * s;
    const iconX = mmX - pad - iconSz / 2;
    const textX = iconX - iconSz / 2 - 4 * s;
    const armY = mmY + mmH - iconSz / 2;
    const arwY = armY - rowH;
    const atkY = arwY - rowH;

    this.armorIcon.setDisplaySize(iconSz, iconSz).setPosition(iconX, armY);
    this.armorText
      .setStyle({ fontSize: `${Math.max(13, Math.round(13 * s))}px`, strokeThickness: Math.max(3, Math.round(3 * s)) })
      .setPosition(textX, armY);
    this.arrowIcon.setDisplaySize(iconSz, iconSz).setPosition(iconX, arwY);
    this.arrowText
      .setStyle({ fontSize: `${Math.max(13, Math.round(13 * s))}px`, strokeThickness: Math.max(3, Math.round(3 * s)) })
      .setPosition(textX, arwY);
    this.statIcon.setDisplaySize(iconSz, iconSz).setPosition(iconX, atkY);
    this.statText
      .setStyle({ fontSize: `${Math.max(13, Math.round(13 * s))}px`, strokeThickness: Math.max(3, Math.round(3 * s)) })
      .setPosition(textX, atkY);

    if (this.mapW > 0 && this.mapH > 0) {
      this.mmScale = Math.min(mmW / this.mapW, mmH / this.mapH);
    }

    this.layoutItemIconsRow();
    this.layoutLeaderboardPanel();
  }

  private handleResize() {
    this.relayoutHud();
    this.exploredDirty = true;
  }

  create() {
    this.syncViewportSize();

    // Reset instance state that survives scene stop/launch (constructor doesn't re-run)
    this.itemIconsRow = [];
    this.leaderboardHeaderTexts = [];
    this.leaderboardRows = [];
    this.leaderboardEntries = [];
    this.leaderboardOpen = false;
    this.leaderboardLoading = false;
    this.leaderboardScrollOffset = 0;
    this.leaderboardVisibleRows = LB_VISIBLE_ROWS;

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

    this.leaderboardButtonBg = this.add.rectangle(0, 0, 120, 24, 0x140d12, 0.92)
      .setStrokeStyle(1, 0xb28e59, 1)
      .setScrollFactor(0)
      .setDepth(100)
      .setInteractive({ useHandCursor: true })
      .on('pointerover', () => {
        this.leaderboardButtonBg.setFillStyle(0x23151d, 0.98);
        this.leaderboardButtonBg.setStrokeStyle(1, 0xe0b86a, 1);
      })
      .on('pointerout', () => {
        this.leaderboardButtonBg.setFillStyle(0x140d12, 0.92);
        this.leaderboardButtonBg.setStrokeStyle(1, 0xb28e59, 1);
      })
      .on('pointerdown', () => void this.toggleLeaderboard());
    this.leaderboardButtonIcon = this.add.image(0, 0, 'icons', LB_BUTTON_FRAME)
      .setScrollFactor(0)
      .setDepth(101);
    this.leaderboardButtonText = this.add.text(0, 0, t().leaderboard, {
      fontSize: '11px', color: '#f4e8c4', stroke: '#000000', strokeThickness: 2,
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(101);

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

    this.createLeaderboardPanel();

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
    this.input.on('wheel', this.onWheel, this);
    this.input.keyboard?.on('keydown-ESC', this.onEsc, this);

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
      this.input.off('wheel', this.onWheel, this);
      this.input.keyboard?.off('keydown-ESC', this.onEsc, this);
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
    const s = this.uiScale;
    const pad = PAD * s;
    const ICON_SZ  = 18 * s;
    const GAP      = 4 * s;  // px between icon+text groups
    const TEXT_GAP = 2 * s;  // px between icon and number
    let curX = pad;
    const midY = this.coinY + ICON_SZ / 2;
    for (let i = 0; i < 3; i++) {
      const visible = counts[i] > 0;
      this.coinIcons[i].setVisible(visible);
      this.coinTexts[i].setVisible(visible);
      if (visible) {
        this.coinIcons[i]
          .setDisplaySize(ICON_SZ, ICON_SZ)
          .setPosition(curX + ICON_SZ / 2, midY);
        this.coinTexts[i]
          .setStyle({ fontSize: `${Math.max(11, Math.round(11 * s))}px`, strokeThickness: Math.max(2, Math.round(2 * s)) })
          .setText(String(counts[i]))
          .setPosition(curX + ICON_SZ + TEXT_GAP, midY);
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
    this.mmScale = Math.min(this.getMinimapWidth() / this.mapW, this.getMinimapHeight() / this.mapH);

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
    const SZ  = 24 * this.uiScale;
    const y = this.viewportH - SZ / 2 - 2 * this.uiScale;

    const icon = this.add.image(0, y, 'icons', data.frame)
      .setDisplaySize(SZ, SZ)
      .setScrollFactor(0)
      .setDepth(500)
      .setAlpha(0.9);

    this.itemIconsRow.push(icon);
    this.layoutItemIconsRow();
  }

  private createLeaderboardPanel() {
    this.leaderboardBackdrop = this.add.rectangle(0, 0, this.viewportW, this.viewportH, 0x000000, 0.72)
      .setScrollFactor(0)
      .setDepth(700)
      .setVisible(false)
      .setInteractive()
      .on('pointerdown', () => this.closeLeaderboard());
    this.leaderboardPanel = this.add.rectangle(0, 0, 740, 560, 0x130d13, 0.96)
      .setStrokeStyle(2, 0x9a9a9a, 1)
      .setScrollFactor(0)
      .setDepth(701)
      .setVisible(false);
    this.leaderboardTitle = this.add.text(0, 0, t().leaderboardTitle, {
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#ffffff',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5, 0).setScrollFactor(0).setDepth(702).setVisible(false);
    this.leaderboardClose = this.add.text(0, 0, 'X', {
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#ffaaaa',
      stroke: '#000000',
      strokeThickness: 4,
    }).setOrigin(0.5).setScrollFactor(0).setDepth(702).setVisible(false)
      .setInteractive({ useHandCursor: true })
      .on('pointerdown', () => this.closeLeaderboard());
    this.leaderboardStatus = this.add.text(0, 0, '', {
      fontSize: '16px',
      color: '#dddddd',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(702).setVisible(false);
    this.leaderboardHint = this.add.text(0, 0, t().leaderboardHint, {
      fontSize: '14px',
      color: '#bbbbbb',
      stroke: '#000000',
      strokeThickness: 3,
    }).setOrigin(1, 1).setScrollFactor(0).setDepth(702).setVisible(false);

    for (const label of [t().leaderboardRank, t().leaderboardPlayer, t().leaderboardFloor, t().leaderboardMoney]) {
      this.leaderboardHeaderTexts.push(this.add.text(0, 0, label, {
        fontSize: '14px',
        fontStyle: 'bold',
        color: '#ffdd88',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(702).setVisible(false));
    }

    for (let i = 0; i < LB_VISIBLE_ROWS; i++) {
      const bg = this.add.rectangle(0, 0, 0, 0, 0x23171d, 0.88)
        .setScrollFactor(0)
        .setDepth(701)
        .setVisible(false);
      const rank = this.add.text(0, 0, '', {
        fontSize: '15px',
        color: '#d9d9d9',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(702).setVisible(false);
      const name = this.add.text(0, 0, '', {
        fontSize: '15px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(702).setVisible(false);
      const floor = this.add.text(0, 0, '', {
        fontSize: '15px',
        color: '#ffb066',
        stroke: '#000000',
        strokeThickness: 3,
        fixedWidth: 70,
        align: 'right',
      }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(702).setVisible(false);

      const bc = balance.coins;
      const items = Array.from({ length: 6 }, () =>
        this.add.image(0, 0, 'icons', 0)
          .setScrollFactor(0)
          .setDepth(702)
          .setVisible(false)
      );
      const itemsOverflow = this.add.text(0, 0, '', {
        fontSize: '12px',
        color: '#ffffff',
        stroke: '#000000',
        strokeThickness: 3,
      }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(702).setVisible(false);
      const moneyIcons = [
        this.add.image(0, 0, 'icons', bc.redFrame).setScrollFactor(0).setDepth(702).setVisible(false),
        this.add.image(0, 0, 'icons', bc.goldFrame).setScrollFactor(0).setDepth(702).setVisible(false),
        this.add.image(0, 0, 'icons', bc.silverFrame).setScrollFactor(0).setDepth(702).setVisible(false),
      ] as [Phaser.GameObjects.Image, Phaser.GameObjects.Image, Phaser.GameObjects.Image];
      const moneyTexts = [
        this.add.text(0, 0, '', {
          fontSize: '13px', color: '#ffffff', stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(702).setVisible(false),
        this.add.text(0, 0, '', {
          fontSize: '13px', color: '#ffffff', stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(702).setVisible(false),
        this.add.text(0, 0, '', {
          fontSize: '13px', color: '#ffffff', stroke: '#000000', strokeThickness: 3,
        }).setOrigin(0, 0.5).setScrollFactor(0).setDepth(702).setVisible(false),
      ] as [Phaser.GameObjects.Text, Phaser.GameObjects.Text, Phaser.GameObjects.Text];

      this.leaderboardRows.push({ bg, rank, name, floor, items, itemsOverflow, moneyIcons, moneyTexts });
    }

    this.leaderboardRowsMaskShape = this.add.graphics()
      .setScrollFactor(0)
      .setDepth(701)
      .setVisible(false);
    this.leaderboardRowsMask = this.leaderboardRowsMaskShape.createGeometryMask();
    this.leaderboardRows.forEach((row) => {
      row.bg.setMask(this.leaderboardRowsMask);
      row.rank.setMask(this.leaderboardRowsMask);
      row.name.setMask(this.leaderboardRowsMask);
      row.floor.setMask(this.leaderboardRowsMask);
      row.items.forEach((icon) => icon.setMask(this.leaderboardRowsMask));
      row.itemsOverflow.setMask(this.leaderboardRowsMask);
      row.moneyIcons.forEach((icon) => icon.setMask(this.leaderboardRowsMask));
      row.moneyTexts.forEach((text) => text.setMask(this.leaderboardRowsMask));
    });
  }

  private layoutLeaderboardPanel() {
    if (!this.leaderboardPanel) return;
    const s = this.uiScale;
    const panelW = Math.min(this.viewportW - 40 * s, 760 * s);
    const panelH = Math.min(this.viewportH - 40 * s, 580 * s);
    const cx = this.viewportW / 2;
    const cy = this.viewportH / 2;
    const left = cx - panelW / 2;
    const top = cy - panelH / 2;
    const pad = 18 * s;
    const rankX = left + 22 * s;
    const nameX = left + 84 * s;
    const moneyRightX = left + panelW - 24 * s;
    const moneyHeaderX = left + panelW - 132 * s;
    const floorX = left + panelW - 270 * s;
    const itemsAreaLeftX = nameX + 172 * s;
    const itemsAreaRightX = floorX - 30 * s;
    const itemsCenterX = (itemsAreaLeftX + itemsAreaRightX) / 2;

    this.leaderboardBackdrop.setSize(this.viewportW, this.viewportH).setPosition(cx, cy);
    this.leaderboardPanel.setSize(panelW, panelH).setPosition(cx, cy);
    this.leaderboardTitle
      .setStyle({ fontSize: `${Math.max(20, Math.round(24 * s))}px`, strokeThickness: Math.max(3, Math.round(4 * s)) })
      .setPosition(cx, top + pad);
    this.leaderboardClose.setPosition(left + panelW - pad, top + 26 * s);
    this.leaderboardStatus
      .setStyle({ fontSize: `${Math.max(14, Math.round(16 * s))}px`, strokeThickness: Math.max(2, Math.round(3 * s)) })
      .setPosition(left + pad, top + 70 * s);
    this.leaderboardHint
      .setStyle({ fontSize: `${Math.max(12, Math.round(14 * s))}px`, strokeThickness: Math.max(2, Math.round(3 * s)) })
      .setPosition(left + panelW - pad, top + panelH - pad);

    const headerY = top + 104 * s;
    const headerXs = [rankX, nameX, floorX, moneyHeaderX];
    this.leaderboardHeaderTexts.forEach((text, i) => {
      text
        .setStyle({ fontSize: `${Math.max(12, Math.round(14 * s))}px`, strokeThickness: Math.max(2, Math.round(3 * s)) })
        .setPosition(headerXs[i], headerY);
    });

    const rowStartY = top + 138 * s;
    const rowBottomPad = 22 * s;
    const rowAreaH = Math.max(240 * s, panelH - (rowStartY - top) - rowBottomPad);
    const targetRowH = 28 * s;
    this.leaderboardVisibleRows = Math.min(
      LB_VISIBLE_ROWS,
      Math.max(10, Math.floor(rowAreaH / targetRowH)),
    );
    const rowH = Math.max(20 * s, Math.floor(rowAreaH / this.leaderboardVisibleRows));
    const rowW = panelW - pad * 2;
    const itemSize = Math.min(18 * s, Math.max(13 * s, rowH - 8 * s));
    const itemStep = itemSize + 3 * s;
    this.leaderboardRowsMaskShape
      .clear()
      .fillStyle(0xffffff, 1)
      .fillRect(left + pad, rowStartY - rowH / 2, rowW, rowH * this.leaderboardVisibleRows);
    this.leaderboardRows.forEach((row, i) => {
      const y = rowStartY + i * rowH;
      row.bg.setSize(rowW, rowH - Math.max(1, 1 * s)).setPosition(cx, y);
      row.rank
        .setStyle({ fontSize: `${Math.max(12, Math.round(14 * s))}px`, strokeThickness: Math.max(2, Math.round(3 * s)) })
        .setPosition(rankX, y);
      row.name
        .setStyle({ fontSize: `${Math.max(12, Math.round(14 * s))}px`, strokeThickness: Math.max(2, Math.round(3 * s)) })
        .setPosition(nameX, y);
      row.floor
        .setStyle({ fontSize: `${Math.max(12, Math.round(14 * s))}px`, strokeThickness: Math.max(2, Math.round(3 * s)), fixedWidth: 64 * s, align: 'right' })
        .setPosition(floorX, y);
      row.items.forEach((icon, idx) => {
        icon
          .setDisplaySize(itemSize, itemSize)
          .setPosition(itemsCenterX + idx * itemStep, y)
          .setData('itemsCenterX', itemsCenterX)
          .setData('itemsY', y)
          .setData('itemsAreaLeftX', itemsAreaLeftX)
          .setData('itemsAreaRightX', itemsAreaRightX)
          .setData('itemSize', itemSize)
          .setData('itemStep', itemStep);
      });
      row.itemsOverflow
        .setStyle({ fontSize: `${Math.max(12, Math.round(14 * s))}px`, strokeThickness: Math.max(2, Math.round(3 * s)) })
        .setPosition(itemsCenterX, y)
        .setData('itemsCenterX', itemsCenterX)
        .setData('itemsY', y)
        .setData('itemsAreaLeftX', itemsAreaLeftX)
        .setData('itemsAreaRightX', itemsAreaRightX)
        .setData('itemSize', itemSize)
        .setData('itemStep', itemStep);
      row.moneyIcons.forEach(icon => icon.setDisplaySize(Math.min(12 * s, rowH - 8 * s), Math.min(12 * s, rowH - 8 * s)));
      row.moneyTexts.forEach(text => {
        text.setStyle({
          fontSize: `${Math.max(11, Math.round(12 * s))}px`,
          strokeThickness: Math.max(2, Math.round(3 * s)),
        });
      });

      for (let idx = 0; idx < 3; idx++) {
        row.moneyIcons[idx].setPosition(moneyRightX, y).setData('moneyRightX', moneyRightX);
        row.moneyTexts[idx].setText('0').setPosition(moneyRightX, y).setData('moneyRightX', moneyRightX);
      }
    });
  }

  private async toggleLeaderboard() {
    if (this.leaderboardOpen) {
      this.closeLeaderboard();
      return;
    }

    this.leaderboardOpen = true;
    this.leaderboardLoading = true;
    this.leaderboardScrollOffset = 0;
    this.leaderboardEntries = [];
    this.setLeaderboardVisible(true);
    this.setLeaderboardStatus(t().leaderboardLoading);
    this.scene.pause('GameScene');

    const rows = await loadLeaderboardRows(t().leaderboardHiddenUser);
    if (!this.leaderboardOpen) return;

    this.leaderboardLoading = false;
    this.leaderboardEntries = rows;
    this.setLeaderboardStatus(rows.length === 0 ? t().leaderboardEmpty : '');
    this.redrawLeaderboardRows();
  }

  private closeLeaderboard() {
    if (!this.leaderboardOpen) return;
    this.leaderboardOpen = false;
    this.leaderboardScrollOffset = 0;
    this.setLeaderboardVisible(false);
    this.scene.resume('GameScene');
  }

  private setLeaderboardVisible(visible: boolean) {
    this.leaderboardBackdrop.setVisible(visible);
    this.leaderboardPanel.setVisible(visible);
    this.leaderboardTitle.setVisible(visible);
    this.leaderboardClose.setVisible(visible);
    this.leaderboardStatus.setVisible(visible && this.leaderboardStatus.text.length > 0);
    this.leaderboardHint.setVisible(visible && this.leaderboardEntries.length > LB_VISIBLE_ROWS);
    this.leaderboardHeaderTexts.forEach(text => text.setVisible(visible));
    this.redrawLeaderboardRows();
  }

  private setLeaderboardStatus(text: string) {
    this.leaderboardStatus.setText(text);
    this.leaderboardStatus.setVisible(this.leaderboardOpen && text.length > 0);
  }

  private redrawLeaderboardRows() {
    const rowsVisible = this.leaderboardOpen && !this.leaderboardLoading && this.leaderboardEntries.length > 0;
    const maxOffset = Math.max(0, this.leaderboardEntries.length - this.leaderboardVisibleRows);
    this.leaderboardScrollOffset = Phaser.Math.Clamp(this.leaderboardScrollOffset, 0, maxOffset);
    this.leaderboardHint.setVisible(rowsVisible && this.leaderboardEntries.length > this.leaderboardVisibleRows);

    this.leaderboardRows.forEach((row, i) => {
      const entry = i < this.leaderboardVisibleRows
        ? this.leaderboardEntries[this.leaderboardScrollOffset + i]
        : undefined;
      const visible = rowsVisible && !!entry;
      row.bg.setVisible(visible);
      row.rank.setVisible(visible);
      row.name.setVisible(visible);
      row.floor.setVisible(visible);
      row.items.forEach(icon => icon.setVisible(false));
      row.itemsOverflow.setVisible(false);
      row.moneyIcons.forEach(icon => icon.setVisible(false));
      row.moneyTexts.forEach(text => text.setVisible(false));

      if (!visible || !entry) return;

      row.bg.setFillStyle(entry.isPlayer ? 0x3b262c : (i % 2 === 0 ? 0x23171d : 0x1a1116), 0.88);
      row.rank.setText(`#${entry.rank}`);
      row.name.setText(entry.name.length > 22 ? `${entry.name.slice(0, 21)}…` : entry.name);
      row.floor.setText(String(entry.floor));
      this.layoutLeaderboardItemRow(row.items, row.itemsOverflow, entry.itemFrames ?? [], entry.itemCount ?? entry.itemFrames?.length ?? 0);
      this.layoutLeaderboardMoneyRow(row, entry.coins);
    });
  }

  private layoutLeaderboardItemRow(
    icons: Phaser.GameObjects.Image[],
    overflowText: Phaser.GameObjects.Text,
    itemFrames: number[],
    itemCount: number,
  ) {
    const visibleFrames = itemFrames.slice(0, icons.length);
    const overflowCount = Math.max(0, itemCount - visibleFrames.length);
    const iconSize = Number(icons[0]?.getData('itemSize') ?? overflowText.getData('itemSize') ?? (16 * this.uiScale));
    const step = Number(icons[0]?.getData('itemStep') ?? overflowText.getData('itemStep') ?? (iconSize + 3 * this.uiScale));
    const centerX = Number(icons[0]?.getData('itemsCenterX') ?? overflowText.getData('itemsCenterX') ?? 0);
    const areaLeftX = Number(icons[0]?.getData('itemsAreaLeftX') ?? overflowText.getData('itemsAreaLeftX') ?? centerX);
    const areaRightX = Number(icons[0]?.getData('itemsAreaRightX') ?? overflowText.getData('itemsAreaRightX') ?? centerX);
    const y = Number(icons[0]?.getData('itemsY') ?? overflowText.getData('itemsY') ?? overflowText.y);
    const totalSlots = visibleFrames.length + (overflowCount > 0 ? 1 : 0);
    const totalWidth = totalSlots > 0 ? totalSlots * step - (step - iconSize) : 0;
    const clampedStartX = Phaser.Math.Clamp(
      centerX - totalWidth / 2,
      areaLeftX,
      Math.max(areaLeftX, areaRightX - totalWidth),
    );
    let curX = clampedStartX;

    overflowText.setVisible(false);

    for (let i = 0; i < icons.length; i++) {
      const frame = visibleFrames[i];
      const visible = typeof frame === 'number';
      icons[i].setVisible(visible);
      if (!visible) continue;
      icons[i]
        .setFrame(frame)
        .setPosition(curX + iconSize / 2, y);
      curX += step;
    }

    if (overflowCount > 0) {
      overflowText
        .setText(`+${overflowCount}`)
        .setPosition(curX, y)
        .setVisible(true);
    }
  }

  private layoutLeaderboardMoneyRow(
    row: {
      moneyIcons: [Phaser.GameObjects.Image, Phaser.GameObjects.Image, Phaser.GameObjects.Image];
      moneyTexts: [Phaser.GameObjects.Text, Phaser.GameObjects.Text, Phaser.GameObjects.Text];
    },
    total: number,
  ) {
    const bc = balance.coins;
    const counts = [
      Math.floor(total / bc.redValue),
      Math.floor((total % bc.redValue) / bc.goldValue),
      total % bc.goldValue,
    ];

    const s = this.uiScale;
    const firstIcon = row.moneyIcons[0];
    const y = firstIcon.y;
    const rightX = Number(row.moneyIcons[0].getData('moneyRightX') ?? row.moneyIcons[0].x);
    const iconSize = 12 * s;
    const textGap = 2 * s;
    const groupGap = 4 * s;
    const groups = counts
      .map((count, i) => ({ count, i }))
      .filter(group => group.count > 0);

    let totalWidth = 0;
    for (const group of groups) {
      const text = row.moneyTexts[group.i];
      text.setText(String(group.count));
      totalWidth += iconSize + textGap + text.width;
    }
    if (groups.length > 1) totalWidth += groupGap * (groups.length - 1);

    let curX = rightX - totalWidth;

    for (let i = 0; i < 3; i++) {
      const visible = counts[i] > 0;
      row.moneyIcons[i].setVisible(visible);
      row.moneyTexts[i].setVisible(visible);
      if (!visible) continue;

      row.moneyIcons[i]
        .setDisplaySize(iconSize, iconSize)
        .setPosition(curX + iconSize / 2, y);
      row.moneyTexts[i]
        .setText(String(counts[i]))
        .setPosition(curX + iconSize + textGap, y);

      curX += iconSize + textGap + row.moneyTexts[i].width + groupGap;
    }
  }

  private onWheel(
    _pointer: Phaser.Input.Pointer,
    _objects: Phaser.GameObjects.GameObject[],
    _deltaX: number,
    deltaY: number,
    _deltaZ: number,
  ) {
    if (!this.leaderboardOpen) return;
    const maxOffset = Math.max(0, this.leaderboardEntries.length - this.leaderboardVisibleRows);
    if (maxOffset <= 0) return;
    const nextOffset = Phaser.Math.Clamp(
      this.leaderboardScrollOffset + (deltaY > 0 ? 1 : -1),
      0,
      maxOffset,
    );
    if (nextOffset === this.leaderboardScrollOffset) return;
    this.leaderboardScrollOffset = nextOffset;
    this.redrawLeaderboardRows();
  }

  private onEsc() {
    this.closeLeaderboard();
  }

  /** Clockwise pie-sweep cooldown overlay for Q and E ability icons. */
  private redrawAbilityCooldowns() {
    this.abGfx.clear();
    const entries: [number, number][] = [[this.abQx, this.abCd.q], [this.abEx, this.abCd.e]];
    const abilitySize = AB_SZ * this.uiScale;
    for (const [cx, pct] of entries) {
      if (pct <= 0) continue;
      // Square overlay: fills from top down proportional to cooldown pct
      const left = cx - abilitySize / 2;
      const top  = this.abY - abilitySize / 2;
      const h    = abilitySize * pct;
      this.abGfx.fillStyle(0x000000, 0.72);
      this.abGfx.fillRect(left, top, abilitySize, h);
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
