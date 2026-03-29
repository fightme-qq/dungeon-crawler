import Phaser from 'phaser';

const BAR_W = 36;
const BAR_H = 4;

export abstract class BaseEnemy extends Phaser.Physics.Arcade.Sprite {
  protected hp: number;
  protected maxHp: number;
  protected armor: number;
  protected speed: number;
  protected aggroRange: number;
  protected attackDamage: number;
  protected attackRange: number;
  protected attackCooldown: number;

  // Animation keys — set by subclass
  protected animIdle   = '';
  protected animWalk   = '';
  protected animAttack = '';
  protected animHit    = '';

  protected player!: Phaser.Physics.Arcade.Sprite;
  onDamagePlayer: ((atk: number, fromX: number, fromY: number) => void) | null = null;

  private invincibilityDuration = 500;
  private invincible = false;
  private invincibilityTimer = 0;
  private blinkTimer = 0;
  private attackTimer = 0;

  private barBg!: Phaser.GameObjects.Rectangle;
  private barFill!: Phaser.GameObjects.Rectangle;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    texture: string,
    spriteScale: number,
    // Physics body in world pixels (after scale). Center them at the feet of the character.
    bodyW: number,
    bodyH: number,
    bodyOffX: number,
    bodyOffY: number,
    hp: number,
    armor: number,
    speed: number,
    aggroRange: number,
    attackDamage: number,
    attackRange: number,
    attackCooldown: number,
    invincibilityDuration: number
  ) {
    super(scene, x, y, texture);
    scene.add.existing(this);
    scene.physics.add.existing(this);

    this.hp                   = hp;
    this.maxHp                = hp;
    this.armor                = armor;
    this.speed                = speed;
    this.aggroRange           = aggroRange;
    this.attackDamage         = attackDamage;
    this.attackRange          = attackRange;
    this.attackCooldown       = attackCooldown;
    this.invincibilityDuration = invincibilityDuration;

    this.setScale(spriteScale);

    const body = this.body as Phaser.Physics.Arcade.Body;
    body.setSize(bodyW, bodyH);
    body.setOffset(bodyOffX, bodyOffY);

    // HP bar — hidden until first hit
    this.barBg   = scene.add.rectangle(x, y, BAR_W, BAR_H, 0x222222).setVisible(false);
    this.barFill = scene.add.rectangle(x, y, BAR_W, BAR_H, 0x44cc44).setVisible(false);
  }

  setPlayer(player: Phaser.Physics.Arcade.Sprite) {
    this.player = player;
  }

  getArmor(): number {
    return this.armor;
  }

  takeDamage(amount: number, kbVx: number, kbVy: number) {
    if (this.invincible) return;

    this.hp -= amount;
    if (this.hp <= 0) {
      this.barBg.destroy();
      this.barFill.destroy();
      this.destroy();
      return;
    }

    this.updateBar();
    this.barBg.setVisible(true);
    this.barFill.setVisible(true);

    (this.body as Phaser.Physics.Arcade.Body).setVelocity(kbVx, kbVy);

    if (this.animHit) this.play(this.animHit, true);

    this.invincible = true;
    this.invincibilityTimer = this.invincibilityDuration;
    this.blinkTimer = 0;
  }

  preUpdate(time: number, delta: number) {
    super.preUpdate(time, delta);

    if (this.invincible) {
      this.invincibilityTimer -= delta;
      this.blinkTimer -= delta;
      if (this.blinkTimer <= 0) {
        this.setAlpha(this.alpha > 0.5 ? 0.2 : 1);
        this.blinkTimer = 80;
      }
      if (this.invincibilityTimer <= 0) {
        this.invincible = false;
        this.setAlpha(1);
      }
    }

    if (this.attackTimer > 0) this.attackTimer -= delta;

    this.updateAI();

    const depth = this.y + this.displayHeight;
    this.setDepth(depth);

    // HP bar floats above sprite top
    const bx = this.x;
    const by = this.y - this.displayHeight / 2 - 4;
    this.barBg.setPosition(bx, by).setDepth(depth + 1);
    this.barFill.setPosition(bx - (BAR_W - this.barFill.width) / 2, by).setDepth(depth + 2);
  }

  /** Play an animation only if it isn't already running */
  protected playAnim(key: string) {
    if (!key) return;
    if (this.anims.currentAnim?.key === key && this.anims.isPlaying) return;
    this.play(key, true);
  }

  private updateBar() {
    const pct = Math.max(0, this.hp / this.maxHp);
    this.barFill.setSize(Math.max(1, BAR_W * pct), BAR_H);
    const color = pct > 0.5 ? 0x44cc44 : pct > 0.25 ? 0xddcc22 : 0xcc2222;
    this.barFill.setFillStyle(color);
  }

  protected tryAttackPlayer() {
    if (!this.player || !this.onDamagePlayer) return;
    if (this.attackTimer > 0) return;
    const dist = Phaser.Math.Distance.Between(this.x, this.y, this.player.x, this.player.y);
    if (dist > this.attackRange) return;

    this.onDamagePlayer(this.attackDamage, this.x, this.y);
    this.attackTimer = this.attackCooldown;

    this.setTint(0xffffff);
    this.scene.time.delayedCall(100, () => { if (this.active) this.clearTint(); });

    const mx = (this.x + this.player.x) / 2;
    const my = (this.y + this.player.y) / 2;
    const flash = this.scene.add.rectangle(mx, my, 14, 14, 0xff2222, 0.85);
    flash.setDepth(this.depth + 1);
    this.scene.time.delayedCall(100, () => flash.destroy());
  }

  protected abstract updateAI(): void;
}
