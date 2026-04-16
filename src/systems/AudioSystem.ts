import Phaser from 'phaser';

// SFX groups — AudioSystem picks randomly within each group on play()
const SFX_GROUPS: Record<string, string[]> = {
  sword:        ['sfx_sword_1', 'sfx_sword_2', 'sfx_sword_3'],
  lunge:        ['sfx_ehit_1',  'sfx_ehit_2'],
  arrow:        ['sfx_arrow_1', 'sfx_arrow_2'],
  player_hit:   ['sfx_phit_1',  'sfx_phit_2',  'sfx_phit_3'],
  player_death: ['sfx_pdeath'],
  enemy_hit:    ['sfx_ehit_1',  'sfx_ehit_2',  'sfx_ehit_3'],
  enemy_death:  ['sfx_edeath'],
  chest:        ['sfx_chest_1', 'sfx_chest_2', 'sfx_chest_3'],
  buy:          ['sfx_buy'],
};

const AUDIO_FILES: Record<string, string> = {
  music_regular: 'music/Minifantasy_Dungeon_Music/Minifantasy_Dungeon_Music/Music/Goblins_Den_(Regular).wav',
  music_battle:  'music/Minifantasy_Dungeon_Music/Minifantasy_Dungeon_Music/Music/Goblins_Dance_(Battle).wav',
  sfx_sword_1:   'music/Minifantasy_Dungeon_SFX/07_human_atk_sword_1.wav',
  sfx_sword_2:   'music/Minifantasy_Dungeon_SFX/07_human_atk_sword_2.wav',
  sfx_sword_3:   'music/Minifantasy_Dungeon_SFX/07_human_atk_sword_3.wav',
  sfx_lunge_1:   'music/Minifantasy_Dungeon_SFX/08_human_charge_1.wav',
  sfx_lunge_2:   'music/Minifantasy_Dungeon_SFX/08_human_charge_2.wav',
  sfx_arrow_1:   'music/Minifantasy_Dungeon_SFX/27_sword_miss_1.wav',
  sfx_arrow_2:   'music/Minifantasy_Dungeon_SFX/27_sword_miss_2.wav',
  sfx_phit_1:    'music/Minifantasy_Dungeon_SFX/11_human_damage_1.wav',
  sfx_phit_2:    'music/Minifantasy_Dungeon_SFX/11_human_damage_2.wav',
  sfx_phit_3:    'music/Minifantasy_Dungeon_SFX/11_human_damage_3.wav',
  sfx_pdeath:    'music/Minifantasy_Dungeon_SFX/14_human_death_spin.wav',
  sfx_ehit_1:    'music/Minifantasy_Dungeon_SFX/26_sword_hit_1.wav',
  sfx_ehit_2:    'music/Minifantasy_Dungeon_SFX/26_sword_hit_2.wav',
  sfx_ehit_3:    'music/Minifantasy_Dungeon_SFX/26_sword_hit_3.wav',
  sfx_edeath:    'music/Minifantasy_Dungeon_SFX/24_orc_death_spin.wav',
  sfx_chest_1:   'music/Minifantasy_Dungeon_SFX/01_chest_open_1.wav',
  sfx_chest_2:   'music/Minifantasy_Dungeon_SFX/01_chest_open_2.wav',
  sfx_chest_3:   'music/Minifantasy_Dungeon_SFX/01_chest_open_3.wav',
  sfx_buy:       'music/Minifantasy_Dungeon_SFX/02_chest_close_1.wav',
};

const MUSIC_VOL = 0.35;
const SFX_VOL   = 0.25;

export class AudioSystem {
  private scene:           Phaser.Scene;
  private music:           Phaser.Sound.BaseSound | null = null;
  private currentMusicKey: string  = '';
  private battleMode:      boolean = false;
  private pendingBattle:   boolean | null = null; // queued setBattleMode before load
  private ready = false;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
    this.loadAudio();
  }

  // ── Music ──────────────────────────────────────────────────────────────────

  /** Switch between regular / battle music. No-op if already on that track. */
  setBattleMode(battle: boolean): void {
    if (!this.ready) { this.pendingBattle = battle; return; }
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
    if (!this.ready) return;
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
    this.ready = false;
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private loadAudio(): void {
    const cache = this.scene.cache.audio;
    const loader = this.scene.load;
    let queued = 0;

    for (const [key, path] of Object.entries(AUDIO_FILES)) {
      if (!cache.has(key)) {
        loader.audio(key, path);
        queued++;
      }
    }

    if (queued === 0) {
      // All already cached (floor transition)
      this.onReady();
      return;
    }

    loader.once('complete', () => this.onReady());
    loader.start();
  }

  private onReady(): void {
    this.ready = true;
    const battle = this.pendingBattle ?? false;
    this.pendingBattle = null;
    this.setBattleMode(battle);
  }
}
