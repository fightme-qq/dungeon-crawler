import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { refreshLang } from './lang';

declare const YaGames: { init(): Promise<any> } | undefined;

// Флаги синхронизации: ready() вызываем только когда оба готовы
(window as any).__sdkDone  = false;
(window as any).__bootDone = false;

function trySignalReady() {
  if ((window as any).__sdkDone && (window as any).__bootDone) {
    (window as any).ysdk?.features?.LoadingAPI?.ready();
  }
}
(window as any).__trySignalReady = trySignalReady;

// Fallback: если через 5 секунд SDK не инициализировался — всё равно сигналим
setTimeout(() => {
  if (!(window as any).__sdkDone) {
    (window as any).__sdkDone = true;
    trySignalReady();
  }
}, 5000);

// Yandex SDK — инициализируем асинхронно, не блокируем запуск игры
(async () => {
  try {
    if (typeof YaGames !== 'undefined') {
      const ysdk = await YaGames.init();
      (window as any).ysdk = ysdk;
      refreshLang(ysdk); // передаём объект напрямую — Яндекс фиксирует чтение i18n.lang

      // Правило 1.3 / 1.19.4: пауза и возобновление по событиям платформы
      ysdk.on('game_api_pause', () => {
        (window as any).__phaserGame?.pause();
        ysdk.features?.GameplayAPI?.stop();
      });
      ysdk.on('game_api_resume', () => {
        (window as any).__phaserGame?.resume();
        ysdk.features?.GameplayAPI?.start();
      });
    }
  } catch {
    // SDK недоступен (локальная разработка) — продолжаем без него
  } finally {
    (window as any).__sdkDone = true;
    trySignalReady();
  }
})();

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  backgroundColor: '#2a2a2a',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: 1280,
    height: 720,
  },
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false
    }
  },
  scene: [BootScene, GameScene, UIScene]
};

(window as any).__phaserGame = new Phaser.Game(config);
