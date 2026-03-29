/** DamageTaken = BaseDamage / (1 + Armor / 100) */
export function calcDamage(baseDamage: number, armor: number): number {
  return baseDamage / (1 + armor / 100);
}
