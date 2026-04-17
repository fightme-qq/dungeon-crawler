import Phaser from 'phaser';
import { BootScene } from './scenes/BootScene';
import { GameScene } from './scenes/GameScene';
import { UIScene } from './scenes/UIScene';
import { refreshLang } from './lang';
import { clearRun } from './systems/RunState';

declare const YaGames: { init(): Promise<any> } | undefined;

function isLocalRuntime() {
  return window.location.hostname === '127.0.0.1' || window.location.hostname === 'localhost';
}

function isPremiumTestModeEnabled() {
  const params = new URLSearchParams(window.location.search);
  const flag = params.get('premiumtest') ?? params.get('premium_test') ?? params.get('testpremium');
  return isLocalRuntime() && flag === '1';
}

function isPremiumResetEnabled() {
  const params = new URLSearchParams(window.location.search);
  const flag = params.get('premiumreset') ?? params.get('premium_reset') ?? params.get('resetpremium');
  return isLocalRuntime() && flag === '1';
}

function getViewportSize() {
  return {
    width: Math.max(320, window.innerWidth || document.documentElement.clientWidth || 1280),
    height: Math.max(320, window.innerHeight || document.documentElement.clientHeight || 720),
  };
}

// Флаги синхронизации: ready() вызываем только когда оба готовы
(window as any).__sdkDone  = false;
(window as any).__bootDone = false;
(window as any).__payments = null;
(window as any).__paymentsAvailable = false;
(window as any).__ownedPurchases = new Set<string>();
(window as any).__premiumTestMode = isPremiumTestModeEnabled();

if (isPremiumResetEnabled()) {
  clearRun();
  (window as any).__ownedPurchases = new Set<string>();
}

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
    (window as any).__onSdkReady?.();
  }
}, 5000);

// Yandex SDK — инициализируем асинхронно, не блокируем запуск игры
(async () => {
  try {
    if (typeof YaGames !== 'undefined') {
      const ysdk = await YaGames.init();
      (window as any).ysdk = ysdk;
      try {
        const payments = await ysdk.getPayments();
        (window as any).__payments = payments;
        (window as any).__paymentsAvailable = true;
        try {
          const purchases = await payments.getPurchases();
          const owned = new Set<string>();
          if (Array.isArray(purchases)) {
            for (const purchase of purchases) {
              if (purchase?.productID) owned.add(purchase.productID);
            }
          }
          (window as any).__ownedPurchases = owned;
        } catch {
          (window as any).__ownedPurchases = new Set<string>();
        }
      } catch {
        (window as any).__payments = null;
        (window as any).__paymentsAvailable = false;
        (window as any).__ownedPurchases = new Set<string>();
      }
      refreshLang(ysdk); // передаём объект напрямую — Яндекс фиксирует чтение i18n.lang

      // Правило 1.3 / 1.19.4: пауза и возобновление по событиям платформы
      ysdk.on('game_api_pause', () => {
        const g = (window as any).__phaserGame;
        g?.pause();
        if (g?.sound) g.sound.mute = true;
        ysdk.features?.GameplayAPI?.stop();
      });
      ysdk.on('game_api_resume', () => {
        const g = (window as any).__phaserGame;
        g?.resume();
        if (g?.sound) g.sound.mute = false;
        ysdk.features?.GameplayAPI?.start();
      });
    }
  } catch {
    // SDK недоступен (локальная разработка) — продолжаем без него
  } finally {
    (window as any).__sdkDone = true;
    trySignalReady();
    (window as any).__onSdkReady?.();
  }
})();

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  backgroundColor: '#2a2a2a',
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.RESIZE,
    ...getViewportSize(),
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

const syncViewport = () => {
  const g = (window as any).__phaserGame as Phaser.Game | undefined;
  if (!g?.scale) return;
  const { width, height } = getViewportSize();
  g.scale.resize(width, height);
};

window.addEventListener('resize', syncViewport, { passive: true });
window.addEventListener('orientationchange', syncViewport, { passive: true });
syncViewport();
