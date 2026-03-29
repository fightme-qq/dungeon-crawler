import Phaser from 'phaser';
import balance from '../data/balance.json';
import { BaseEnemy } from './BaseEnemy';
import { SCALE } from '../utils/constants';

// 32×32 sprite at scale 3 → 96×96px on screen.
// The visible skeleton character is ~16px tall in the frame → appears ~48px = 1 tile.
// Body (world px): 30×24, centered horizontally, placed at the lower-center of the frame.
const BODY_W    = 10; // sprite-space → ×3 = 30 world px wide
const BODY_H    = 8;  // sprite-space → ×3 = 24 world px tall
const BODY_OFFX = 33; // world px from sprite left  → centers 30px body in 96px frame
const BODY_OFFY = 58; // world px from sprite top   → puts hitbox at character feet

export class Skeleton extends BaseEnemy {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    const b = balance.enemies.skeleton;
    super(
      scene, x, y,
      'skeleton-idle', SCALE,
      BODY_W, BODY_H, BODY_OFFX, BODY_OFFY,
      b.hp, b.armor, b.speed, b.aggroRange, b.attack, b.attackRange, b.attackCooldown,
      b.invincibilityDuration,
    );

    this.animIdle   = 'skeleton-idle-anim';
    this.animWalk   = 'skeleton-walk-anim';
    this.animAttack = 'skeleton-attack-anim';
    this.animHit    = 'skeleton-hit-anim';

    this.play(this.animIdle);
  }

  protected updateAI() {
    if (!this.player || !this.active) return;

    const dist = Phaser.Math.Distance.Between(this.x, this.y, this.player.x, this.player.y);
    const body = this.body as Phaser.Physics.Arcade.Body;

    // Flip toward player
    this.setFlipX(this.player.x < this.x);

    if (dist > this.aggroRange) {
      body.setVelocity(0, 0);
      this.playAnim(this.animIdle);
    } else if (dist <= this.attackRange) {
      body.setVelocity(0, 0);
      this.tryAttackPlayer();
      if (!this.anims.currentAnim?.key.includes('hit')) {
        this.playAnim(this.animAttack);
      }
    } else {
      this.scene.physics.moveToObject(this, this.player, this.speed);
      if (!this.anims.currentAnim?.key.includes('hit')) {
        this.playAnim(this.animWalk);
      }
    }
  }
}
