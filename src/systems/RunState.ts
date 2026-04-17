import balance from '../data/balance.json';

export interface PlayerStats {
  attack:         number;  // melee base damage (attack1 and attack2)
  arrowDamage:    number;  // arrow base damage
  armor:          number;  // flat damage reduction
  critMultiplier: number;  // e.g. 1.2 = deal 120% on crit
  critChance:     number;  // e.g. 0.15 = 15% crit rate
  maxHp:          number;
}

export interface PlayerPerks {
  divineVolley: boolean;
  divineBloodOath: boolean;
}

// ── localStorage save (Rule 1.9: page refresh preserves run) ─────────────────

const SAVE_KEY = 'ironProtocol_save_v1';

export interface PurchasedItem { frame: number; name: string; }

interface SaveData {
  floor:          number;
  hp:             number;
  coins:          number;
  stats:          PlayerStats;
  perks:          PlayerPerks;
  purchasedItems: PurchasedItem[];
}

export function saveRun(
  floor: number, hp: number, coins: number,
  stats: PlayerStats, perks: PlayerPerks, purchasedItems: PurchasedItem[],
): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ floor, hp, coins, stats, perks, purchasedItems }));
  } catch {}
}

export function loadRun(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    if (!data.purchasedItems) data.purchasedItems = []; // back-compat
    if (!data.perks) data.perks = basePerks();
    return data;
  } catch {
    return null;
  }
}

export function clearRun(): void {
  try { localStorage.removeItem(SAVE_KEY); } catch {}
}

// ── Phaser registry ───────────────────────────────────────────────────────────

const KEY = 'playerStats';
const PERKS_KEY = 'playerPerks';

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

export function basePerks(): PlayerPerks {
  return {
    divineVolley: false,
    divineBloodOath: false,
  };
}

export function getStats(registry: Phaser.Data.DataManager): PlayerStats {
  return (registry.get(KEY) as PlayerStats | undefined) ?? baseStats();
}

export function setStats(registry: Phaser.Data.DataManager, stats: PlayerStats): void {
  registry.set(KEY, { ...stats });
}

export function getPerks(registry: Phaser.Data.DataManager): PlayerPerks {
  return (registry.get(PERKS_KEY) as PlayerPerks | undefined) ?? basePerks();
}

export function setPerks(registry: Phaser.Data.DataManager, perks: PlayerPerks): void {
  registry.set(PERKS_KEY, { ...perks });
}

export function clearStats(registry: Phaser.Data.DataManager): void {
  registry.remove(KEY);
}

export function clearPerks(registry: Phaser.Data.DataManager): void {
  registry.remove(PERKS_KEY);
}
