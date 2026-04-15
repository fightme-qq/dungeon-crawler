import Phaser from 'phaser';

// SFX groups — AudioSystem picks randomly within each group on play()
const SFX_GROUPS: Record<string, string[]> = {
  sword:        ['sfx_sword_1', 'sfx_sword_2', 'sfx_sword_3'],
  lunge:        ['sfx_ehit_1',  'sfx_ehit_2'],
  arrow:        ['sfx_arrow'],
  player_hit:   ['sfx_phit_1',  'sfx_phit_2',  'sfx_phit_3'],
  player_death: ['sfx_pdeath'],
  enemy_hit:    ['sfx_ehit_1',  'sfx_ehit_2',  'sfx_ehit_3'],
  enemy_death:  ['sfx_edeath'],
  chest:        ['sfx_chest_1', 'sfx_chest_2', 'sfx_chest_3', 'sfx_chest_4'],
  buy:          ['sfx_buy'],
};

const MUSIC_VOL = 0.35;
const SFX_VOL   = 0.35;

export class AudioSystem {
  private scene:            Phaser.Scene;
  private music:            Phaser.Sound.BaseSound | null = null;
  private currentMusicKey:  string = '';
  private battleMode:       boolean = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  // ── Music ──────────────────────────────────────────────────────────────────

  /** Switch between regular / battle music. No-op if already on that track. */
  setBattleMode(battle: boolean): void {
    if (this.battleMode === battle && this.music) return;
    this.battleMode = battle;
    const key = battle ? 'music_battle' : 'music_regular';
    if (this.currentMusicKey === key) return;
    this.music?.stop();
    this.currentMusicKey = key;
    this.music = this.scene.sound.add(key, { loop: true, volume: MUSIC_VOL });
    this.music.play();
  }

  // ── SFX ───────────────────────────────────────────────────────────────────

  play(group: string): void {
    const keys = SFX_GROUPS[group];
    if (!keys?.length) return;
    const key = keys[Math.floor(Math.random() * keys.length)];
    try {
      this.scene.sound.play(key, { volume: SFX_VOL });
    } catch {}
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  destroy(): void {
    this.music?.stop();
    this.music = null;
    this.currentMusicKey = '';
  }
}
