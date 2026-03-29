import Phaser from 'phaser';
import balance from '../data/balance.json';
import { BaseEnemy } from './BaseEnemy';
import { SCALE } from '../utils/constants';

// 32×32 sprite at scale 3 → 96×96px. Same layout as Skeleton.
const BODY_W    = 10;
const BODY_H    = 8;
const BODY_OFFX = 33;
const BODY_OFFY = 58;

export class Vampire extends BaseEnemy {
  constructor(scene: Phaser.Scene, x: number, y: number) {
    const b = balance.enemies.vampire;
    super(
      scene, x, y,
      'vampire-idle', SCALE,
      BODY_W, BODY_H, BODY_OFFX, BODY_OFFY,
      b.hp, b.armor, b.speed, b.aggroRange, b.attack, b.attackRange, b.attackCooldown,
      b.invincibilityDuration,
    );

    this.animIdle   = 'vampire-idle-anim';
    this.animWalk   = 'vampire-walk-anim';
    this.animAttack = 'vampire-attack-anim';
    this.animHit    = 'vampire-hit-anim';

    this.play(this.animIdle);
  }

  protected updateAI() {
    if (!this.player || !this.active) return;

    const dist = Phaser.Math.Distance.Between(this.x, this.y, this.player.x, this.player.y);
    const body = this.body as Phaser.Physics.Arcade.Body;

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
