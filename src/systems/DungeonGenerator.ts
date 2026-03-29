import balance from '../data/balance.json';

export const TILE_WALL  = 0;
export const TILE_FLOOR = 1;
export const TILE_STAIR = 2;

export interface Room {
  x: number; // tile col of top-left interior
  y: number; // tile row of top-left interior
  w: number; // width in tiles
  h: number; // height in tiles
  type: 'start' | 'normal' | 'stairs';
}

export interface DungeonMap {
  tiles: number[][];
  width: number;
  height: number;
  rooms: Room[];
  playerStart: { x: number; y: number }; // tile coords
  stairPos:    { x: number; y: number }; // tile coords
}

function rndInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function roomCenter(room: Room): { cx: number; cy: number } {
  return {
    cx: Math.floor(room.x + room.w / 2),
    cy: Math.floor(room.y + room.h / 2),
  };
}

function carveCorridor(tiles: number[][], r1: Room, r2: Room, corridorWidth: number) {
  const { cx: x1, cy: y1 } = roomCenter(r1);
  const { cx: x2, cy: y2 } = roomCenter(r2);
  const w = corridorWidth;

  // Horizontal then vertical (L-shape)
  const minX = Math.min(x1, x2);
  const maxX = Math.max(x1, x2);
  for (let col = minX; col <= maxX; col++) {
    for (let dw = 0; dw < w; dw++) {
      if (y1 + dw < tiles.length) tiles[y1 + dw][col] = TILE_FLOOR;
    }
  }
  const minY = Math.min(y1, y2);
  const maxY = Math.max(y1, y2);
  for (let row = minY; row <= maxY; row++) {
    for (let dw = 0; dw < w; dw++) {
      if (row < tiles.length && x2 + dw < tiles[0].length) tiles[row][x2 + dw] = TILE_FLOOR;
    }
  }
}

// ── BSP Node ──────────────────────────────────────────────

interface BSPNode {
  x: number; y: number; w: number; h: number;
  left:  BSPNode | null;
  right: BSPNode | null;
  room:  Room | null;
}

function makeNode(x: number, y: number, w: number, h: number): BSPNode {
  return { x, y, w, h, left: null, right: null, room: null };
}

function splitNode(node: BSPNode, minLeaf: number, depth: number): void {
  if (depth === 0) return;

  const splitH = node.w > node.h * 1.25
    ? false   // vertical split (divide left/right)
    : node.h > node.w * 1.25
      ? true  // horizontal split (divide top/bottom)
      : Math.random() < 0.5;

  if (splitH) {
    // Horizontal split: top half and bottom half
    const splitMin = minLeaf;
    const splitMax = node.h - minLeaf;
    if (splitMax < splitMin) return; // too small to split
    const splitAt = rndInt(splitMin, splitMax);
    node.left  = makeNode(node.x, node.y, node.w, splitAt);
    node.right = makeNode(node.x, node.y + splitAt, node.w, node.h - splitAt);
  } else {
    // Vertical split: left half and right half
    const splitMin = minLeaf;
    const splitMax = node.w - minLeaf;
    if (splitMax < splitMin) return;
    const splitAt = rndInt(splitMin, splitMax);
    node.left  = makeNode(node.x, node.y, splitAt, node.h);
    node.right = makeNode(node.x + splitAt, node.y, node.w - splitAt, node.h);
  }

  splitNode(node.left!, minLeaf, depth - 1);
  splitNode(node.right!, minLeaf, depth - 1);
}

function carveRooms(
  node: BSPNode,
  tiles: number[][],
  rooms: Room[],
  padding: number,
): void {
  if (!node.left && !node.right) {
    // Leaf — place a room
    const maxW = node.w - padding * 2;
    const maxH = node.h - padding * 2;
    if (maxW < 4 || maxH < 4) return;

    const rw = rndInt(4, maxW);
    const rh = rndInt(4, maxH);
    const rx = node.x + padding + rndInt(0, maxW - rw);
    const ry = node.y + padding + rndInt(0, maxH - rh);

    const room: Room = { x: rx, y: ry, w: rw, h: rh, type: 'normal' };
    for (let row = ry; row < ry + rh; row++) {
      for (let col = rx; col < rx + rw; col++) {
        tiles[row][col] = TILE_FLOOR;
      }
    }
    node.room = room;
    rooms.push(room);
    return;
  }

  if (node.left)  carveRooms(node.left,  tiles, rooms, padding);
  if (node.right) carveRooms(node.right, tiles, rooms, padding);
}

function connectNode(node: BSPNode, tiles: number[][], corridorWidth: number): void {
  if (!node.left || !node.right) return;

  connectNode(node.left,  tiles, corridorWidth);
  connectNode(node.right, tiles, corridorWidth);

  const leftRoom  = getLeafRoom(node.left);
  const rightRoom = getLeafRoom(node.right);
  if (leftRoom && rightRoom) {
    carveCorridor(tiles, leftRoom, rightRoom, corridorWidth);
  }
}

/** Returns any room from the subtree (picks deepest-left leaf) */
function getLeafRoom(node: BSPNode): Room | null {
  if (node.room) return node.room;
  return getLeafRoom(node.left ?? node.right!)
    ?? (node.right ? getLeafRoom(node.right) : null);
}

// ── Flood-fill connectivity check ────────────────────────

function floodFill(tiles: number[][], startX: number, startY: number): Set<number> {
  const W = tiles[0].length;
  const H = tiles.length;
  const visited = new Set<number>();
  const queue: number[] = [startY * W + startX];
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];

  while (queue.length) {
    const key = queue.pop()!;
    if (visited.has(key)) continue;
    visited.add(key);
    const row = Math.floor(key / W);
    const col = key % W;
    for (const [dc, dr] of dirs) {
      const nr = row + dr, nc = col + dc;
      if (nr < 0 || nr >= H || nc < 0 || nc >= W) continue;
      if (tiles[nr][nc] === TILE_WALL) continue;
      const nk = nr * W + nc;
      if (!visited.has(nk)) queue.push(nk);
    }
  }
  return visited;
}

// ── BFS distance from start room ─────────────────────────

function bfsDistance(tiles: number[][], startX: number, startY: number): Map<number, number> {
  const W = tiles[0].length;
  const H = tiles.length;
  const dist = new Map<number, number>();
  const queue: Array<[number, number, number]> = [[startX, startY, 0]];
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];

  while (queue.length) {
    const [cx, cy, d] = queue.shift()!;
    const key = cy * W + cx;
    if (dist.has(key)) continue;
    dist.set(key, d);
    for (const [dc, dr] of dirs) {
      const nx = cx + dc, ny = cy + dr;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (tiles[ny][nx] === TILE_WALL) continue;
      if (!dist.has(ny * W + nx)) queue.push([nx, ny, d + 1]);
    }
  }
  return dist;
}

// ── Main export ───────────────────────────────────────────

export function generateDungeon(): DungeonMap {
  const d = balance.dungeon;
  const MAP_W    = d.mapWidth;
  const MAP_H    = d.mapHeight;
  const padding  = d.roomPadding;
  const minLeaf  = d.minLeafSize;
  const corrW    = d.corridorWidth;
  const extras   = d.extraCorridors;
  const depth    = rndInt(d.bspDepthMin, d.bspDepthMax);

  const tiles: number[][] = Array.from({ length: MAP_H }, () =>
    new Array(MAP_W).fill(TILE_WALL)
  );

  // Build BSP tree (leave 1-tile border)
  const root = makeNode(1, 1, MAP_W - 2, MAP_H - 2);
  splitNode(root, minLeaf, depth);

  const rooms: Room[] = [];
  carveRooms(root, tiles, rooms, padding);
  connectNode(root, tiles, corrW);

  // Guarantee connectivity: flood-fill from first room
  const start = rooms[0];
  const { cx: sx0, cy: sy0 } = roomCenter(start);
  let reachable = floodFill(tiles, sx0, sy0);

  for (const room of rooms) {
    const { cx, cy } = roomCenter(room);
    if (!reachable.has(cy * MAP_W + cx)) {
      carveCorridor(tiles, start, room, corrW);
      reachable = floodFill(tiles, sx0, sy0);
    }
  }

  // Extra corridors (loops)
  for (let i = 0; i < extras && rooms.length >= 2; i++) {
    const a = rooms[rndInt(0, rooms.length - 1)];
    const b = rooms[rndInt(0, rooms.length - 1)];
    if (a !== b) carveCorridor(tiles, a, b, corrW);
  }

  // Mark start room
  rooms[0].type = 'start';

  // BFS to find farthest room from start → stairs
  const distMap = bfsDistance(tiles, sx0, sy0);
  let farthestRoom = rooms[0];
  let maxDist = 0;
  for (const room of rooms) {
    const { cx, cy } = roomCenter(room);
    const d2 = distMap.get(cy * MAP_W + cx) ?? 0;
    if (d2 > maxDist) { maxDist = d2; farthestRoom = room; }
  }
  farthestRoom.type = 'stairs';
  const { cx: stairX, cy: stairY } = roomCenter(farthestRoom);
  tiles[stairY][stairX] = TILE_STAIR;

  return {
    tiles,
    width: MAP_W,
    height: MAP_H,
    rooms,
    playerStart: { x: sx0, y: sy0 },
    stairPos:    { x: stairX, y: stairY },
  };
}

/** Returns true if a wall tile borders at least one floor tile (for rendering) */
export function isEdgeWall(tiles: number[][], col: number, row: number): boolean {
  if (tiles[row][col] !== TILE_WALL) return false;
  const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,-1],[-1,1],[1,1]];
  for (const [dc, dr] of dirs) {
    const nr = row + dr;
    const nc = col + dc;
    if (nr >= 0 && nr < tiles.length && nc >= 0 && nc < tiles[0].length) {
      if (tiles[nr][nc] !== TILE_WALL) return true;
    }
  }
  return false;
}
