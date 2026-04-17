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

const MUSIC_POOL = ['music_ambient1', 'music_ambient2'];

const AUDIO_FILES: Record<string, string> = {
  music_ambient1: 'music/Minifantasy_Dungeon_Music/dusk-memory-aesthetic-danger-lion-x-main-version-11376-02-13.mp3',
  music_ambient2: 'music/Minifantasy_Dungeon_Music/time-lost-ill-kitchen-main-version-6513-03-14.mp3',
  sfx_sword_1:   'music/Minifantasy_Dungeon_SFX/07_human_atk_sword_1.wav',
  sfx_sword_2:   'music/Minifantasy_Dungeon_SFX/07_human_atk_sword_2.wav',
  sfx_sword_3:   'music/Minifantasy_Dungeon_SFX/07_human_atk_sword_3.wav',
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

const MUSIC_VOL = 0.15;
const SFX_VOL   = 0.25;

export class AudioSystem {
  private scene:          Phaser.Scene;
  private music:          Phaser.Sound.BaseSound | null = null;
  private currentKey      = '';
  private sfxReady        = false;
  private destroyed       = false;

  private readonly onLoadComplete = () => this.onReady();
  private readonly onMusicEnd     = () => { if (!this.destroyed) this.playNext(); };

  constructor(scene: Phaser.Scene) {
    this.scene = scene;

    // Re-attach to music already playing from the previous floor
    const sounds = (scene.sound as any).sounds as Phaser.Sound.BaseSound[];
    for (const s of sounds) {
      if (MUSIC_POOL.includes(s.key) && (s as any).isPlaying) {
        this.music     = s;
        this.currentKey = s.key;
        // Replace old complete-listener with ours
        s.removeAllListeners('complete');
        s.on('complete', this.onMusicEnd);
        break;
      }
    }

    this.loadAudio();
  }

  // ── kept for GameScene compatibility, now a no-op ─────────────────────────
  setBattleMode(_battle: boolean): void {}

  // ── SFX ───────────────────────────────────────────────────────────────────

  play(group: string): void {
    if (!this.sfxReady || this.destroyed) return;
    const keys = SFX_GROUPS[group];
    if (!keys?.length) return;
    const key = keys[Math.floor(Math.random() * keys.length)];
    try { this.scene.sound.play(key, { volume: SFX_VOL }); } catch {}
  }

  // ── Lifecycle ─────────────────────────────────────────────────────────────

  /** Floor transition — keep music playing, just unsubscribe from the loader. */
  detach(): void {
    this.destroyed = true;
    try { this.scene.load.off('complete', this.onLoadComplete); } catch {}
  }

  /** Game over — stop everything. */
  destroy(): void {
    this.detach();
    this.music?.removeAllListeners('complete');
    this.music?.stop();
    this.music    = null;
    this.currentKey = '';
  }

  // ── Private ───────────────────────────────────────────────────────────────

  private playNext(): void {
    if (this.destroyed) return;
    // Pick a random track different from the current one
    const pool = MUSIC_POOL.length > 1
      ? MUSIC_POOL.filter(k => k !== this.currentKey)
      : MUSIC_POOL;
    const key = pool[Math.floor(Math.random() * pool.length)];
    this.startTrack(key);
  }

  private startTrack(key: string): void {
    this.music?.removeAllListeners('complete');
    this.music?.stop();
    try {
      const s = this.scene.sound.add(key, { loop: false, volume: MUSIC_VOL });
      s.on('complete', this.onMusicEnd);
      s.play();
      this.music     = s;
      this.currentKey = key;
    } catch {}
  }

  private loadAudio(): void {
    const loader = this.scene.load;
    let queued = 0;
    for (const [key, path] of Object.entries(AUDIO_FILES)) {
      if (!this.scene.cache.audio.has(key)) {
        loader.audio(key, path);
        queued++;
      }
    }
    if (queued === 0) { this.onReady(); return; }
    loader.once('complete', this.onLoadComplete);
    loader.start();
  }

  private onReady(): void {
    if (this.destroyed) return;
    this.sfxReady = true;
    // Start music only if nothing is already playing
    if (!this.music || !(this.music as any).isPlaying) {
      this.playNext();
    }
  }
}
