export const LEADERBOARD_NAME = 'ironprotocolruns';

const LOCAL_LEADERBOARD_KEY = 'ironProtocol_local_leaderboard_v1';
const MAX_LOCAL_ROWS = 20;
const SCORE_FLOOR_MULTIPLIER = 1_000_000;
const MAX_EXTRA_ITEM_FRAMES = 6;

const LOCAL_SAMPLE_NAMES = [
  'Ash', 'Mira', 'Rook', 'Nyx', 'Doran', 'Luna', 'Iris', 'Bran', 'Vera', 'Kite',
  'Oren', 'Cora', 'Tess', 'Milo', 'Rhea', 'Noel', 'Sera', 'Finn', 'Ayla', 'Kira',
];

type LocalLeaderboardEntry = {
  name: string;
  score: number;
  floor: number;
  coins: number;
  itemFrames: number[];
  itemCount: number;
  ts: number;
};

export type LeaderboardRow = {
  rank: number;
  name: string;
  floor: number;
  coins: number;
  score: number;
  itemFrames: number[];
  itemCount: number;
  isPlayer?: boolean;
};

function isLocalRuntime() {
  return window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
}

function scoreSort(a: LocalLeaderboardEntry, b: LocalLeaderboardEntry) {
  if (b.score !== a.score) return b.score - a.score;
  if (b.floor !== a.floor) return b.floor - a.floor;
  if (b.coins !== a.coins) return b.coins - a.coins;
  return a.ts - b.ts;
}

function readLocalEntries(): LocalLeaderboardEntry[] {
  try {
    const raw = localStorage.getItem(LOCAL_LEADERBOARD_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((row): row is LocalLeaderboardEntry => (
      row &&
      typeof row.name === 'string' &&
      typeof row.score === 'number' &&
      typeof row.floor === 'number' &&
      typeof row.coins === 'number' &&
      Array.isArray(row.itemFrames) &&
      (typeof row.itemCount === 'number' || typeof row.itemCount === 'undefined') &&
      typeof row.ts === 'number'
    ));
  } catch {
    return [];
  }
}

function writeLocalEntries(rows: LocalLeaderboardEntry[]) {
  try {
    localStorage.setItem(
      LOCAL_LEADERBOARD_KEY,
      JSON.stringify([...rows].sort(scoreSort).slice(0, MAX_LOCAL_ROWS)),
    );
  } catch {}
}

function buildSampleRows(): LocalLeaderboardEntry[] {
  return LOCAL_SAMPLE_NAMES.map((name, i) => {
    const floor = Math.max(1, 11 - Math.floor(i / 2));
    const coins = 30 + (LOCAL_SAMPLE_NAMES.length - i) * 9;
    return {
      name,
      floor,
      coins,
      itemFrames: i % 3 === 0 ? [1099, 670, 1818] : i % 3 === 1 ? [729, 1788] : [1124, 1818, 670, 729],
      itemCount: i % 3 === 0 ? 3 : i % 3 === 1 ? 2 : 4,
      score: scoreFromRun(floor, coins),
      ts: i,
    };
  });
}

function ensureLocalRows() {
  const rows = readLocalEntries();
  if (rows.length > 0) return [...rows].sort(scoreSort);
  const seeded = buildSampleRows();
  writeLocalEntries(seeded);
  return seeded;
}

export function scoreFromRun(floor: number, coins: number) {
  return Math.max(0, floor) * SCORE_FLOOR_MULTIPLIER + Math.max(0, coins);
}

export function encodeLeaderboardExtraData(floor: number, coins: number, itemFrames: number[]) {
  return JSON.stringify({
    f: floor,
    c: coins,
    i: itemFrames.slice(0, MAX_EXTRA_ITEM_FRAMES),
    ic: itemFrames.length,
  });
}

export function decodeLeaderboardExtraData(extraData: string | undefined, score: number) {
  try {
    if (extraData) {
      const parsed = JSON.parse(extraData);
      const floor = typeof parsed?.f === 'number' ? parsed.f : parsed?.floor;
      const coins = typeof parsed?.c === 'number' ? parsed.c : parsed?.coins;
      const itemFrames = Array.isArray(parsed?.i)
        ? parsed.i.filter((n: unknown) => typeof n === 'number').slice(0, MAX_EXTRA_ITEM_FRAMES)
        : [];
      const itemCount = typeof parsed?.ic === 'number' ? parsed.ic : itemFrames.length;
      if (typeof floor === 'number' && typeof coins === 'number') {
        return { floor, coins, itemFrames, itemCount };
      }
    }
  } catch {}

  return {
    floor: Math.max(1, Math.floor(score / SCORE_FLOOR_MULTIPLIER)),
    coins: Math.max(0, score % SCORE_FLOOR_MULTIPLIER),
    itemFrames: [] as number[],
    itemCount: 0,
  };
}

export function saveRunToLocalLeaderboard(floor: number, coins: number, itemFrames: number[], name = 'You') {
  const rows = ensureLocalRows();
  const score = scoreFromRun(floor, coins);
  const now = Date.now();
  const existingIndex = rows.findIndex((row) => row.name === name);

  if (existingIndex >= 0) {
    if (rows[existingIndex].score >= score) {
      writeLocalEntries(rows);
      return;
    }
    rows[existingIndex] = {
      name,
      floor,
      coins,
      itemFrames: itemFrames.slice(0, MAX_EXTRA_ITEM_FRAMES),
      itemCount: itemFrames.length,
      score,
      ts: now,
    };
  } else {
    rows.push({
      name,
      floor,
      coins,
      itemFrames: itemFrames.slice(0, MAX_EXTRA_ITEM_FRAMES),
      itemCount: itemFrames.length,
      score,
      ts: now,
    });
  }
  writeLocalEntries(rows);
}

export async function submitRunToLeaderboards(floor: number, coins: number, itemFrames: number[]) {
  saveRunToLocalLeaderboard(floor, coins, itemFrames);

  const ysdk = (window as any).ysdk;
  if (!ysdk?.leaderboards?.setScore) return;
  const nextScore = scoreFromRun(floor, coins);
  const nextExtraData = encodeLeaderboardExtraData(floor, coins, itemFrames);

  try {
    const available = await ysdk.isAvailableMethod?.('leaderboards.setScore');
    if (available === false) return;
  } catch {}

  try {
    const playerEntryAvailable = await ysdk.isAvailableMethod?.('leaderboards.getPlayerEntry');
    if (playerEntryAvailable !== false && ysdk?.leaderboards?.getPlayerEntry) {
      try {
        const currentEntry = await ysdk.leaderboards.getPlayerEntry(LEADERBOARD_NAME);
        if ((currentEntry?.score ?? -1) >= nextScore) {
          return;
        }
      } catch (err: any) {
        if (err?.code !== 'LEADERBOARD_PLAYER_NOT_PRESENT') {
          return;
        }
      }
    }
  } catch {}

  try {
    await ysdk.leaderboards.setScore(
      LEADERBOARD_NAME,
      nextScore,
      nextExtraData,
    );
  } catch {}
}

function dedupeRows(rows: LeaderboardRow[]) {
  const seen = new Set<string>();
  const out: LeaderboardRow[] = [];
  for (const row of rows) {
    const key = `${row.rank}:${row.name}:${row.score}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
}

function getLocalLeaderboardRows(): LeaderboardRow[] {
  return ensureLocalRows()
    .sort(scoreSort)
    .slice(0, MAX_LOCAL_ROWS)
    .map((entry, i) => ({
      rank: i + 1,
      name: entry.name,
      floor: entry.floor,
      coins: entry.coins,
      score: entry.score,
      itemFrames: entry.itemFrames ?? [],
      itemCount: entry.itemCount ?? entry.itemFrames?.length ?? 0,
      isPlayer: isLocalRuntime() && entry.name === 'You',
    }));
}

export async function loadLeaderboardRows(hiddenUserLabel: string): Promise<LeaderboardRow[]> {
  const ysdk = (window as any).ysdk;
  if (!ysdk?.leaderboards?.getEntries) {
    return getLocalLeaderboardRows();
  }

  try {
    const result = await ysdk.leaderboards.getEntries(LEADERBOARD_NAME, {
      quantityTop: 20,
      includeUser: true,
      quantityAround: 3,
    });

    const rows = dedupeRows((result?.entries ?? []).map((entry: any) => {
      const extra = decodeLeaderboardExtraData(entry?.extraData, entry?.score ?? 0);
      return {
        rank: entry?.rank ?? 0,
        name: entry?.player?.publicName || hiddenUserLabel,
        floor: extra.floor,
        coins: extra.coins,
        score: entry?.score ?? 0,
        itemFrames: extra.itemFrames ?? [],
        itemCount: extra.itemCount ?? extra.itemFrames?.length ?? 0,
      } satisfies LeaderboardRow;
    }));

    if (rows.length > 0) return rows;
  } catch {}

  return getLocalLeaderboardRows();
}
