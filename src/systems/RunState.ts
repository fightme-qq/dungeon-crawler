import balance from '../data/balance.json';

export interface PlayerStats {
  attack:         number;  // melee base damage (attack1 and attack2)
  arrowDamage:    number;  // arrow base damage
  armor:          number;  // flat damage reduction
  critMultiplier: number;  // e.g. 1.2 = deal 120% on crit
  critChance:     number;  // e.g. 0.15 = 15% crit rate
  maxHp:          number;
}

const KEY = 'playerStats';

export function baseStats(): PlayerStats {
  return {
    attack:         balance.player.attack,
    arrowDamage:    balance.player.attack3.damage,
    armor:          balance.player.armor,
    critMultiplier: balance.player.critMultiplier,
    critChance:     balance.player.critChance,
    maxHp:          balance.player.hp,
  };
}

export function getStats(registry: Phaser.Data.DataManager): PlayerStats {
  return (registry.get(KEY) as PlayerStats | undefined) ?? baseStats();
}

export function setStats(registry: Phaser.Data.DataManager, stats: PlayerStats): void {
  registry.set(KEY, { ...stats });
}

export function clearStats(registry: Phaser.Data.DataManager): void {
  registry.remove(KEY);
}
