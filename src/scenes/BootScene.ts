import Phaser from 'phaser';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // Tileset — floor, walls (16×16 grid)
    this.load.spritesheet('tileset', 'assets/tiles/Dungeon_Tileset.png', {
      frameWidth: 16, frameHeight: 16,
    });

    // Player — 4 individual 16×16 frames (priests_idle/priest1/v1)
    const base = 'assets/characters/priests_idle/priest1/v1/priest1_v1_';
    this.load.image('_pf1', `${base}1.png`);
    this.load.image('_pf2', `${base}2.png`);
    this.load.image('_pf3', `${base}3.png`);
    this.load.image('_pf4', `${base}4.png`);

    // Skeleton enemy animation sheets — all 32×32 frames
    this.load.spritesheet('skeleton-idle',   'assets/enemies/Enemy_Animations_Set/enemies-skeleton1_idle.png',        { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('skeleton-walk',   'assets/enemies/Enemy_Animations_Set/enemies-skeleton1_movement.png',    { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('skeleton-attack', 'assets/enemies/Enemy_Animations_Set/enemies-skeleton1_attack.png',      { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('skeleton-hit',    'assets/enemies/Enemy_Animations_Set/enemies-skeleton1_take_damage.png', { frameWidth: 32, frameHeight: 32 });

    // Vampire enemy animation sheets — all 32×32 frames
    this.load.spritesheet('vampire-idle',   'assets/enemies/Enemy_Animations_Set/enemies-vampire_idle.png',        { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('vampire-walk',   'assets/enemies/Enemy_Animations_Set/enemies-vampire_movement.png',    { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('vampire-attack', 'assets/enemies/Enemy_Animations_Set/enemies-vampire_attack.png',      { frameWidth: 32, frameHeight: 32 });
    this.load.spritesheet('vampire-hit',    'assets/enemies/Enemy_Animations_Set/enemies-vampire_take_damage.png', { frameWidth: 32, frameHeight: 32 });

    // Props: stair (peaks), torch
    const torchBase = 'assets/props/torch/torch_';
    this.load.image('_torch1', `${torchBase}1.png`);
    this.load.image('_torch2', `${torchBase}2.png`);
    this.load.image('_torch3', `${torchBase}3.png`);
    this.load.image('_torch4', `${torchBase}4.png`);
    const peaksBase = 'assets/props/peaks/peaks_';
    this.load.image('_peaks1', `${peaksBase}1.png`);
    this.load.image('_peaks2', `${peaksBase}2.png`);
    this.load.image('_peaks3', `${peaksBase}3.png`);
    this.load.image('_peaks4', `${peaksBase}4.png`);
  }

  create() {
    // ── Player texture — compose 4 frames into a single 64×16 spritesheet ──
    // Each frame is 16×16 px, loaded as individual images (_pf1.._pf4).
    const playerCanvas = this.textures.createCanvas('player', 64, 16)!;
    const ctx = (playerCanvas.getSourceImage() as HTMLCanvasElement).getContext('2d')!;
    ['_pf1', '_pf2', '_pf3', '_pf4'].forEach((key, i) => {
      const src = this.textures.get(key).getSourceImage() as HTMLImageElement;
      ctx.drawImage(src, i * 16, 0, 16, 16);
    });
    playerCanvas.add(0, 0,  0, 0, 16, 16);
    playerCanvas.add(1, 0, 16, 0, 16, 16);
    playerCanvas.add(2, 0, 32, 0, 16, 16);
    playerCanvas.add(3, 0, 48, 0, 16, 16);
    playerCanvas.refresh();

    // ── Player animations ────────────────────────────────
    this.anims.create({
      key: 'player-walk',
      frames: this.anims.generateFrameNumbers('player', { start: 0, end: 3 }),
      frameRate: 8,
      repeat: -1,
    });

    // ── Skeleton animations ──────────────────────────────
    this.anims.create({
      key: 'skeleton-idle-anim',
      frames: this.anims.generateFrameNumbers('skeleton-idle', { start: 0, end: 5 }),
      frameRate: 8, repeat: -1,
    });
    this.anims.create({
      key: 'skeleton-walk-anim',
      frames: this.anims.generateFrameNumbers('skeleton-walk', { start: 0, end: 9 }),
      frameRate: 10, repeat: -1,
    });
    this.anims.create({
      key: 'skeleton-attack-anim',
      frames: this.anims.generateFrameNumbers('skeleton-attack', { start: 0, end: 8 }),
      frameRate: 12, repeat: 0,
    });
    this.anims.create({
      key: 'skeleton-hit-anim',
      frames: this.anims.generateFrameNumbers('skeleton-hit', { start: 0, end: 4 }),
      frameRate: 10, repeat: 0,
    });

    // ── Vampire animations ───────────────────────────────
    this.anims.create({
      key: 'vampire-idle-anim',
      frames: this.anims.generateFrameNumbers('vampire-idle', { start: 0, end: 5 }),
      frameRate: 8, repeat: -1,
    });
    this.anims.create({
      key: 'vampire-walk-anim',
      frames: this.anims.generateFrameNumbers('vampire-walk', { start: 0, end: 7 }),
      frameRate: 10, repeat: -1,
    });
    this.anims.create({
      key: 'vampire-attack-anim',
      frames: this.anims.generateFrameNumbers('vampire-attack', { start: 0, end: 15 }),
      frameRate: 14, repeat: 0,
    });
    this.anims.create({
      key: 'vampire-hit-anim',
      frames: this.anims.generateFrameNumbers('vampire-hit', { start: 0, end: 4 }),
      frameRate: 10, repeat: 0,
    });

    // ── Torch texture — 4-frame spritesheet (16×16 each) ─
    const torchCanvas = this.textures.createCanvas('torch', 64, 16)!;
    const tctx = (torchCanvas.getSourceImage() as HTMLCanvasElement).getContext('2d')!;
    ['_torch1', '_torch2', '_torch3', '_torch4'].forEach((key, i) => {
      const src = this.textures.get(key).getSourceImage() as HTMLImageElement;
      tctx.drawImage(src, i * 16, 0, 16, 16);
    });
    torchCanvas.add(0, 0,  0, 0, 16, 16);
    torchCanvas.add(1, 0, 16, 0, 16, 16);
    torchCanvas.add(2, 0, 32, 0, 16, 16);
    torchCanvas.add(3, 0, 48, 0, 16, 16);
    torchCanvas.refresh();

    this.anims.create({
      key: 'torch-anim',
      frames: this.anims.generateFrameNumbers('torch', { start: 0, end: 3 }),
      frameRate: 6, repeat: -1,
    });

    // ── Stair texture — peaks spritesheet (16×16 each) ───
    const stairCanvas = this.textures.createCanvas('stair', 64, 16)!;
    const sctx = (stairCanvas.getSourceImage() as HTMLCanvasElement).getContext('2d')!;
    ['_peaks1', '_peaks2', '_peaks3', '_peaks4'].forEach((key, i) => {
      const src = this.textures.get(key).getSourceImage() as HTMLImageElement;
      sctx.drawImage(src, i * 16, 0, 16, 16);
    });
    stairCanvas.add(0, 0,  0, 0, 16, 16);
    stairCanvas.add(1, 0, 16, 0, 16, 16);
    stairCanvas.add(2, 0, 32, 0, 16, 16);
    stairCanvas.add(3, 0, 48, 0, 16, 16);
    stairCanvas.refresh();

    this.anims.create({
      key: 'stair-anim',
      frames: this.anims.generateFrameNumbers('stair', { start: 0, end: 3 }),
      frameRate: 5, repeat: -1,
    });

    this.scene.start('GameScene');
  }
}
