import balance from '../data/balance.json';

export interface PlayerStats {
  attack:         number;  // melee base damage (attack1 and attack2)
  arrowDamage:    number;  // arrow base damage
  armor:          number;  // flat damage reduction
  critMultiplier: number;  // e.g. 1.2 = deal 120% on crit
  critChance:     number;  // e.g. 0.15 = 15% crit rate
  maxHp:          number;
}

// ── localStorage save (Rule 1.9: page refresh preserves run) ─────────────────

const SAVE_KEY = 'ironProtocol_save_v1';

interface SaveData {
  floor:  number;
  hp:     number;
  coins:  number;
  stats:  PlayerStats;
}

export function saveRun(floor: number, hp: number, coins: number, stats: PlayerStats): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ floor, hp, coins, stats }));
  } catch {}
}

export function loadRun(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SaveData;
  } catch {
    return null;
  }
}

export function clearRun(): void {
  try { localStorage.removeItem(SAVE_KEY); } catch {}
}

// ── Phaser registry ───────────────────────────────────────────────────────────

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
