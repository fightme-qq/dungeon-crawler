# Dungeon Crawler — Phaser 3

## Стек и структура
- Phaser 3 + TypeScript + Vite
- Тайл: 16×16px, масштаб ×3 = 48px на экране
- Деплой: `git push` → Netlify автодеплой → github.com/fightme-qq/dungeon-crawler

```
src/
  scenes/    — BootScene, GameScene, UIScene
  entities/  — Player, BaseEnemy, Skeleton, Vampire, Orc, Chest
  systems/   — DungeonGenerator, ArrowSystem, FloatTextSystem
  utils/     — constants.ts, combat.ts
  data/      — balance.json  ← ВСЕ числа только здесь
public/assets/
  tiles/     — тайлсеты
  enemies/   — спрайты врагов (+ slime.png)
  props/     — сундуки, факелы, лестницы, dust_particles
  characters/— спрайты игрока
  ui/        — CrimsonFantasyGUI, potions.png, images.png
```

## Балансировка
**ВСЕ числа только в `data/balance.json`.** Никогда не хардкодить в коде.
Структура: `player`, `enemies.{skeleton|orc|vampire}`, `chest`, `trap`, `dungeon`, `coins`, `potions`.
- `dungeon.enemyCountWeights` — вероятности [0,1,2,3,4] врагов на комнату (индекс = кол-во)
- `dungeon.enemyTypeWeights.{floor1|floor2|floor3plus}` — веса типов врагов по этажу

## Depth Sorting
Все движущиеся объекты (игрок, враги, сундуки) используют **`body.bottom`** как depth:
```typescript
this.setDepth((this.body as Phaser.Physics.Arcade.Body).bottom);
```
- Пол: depth = -1, стены: depth = 0
- Пропсы (сундуки): static body только на нижнюю часть спрайта
- **НИКОГДА** не используй `y + displayHeight` — у 100×100 спрайта при scale 2.5 это 250px, неверно

## Коллизии
- Стены: body на весь тайл
- Пропсы/сундуки: body только на нижнюю половину — игрок визуально заходит за объект сверху
- Игрок и враги: body меньше спрайта, смещён к ногам

## Хит-детекция
**Всегда используй `body.center` и `body.halfWidth/halfHeight`**, не `sprite.x/y` и не `displayWidth`.
- `displayWidth` у 100×100 спрайта при scale 2.5 = 250px — это не коллайдер
- Единственный источник истины — физическое тело (`body.width`, `body.height`)

## Боёвка
Три атаки игрока:
- **LMB / Space** — базовый удар (attack1), хитбокс перед игроком
- **Q** — рывок с ударом (attack2), dash + удлинённый хитбокс
- **E** — стрела (attack3), летит к курсору, clamp к facing-половине, дуга

Формула урона: `DamageTaken = BaseDamage / (1 + Armor / 100)` — только через `calcDamage()` в `utils/combat.ts`.
Крит: шанс и множитель из `balance.json`.

## Архитектура

### GameScene — оркестратор
Создаёт и соединяет системы. Бизнес-логика — в отдельных классах.
> Сейчас: спавн врагов, ловушек и лута живёт inline в GameScene — это технический долг.

### Спавн врагов
- **Количество на комнату** — вероятностный выбор по `dungeon.enemyCountWeights`:
  индекс массива = кол-во врагов, значение = вес (не обязаны суммироваться в 100)
- **Тип врага** — зависит от этажа (`dungeon.enemyTypeWeights`):
  - floor 1: только скелеты
  - floor 2: скелеты + вампиры
  - floor 3+: скелеты + вампиры + орки
- Веса — в `balance.json`, логика выбора — только в `EnemySpawner`

### Добавление нового врага
1. `src/entities/NewEnemy.ts` — extends BaseEnemy
2. В конструкторе: `this.setupAnimations('prefix')`
3. Секция в `balance.json` с числами (hp, armor, speed, knockbackResist и т.д.)
4. Загрузка спрайтов и анимаций в `BootScene.ts`
5. Добавить в `dungeon.enemyTypeWeights` нужных этажей в balance.json
6. Добавить в `EnemySpawner.pickType()` новый `[NewEnemy, w.newEnemy]` entry
7. Уникальная механика — только внутри класса, override `preUpdate`

### Масштабирование по этажам (запланировано)
Враги должны становиться сильнее с каждым этажом. Планируемая архитектура:
- Формула: `hp * (1 + scalingHpPerFloor * (floor-1))`, аналогично для `attack`
- Коэффициенты `scalingHpPerFloor`, `scalingAtkPerFloor` — в `balance.json`
- Реализация через `EnemyFactory.create(type, x, y, floor)` — враг получает уже посчитанные stats
- `BaseEnemy` принимает `statOverrides` объект, не знает про этажи

### Прокачка игрока (запланировано, числовая)
После каждого этажа игрок выбирает улучшения. Планируемая архитектура:
- `RunState` — singleton-модуль `src/systems/RunState.ts`, хранит состояние всего забега:
  `{ floor, coins, playerStats, upgrades[] }`
- `playerStats` — копия base stats из balance.json, мутируется апгрейдами
- `Player` читает stats из `RunState`, не из balance.json напрямую
- `UpgradeScene` — новая сцена между этажами, предлагает 2–3 апгрейда на выбор
- Апгрейды описаны в `balance.json` как список `{ stat, flat?, percent? }`

### BaseEnemy — FSM
Состояния: `PATROL → CHASE → ATTACK → HIT → RETURN`
- Переходы **только** через `enterState()`
- `HIT` state = окно неуязвимости (таймер = `invincibilityDuration`)
- `knockbackResist` множитель в `takeDamage` — орк 0.7, остальные 1.0
- Не используй boolean-флаги для состояний

### UIScene
- Запускается через `this.scene.launch('UIScene')`, данные только через `game.events.emit()`
- HP бар: пустой спрайт (frame 19) + заполненный (frame 0) с `setCrop(0, 0, cropW, 16)`
  - `cropW = FILL_SRC_START + FILL_SRC_W * pct` — в координатах источника до scale
  - Overlay-анимации (damage/heal) требуют `setCrop` каждый кадр через `animationupdate` + blend mode ADD
- Кулдауны Q/E: pie-sweep по часовой, `game.events.emit('abilityState', {qPct, ePct})`

### Ассеты
- WebGL лимит: текстуры шире 4096px не грузить как spritesheet (images.png = 4384px)
- Нужна часть большого файла → извлекай через Node.js в отдельный PNG (пример: potions.png)
- CrimsonFantasyGUI: 64×16px за кадр, `AnimationSheets/`
- Перед работой с ассетами — читай `public/assets/` и разбирайся в именовании

### Graphics
Рисуй локально от (0,0), позиционируй через `add.graphics({x, y})`:
```typescript
// Правильно:
const g = this.add.graphics({ x: worldX, y: worldY });
g.fillCircle(0, 0, radius);
// Неверно — при scale сместится:
const g = this.add.graphics();
g.fillCircle(worldX, worldY, radius);
```

## Антипаттерны
- Не хардкодить числа — только `balance.json`
- Не использовать `displayWidth` как hitbox
- Не использовать `y + displayHeight` для depth — только `body.bottom`
- Не переписывать файлы целиком при точечных изменениях
- Не добавлять npm-зависимости без спроса
- Не менять структуру папок без спроса
- Не писать логику врага в GameScene — только в классе врага
- Не давать overlay-анимациям HP бара жить без `setCrop`
