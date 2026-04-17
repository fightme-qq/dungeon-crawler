// Определяем язык один раз при старте (до SDK — только браузерный фолбэк)
function detectLangFallback(): 'ru' | 'en' {
  // URL-параметр ?lang=ru для локального тестирования
  const urlLang = new URLSearchParams(window.location.search).get('lang');
  if (urlLang === 'ru') return 'ru';
  if (urlLang === 'en') return 'en';
  return navigator.language.startsWith('ru') ? 'ru' : 'en';
}

export let LANG: 'ru' | 'en' = detectLangFallback();

// Перезагрузить язык из объекта SDK (ysdk передаётся напрямую — Яндекс фиксирует доступ к i18n.lang)
export function refreshLang(ysdk?: any): void {
  try {
    // Читаем i18n.lang напрямую из объекта ysdk — это обязательно для зелёного индикатора п. 2.14
    const sdkLang: string | undefined = ysdk?.environment?.i18n?.lang;
    if (sdkLang) {
      LANG = ['ru', 'be', 'kk', 'uk', 'uz'].includes(sdkLang) ? 'ru' : 'en';
      return;
    }
  } catch {}
  LANG = detectLangFallback();
}

// ── Строки ────────────────────────────────────────────────────────────────────

const STRINGS = {
  en: {
    gameOver:       'GAME OVER',
    clickRestart:   'Click to restart',
    floor:          (n: number) => `Floor ${n}`,
    pressEBuy:      'Press E to buy',
    pressEBuyPremium: (n: number) => `Press E to buy for ${n} YAN`,
    needSilver:     (n: number) => `Need ${n} silver`,
    paymentsUnavailable: 'Payments unavailable',
    portalPrice:    (n: number) => `${n} YAN`,
    permanentPurchase: 'FOREVER',
    premiumTestMode: 'PREMIUM TEST MODE',
    premiumTestPrice: 'FREE TEST',
    pressEBuyPremiumTest: 'Press E to claim for free',

    rarities: ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Divine'],

    healItemName:   'Healing Meal',
    healItemEffect: 'Restores full HP',
    healItemRarity: 'Special',
    divineArrowItemName: 'Heavenstring Relic',
    divineBloodOathItemName: 'Blood Oath Sigil',

    statBonus: {
      attack:         (v: number) => `+${v} sword damage`,
      arrowDamage:    (v: number) => `+${v} arrow damage`,
      armor:          (v: number) => `+${v} armor`,
      critMultiplier: (v: number) => `+${v}% crit damage`,
      critChance:     (v: number) => `+${v}% crit chance`,
      maxHp:          (v: number) => `+${v} max hp`,
    },

    specialEffects: {
      divineVolley: (extraArrows: number, pct: number) => `+${extraArrows} side arrows for ${pct}% damage`,
      divineBloodOath: (pct: number) => `Sword hits restore ${pct}% of dealt damage`,
    },

    itemNames: {
      attack:         ['Iron Blade','War Edge','Whetstone','Razorstone','Jagged Fang','Steel Grit','Crimson Edge','Battleclaw','Warbound','Tempered Shard'],
      arrowDamage:    ['Flint Tip','Barbed Shaft','Hawk Feather','Piercing Point','Iron Nock','Wind Splitter','Quiver Shard','Eagle Eye','Notched Arrow','Bolt Head'],
      armor:          ['Iron Scale','Stone Hide','Plate Rivet','Battle Coat','Bulwark','Tempered Shell','Ironclad','Shield Shard','Forged Guard','Warplate'],
      critMultiplier: ['Death Mark','Razor Will','Killing Edge','Battle Fury','Bloodlust','Slaughter Rune','Frenzy Stone','Vein Cutter','War Scar','Warlust'],
      critChance:     ['Lucky Charm','Fortune Dice','Gambler\'s Eye','Risk Token','Fate Shard','Cursed Coin','Omen Stone','Wild Card','Chaos Mark','Trickster Eye'],
      maxHp:          ['Roast Leg','Bread Loaf','Healing Herb','Dragon Egg','Life Mushroom','Berry Tart','Sacred Fruit','War Ration','Vital Stew','Blood Apple'],
    },
  },

  ru: {
    gameOver:       'ИГРА ОКОНЧЕНА',
    clickRestart:   'Нажмите для перезапуска',
    floor:          (n: number) => `Этаж ${n}`,
    pressEBuy:      'E — купить',
    pressEBuyPremium: (n: number) => `E — купить за ${n} ян`,
    needSilver:     (n: number) => `Нужно ${n} серебра`,
    paymentsUnavailable: 'Покупки недоступны',
    portalPrice:    (n: number) => `${n} ян`,
    permanentPurchase: 'НАВСЕГДА',
    premiumTestMode: 'ТЕСТ ПРЕМИУМ-ПОКУПКИ',
    premiumTestPrice: 'БЕСПЛАТНО ТЕСТ',
    pressEBuyPremiumTest: 'E — получить бесплатно',

    rarities: ['Обычный', 'Необычный', 'Редкий', 'Эпический', 'Легендарный', 'Божественный'],

    healItemName:   'Целебная еда',
    healItemEffect: 'Восстанавливает все HP',
    healItemRarity: 'Особый',
    divineArrowItemName: 'Реликвия небострела',
    divineBloodOathItemName: 'Печать кровавой клятвы',

    statBonus: {
      attack:         (v: number) => `+${v} урон мечом`,
      arrowDamage:    (v: number) => `+${v} урон стрелой`,
      armor:          (v: number) => `+${v} броня`,
      critMultiplier: (v: number) => `+${v}% крит урон`,
      critChance:     (v: number) => `+${v}% шанс крита`,
      maxHp:          (v: number) => `+${v} макс HP`,
    },

    specialEffects: {
      divineVolley: (extraArrows: number, pct: number) => `+${extraArrows} боковые стрелы по ${pct}% урона`,
      divineBloodOath: (pct: number) => `Удары мечом восстанавливают ${pct}% от нанесённого урона`,
    },

    itemNames: {
      attack:         ['Железный клинок','Боевое лезвие','Точильный камень','Бритвенный камень','Зубчатый клык','Стальная крошка','Алый клинок','Боевой коготь','Военный нож','Калёный осколок'],
      arrowDamage:    ['Кремнёвый наконечник','Зазубренное древко','Перо ястреба','Пробивной наконечник','Железное ушко','Рассекатель ветра','Осколок колчана','Орлиный глаз','Надрезанная стрела','Наконечник болта'],
      armor:          ['Железная чешуя','Каменная шкура','Заклёпка брони','Боевой плащ','Оплот','Калёная скорлупа','Железный доспех','Осколок щита','Кованая стража','Военный доспех'],
      critMultiplier: ['Знак смерти','Воля клинка','Режущий край','Боевое неистовство','Кровожадность','Руна бойни','Камень ярости','Вскрыватель вен','Боевой шрам','Жажда войны'],
      critChance:     ['Счастливый амулет','Кости удачи','Глаз игрока','Жетон риска','Осколок судьбы','Проклятая монета','Камень предзнаменования','Дикая карта','Знак хаоса','Глаз трикстера'],
      maxHp:          ['Жареная ножка','Буханка хлеба','Целебная трава','Яйцо дракона','Жизненный гриб','Ягодный пирог','Священный плод','Военный паёк','Жизненное рагу','Кровяное яблоко'],
    },
  },
} as const;

type Lang = typeof STRINGS['en'];

function t(): Lang {
  return STRINGS[LANG] as unknown as Lang;
}

export { t };
