import Phaser from 'phaser';
import balance from '../data/balance.json';
import { Room } from './DungeonGenerator';
import { TILE_S } from '../utils/constants';
import { t } from '../lang';

export type StatKey = 'attack' | 'arrowDamage' | 'armor' | 'critMultiplier' | 'critChance' | 'maxHp';
const RARITY_COLORS_HEX = ['#aaaaaa', '#44cc44', '#4488ff', '#cc44ff', '#ffaa00', '#ff5a5a'];
const RARITY_COLORS_INT = [0xaaaaaa,  0x44cc44,  0x4488ff,  0xcc44ff,  0xffaa00,  0xff5a5a];

export interface SpecialEffect {
  type: 'divineVolley';
  extraArrows: number;
  damageMultiplier: number;
  angleOffsetDeg: number;
}

export interface StatBonus {
  statKey: StatKey;
  value:   number;
}

export interface ShopItemInstance {
  statKey:    StatKey;
  rarity:     number;
  bonuses:    StatBonus[];
  price:      number;
  name:       string;
  frame:      number;
  purchaseProductId?: string;
  premiumPrice?: number;
  specialEffect?: SpecialEffect;
  healToFull?: boolean; // special stair item — restores all HP
}

interface WorldItem {
  inst:   ShopItemInstance;
  sprite: Phaser.GameObjects.Image;
  card:   Phaser.GameObjects.Container;
  prompt: Phaser.GameObjects.Text;
  active: boolean;
}

const INTERACT_R = balance.shop.interactRadius;
const W = 135, H = 70;
const ICON_SRC_SIZE = 32;

// ── Icon & name pools per stat ────────────────────────────────────────────────

function fr(r: number, c: number) { return r * 16 + c; }
function frRange(r0: number, r1: number, c0 = 0, c1 = 15): number[] {
  const out: number[] = [];
  for (let r = r0; r <= r1; r++)
    for (let c = c0; c <= c1; c++) out.push(fr(r, c));
  return out;
}

const ICON_POOLS: Record<StatKey, number[]> = {
  attack:         frRange(90, 91),
  arrowDamage:    [fr(92,8),fr(92,9),fr(92,10),fr(92,11),fr(94,9),fr(94,10),fr(94,11)],
  armor:          frRange(128, 129),
  critMultiplier: frRange(105, 106),
  critChance:     frRange(107, 108),
  maxHp:          frRange(32, 33),
};


function pick<T>(arr: readonly T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }

export class ShopSystem {
  private scene: Phaser.Scene;
  private items: WorldItem[] = [];

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  spawnInRoom(room: Room, guaranteedItem?: ShopItemInstance): void {
    const s = balance.shop;
    const count = Phaser.Math.Between(s.itemCountMin, s.itemCountMax);

    const allKeys: StatKey[] = Object.keys(s.items) as StatKey[];
    const shuffledKeys = Phaser.Utils.Array.Shuffle([...allKeys]) as StatKey[];
    const quadrants    = Phaser.Utils.Array.Shuffle([0, 1, 2, 3]).slice(0, count) as number[];

    for (let i = 0; i < quadrants.length; i++) {
      const q  = quadrants[i];
      const qx = q % 2;               // 0 = left half, 1 = right half
      const qy = Math.floor(q / 2);   // 0 = top half,  1 = bottom half

      // Center of quadrant in world px + small random offset
      const wx = (room.x + room.w * (qx * 0.5 + 0.25)) * TILE_S
               + Phaser.Math.Between(-TILE_S / 2, TILE_S / 2);
      const wy = (room.y + room.h * (qy * 0.5 + 0.25)) * TILE_S
               + Phaser.Math.Between(-TILE_S / 2, TILE_S / 2);

      const key  = shuffledKeys[i % shuffledKeys.length];
      const inst = guaranteedItem && i === 0 ? guaranteedItem : this.rollItem(key);
      this.createWorldItem(wx, wy, inst);
    }
  }

  spawnHealItem(wx: number, wy: number): void {
    const foodFrames = [fr(32,0),fr(32,1),fr(32,2),fr(32,3),fr(32,4),fr(32,5),fr(32,6),fr(32,7),
                        fr(33,0),fr(33,1),fr(33,2),fr(33,3),fr(33,4),fr(33,5),fr(33,6),fr(33,7)];
    const inst: ShopItemInstance = {
      statKey:    'maxHp',
      rarity:     0,
      bonuses:    [],
      price:      balance.coins.goldValue * 5, // 5 gold = 50 silver
      name:       t().healItemName,
      frame:      pick(foodFrames),
      healToFull: true,
    };
    this.createWorldItem(wx, wy, inst);
  }

  // ── Update — call every frame from GameScene ──────────────────────
  // Returns the purchased item if E was pressed while in range, else null.
  update(px: number, py: number, coinValue: number, eJustDown: boolean): ShopItemInstance | null {
    let purchased: ShopItemInstance | null = null;

    for (const item of this.items) {
      if (!item.active) continue;

      // Depth-sort icon with world objects (same as player/enemies use body.bottom)
      item.sprite.setDepth(item.sprite.y + 16);

      const dist    = Phaser.Math.Distance.Between(px, py, item.sprite.x, item.sprite.y);
      const inRange = dist < INTERACT_R;
      const isPremium = !!item.inst.purchaseProductId;
      const paymentsAvailable = (window as any).__paymentsAvailable !== false;
      const canAfford = isPremium ? paymentsAvailable : coinValue >= item.inst.price;

      item.prompt.setVisible(inRange);
      item.prompt.setText(this.getPromptText(item.inst, canAfford));
      item.prompt.setColor(canAfford ? '#ffffff' : '#ff6666');

      if (inRange && eJustDown && canAfford && !purchased) {
        purchased = item.inst;
        if (!isPremium) {
          this.removeItem(item.inst);
        }
      }
    }

    this.items = this.items.filter(i => i.active);
    return purchased;
  }

  destroy(): void {
    for (const item of this.items) {
      if (!item.active) continue;
      item.sprite.destroy();
      item.card.destroy();
      item.prompt.destroy();
    }
    this.items = [];
  }

  removeItem(inst: ShopItemInstance): void {
    const item = this.items.find(i => i.inst === inst && i.active);
    if (!item) return;
    item.active = false;
    item.sprite.destroy();
    item.card.destroy();
    item.prompt.destroy();
    this.items = this.items.filter(i => i.active);
  }

  // ── Private ───────────────────────────────────────────────────────

  private rollItem(key: StatKey): ShopItemInstance {
    const s       = balance.shop;
    const itemDef = (s.items as Record<string, { name: string; frame: number; rarities: Array<{ min: number; max: number; price: number }> }>)[key];

    // Weighted rarity roll
    const weights = s.rarityWeights;
    const total   = weights.reduce((a, b) => a + b, 0);
    let rand      = Math.random() * total;
    let rarity    = weights.length - 1;
    for (let i = 0; i < weights.length; i++) {
      rand -= weights[i];
      if (rand <= 0) { rarity = i; break; }
    }

    const rar   = itemDef.rarities[rarity];
    const value = Phaser.Math.Between(rar.min, rar.max);
    const frame = pick(ICON_POOLS[key]);
    const name  = pick(t().itemNames[key]);

    // Build bonus list — Epic gets 2, Legendary gets 3 stats
    const bonusCount = rarity >= 4 ? 3 : rarity >= 3 ? 2 : 1;
    const bonuses: StatBonus[] = [{ statKey: key, value }];

    if (bonusCount > 1) {
      const allKeys: StatKey[] = ['attack','arrowDamage','armor','critMultiplier','critChance','maxHp'];
      const extras = Phaser.Utils.Array.Shuffle(
        allKeys.filter(k => !bonuses.some(b => b.statKey === k))
      ) as StatKey[];
      for (let i = 0; i < bonusCount - 1 && i < extras.length; i++) {
        const ek    = extras[i];
        const eDef  = (s.items as Record<string, { rarities: Array<{ min: number; max: number; price: number }> }>)[ek];
        const eTier = eDef.rarities[0]; // Common tier values for secondary bonuses
        bonuses.push({ statKey: ek, value: Phaser.Math.Between(eTier.min, eTier.max) });
      }
    }

    return { statKey: key, rarity, bonuses, price: rar.price, name: name as string, frame };
  }

  private createWorldItem(wx: number, wy: number, inst: ShopItemInstance): void {
    const scene  = this.scene;
    const iconSz = 32;

    // World sprite — floating icon
    const sprite = scene.add.image(wx, wy, 'icons', inst.frame)
      .setDisplaySize(iconSz, iconSz)
      .setDepth(400);
    if (inst.rarity === 5) {
      sprite.setCrop(0, 0, ICON_SRC_SIZE, ICON_SRC_SIZE - 1);
    }

    scene.tweens.add({
      targets:  sprite,
      y:        wy - 8,
      duration: 1000,
      yoyo:     true,
      repeat:   -1,
      ease:     'Sine.InOut',
    });

    // Card container — always above player/enemies
    const card = this.buildCard(inst);
    card.setPosition(wx, wy - iconSz / 2 - 6).setDepth(100000);

    // Prompt text — always above player/enemies
    const prompt = scene.add.text(wx, wy + iconSz / 2 + 4, t().pressEBuy, {
      fontSize: '13px', fontStyle: 'bold', color: '#ffffff',
      stroke: '#000000', strokeThickness: 4,
      resolution: 4,
    }).setOrigin(0.5, 0).setDepth(100000).setVisible(false);

    this.items.push({ inst, sprite, card, prompt, active: true });
  }

  private buildCard(inst: ShopItemInstance): Phaser.GameObjects.Container {
    const s    = this.scene;
    const col  = inst.healToFull ? 0x44ff88 : RARITY_COLORS_INT[inst.rarity];
    const colH = inst.healToFull ? '#44ff88' : RARITY_COLORS_HEX[inst.rarity];
    const LINE  = 13;
    const PAD_L = 28; // left text offset from card edge
    const PAD_R = 10;
    const MIN_W = 90;

    // ── 1. Create text objects to measure width ────────────────────────────────
    const nameText = s.add.text(0, 0, inst.name, {
      fontSize: '11px', fontStyle: 'bold', color: '#ffffff', resolution: 4,
    }).setOrigin(0, 0);

    const rarLabel = inst.healToFull ? t().healItemRarity : t().rarities[inst.rarity];
    const rarText = s.add.text(0, 0, rarLabel, {
      fontSize: '10px', fontStyle: 'bold', color: colH, resolution: 4,
    }).setOrigin(0, 0);

    const bonusLines = inst.healToFull
      ? [t().healItemEffect]
      : [
          ...inst.bonuses.map(b => this.formatBonus(b)),
          ...(inst.specialEffect ? [this.formatSpecialEffect(inst.specialEffect)] : []),
        ];

    const bonusObjs: Phaser.GameObjects.Text[] = bonusLines.map(line =>
      s.add.text(0, 0, line, {
        fontSize: '10px', fontStyle: 'bold', color: '#ffffff', resolution: 4,
      }).setOrigin(0, 0)
    );

    // ── 2. Measure price row width ─────────────────────────────────────────────
    const bc      = balance.coins;
    const reds    = Math.floor(inst.price / 100);
    const golds   = Math.floor((inst.price % 100) / 10);
    const silvers = inst.price % 10;
    const groups: Array<{ frame: number; count: number }> = [];
    if (reds    > 0) groups.push({ frame: bc.redFrame,    count: reds });
    if (golds   > 0) groups.push({ frame: bc.goldFrame,   count: golds });
    if (silvers > 0) groups.push({ frame: bc.silverFrame, count: silvers });

    const priceTxts = groups.map(g => s.add.text(0, 0, String(g.count), {
      fontSize: '11px', fontStyle: 'bold', color: '#dddddd', resolution: 4,
    }));
    const premiumPriceText = inst.premiumPrice != null
      ? s.add.text(0, 0, this.formatPremiumPrice(inst.premiumPrice), {
          fontSize: '11px', fontStyle: 'bold', color: '#ffaaaa', resolution: 4,
        }).setOrigin(0, 0)
      : null;
    const priceRowW = premiumPriceText
      ? premiumPriceText.width + 12
      : groups.length * (14 + 2) + priceTxts.reduce((sum, txt) => sum + txt.width + 4, 6);

    // ── 3. Calculate card width from widest element ────────────────────────────
    const allWidths = [
      nameText.width,
      rarText.width,
      ...bonusObjs.map(b => b.width),
      priceRowW,
    ];
    const cardW = Math.max(MIN_W, Math.max(...allWidths) + PAD_L + PAD_R);
    const cardH = H + (bonusLines.length - 1) * LINE;

    // ── 4. Position everything now that cardW is known ─────────────────────────
    const lx = -cardW / 2; // left card edge
    const tx = lx + PAD_L; // text start x

    const bg     = s.add.rectangle(0, 0, cardW, cardH, 0x111111, 0.75).setOrigin(0.5, 1);
    const border = s.add.rectangle(0, 0, cardW, cardH).setOrigin(0.5, 1)
      .setStrokeStyle(1.5, col).setFillStyle(0, 0);
    const divineOuterGlow = inst.rarity === 5
      ? s.add.rectangle(0, 0, cardW + 18, cardH + 18, 0x5a1010, 0.16).setOrigin(0.5, 1)
      : null;
    const divineMidGlow = inst.rarity === 5
      ? s.add.rectangle(0, 0, cardW + 10, cardH + 10, 0xa81818, 0.22).setOrigin(0.5, 1)
      : null;

    const iconImg = s.add.image(lx + 13, -cardH + 30, 'icons', inst.frame)
      .setDisplaySize(20, 20).setOrigin(0.5, 0.5);
    if (inst.rarity === 5) {
      iconImg.setCrop(0, 0, ICON_SRC_SIZE, ICON_SRC_SIZE - 1);
    }

    nameText.setPosition(tx, -cardH + 5);
    rarText .setPosition(tx, -cardH + 20);
    bonusObjs.forEach((b, i) => b.setPosition(tx, -cardH + 34 + i * LINE));

    // Price row
    const priceChildren: Phaser.GameObjects.GameObject[] = [];
    if (premiumPriceText) {
      premiumPriceText.setPosition(lx + 8, -16);
      priceChildren.push(premiumPriceText);
    } else {
      let cx = lx + 6;
      groups.forEach((g, i) => {
        const icon = s.add.image(cx, -9, 'icons', g.frame).setDisplaySize(14, 14).setOrigin(0, 0.5);
        priceTxts[i].setPosition(cx + 16, -16);
        priceChildren.push(icon, priceTxts[i]);
        cx += 16 + priceTxts[i].width + 4;
      });
    }

    const children: Phaser.GameObjects.GameObject[] = [bg, border];
    if (divineOuterGlow) children.unshift(divineOuterGlow);
    if (divineMidGlow) children.unshift(divineMidGlow);
    children.push(iconImg, nameText, rarText, ...bonusObjs, ...priceChildren);

    return s.add.container(0, 0, children);
  }

  private formatBonus(b: StatBonus): string {
    return t().statBonus[b.statKey](b.value);
  }

  private formatSpecialEffect(effect: SpecialEffect): string {
    switch (effect.type) {
      case 'divineVolley':
        return t().specialEffects.divineVolley(
          effect.extraArrows,
          Math.round(effect.damageMultiplier * 100),
        );
    }
  }

  private getPromptText(inst: ShopItemInstance, canAfford: boolean): string {
    if (inst.purchaseProductId) {
      if (!canAfford) return t().paymentsUnavailable;
      const price = inst.premiumPrice ?? 0;
      return t().pressEBuyPremium(price);
    }
    return canAfford ? t().pressEBuy : t().needSilver(inst.price);
  }

  private formatPremiumPrice(price: number): string {
    return t().portalPrice(price);
  }
}
