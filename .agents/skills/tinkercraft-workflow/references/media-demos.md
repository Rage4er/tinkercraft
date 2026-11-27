# Скриншоты и видео-демо

Демо собираются на dev-сервере Playwright-скриптом. Код приложения не меняется.
Скрипт можно держать во временной папке (`/tmp`), но импорт `playwright` работает только
из `web-app/` — запускай файл из `web-app/e2e/` (или импортируй helpers по относительному пути).

## Dev-сервер

```bash
cd web-app
pnpm dev --host 127.0.0.1 --port 5000    # http://127.0.0.1:5000/tinkercraft/
```

## Сцена через store (детерминированно)

В dev-режиме модули доступны по URL и это те же экземпляры, что у приложения:

```js
const m = await import('/tinkercraft/src/store/document-store.ts')
const st = () => m.useDocumentStore.getState()
const keys = () => Object.keys(st().objects)

const before = new Set(keys())
await st().addShape('cube', { width: 80, height: 60, depth: 50 })
const id = keys().find((k) => !before.has(k))          // addShape не выделяет объект
await st().moveObject(id, { x: 0, y: 0, z: 40, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 })
st().setColor(id, '#5e81ac')                            // строго строка цвета
```

Резьба и CSG:

```js
await st().addThread({ series: 'metric', sizeId: 'M8', length: 22, kind: 'bolt', hand: 'right', starts: 1 })
st().selectObjects([idA, idB], false)
await st().csgBoolean('union')                          // использует selectedIds
```

Темы, язык, режим вида:

```js
const s = await import('/tinkercraft/src/store/settings.ts')
s.useSettingsStore.getState().setTheme('light')          // dark | light | high-contrast
s.setLanguage('en')                                      // ru | en

const ui = await import('/tinkercraft/src/store/ui-store.ts')
ui.useUiStore.getState().setViewMode('wireframe')        // realistic | wireframe | hidden-line
```

## Камера

- Правый drag по `.viewport-canvas` — орбита; 135° ≈ `0.375 × clientHeight` px по горизонтали.
- Средний drag — панорама; колесо — зум. Сила зума зависит от **величины** `deltaY`
  (`pow(0.95, |deltaY·0.01|)`), поэтому один `mouse.wheel(0, -800)` ближе, чем много мелких.
- `F` — вписать сцену. Перед камерой кликни по пустому месту, чтобы снять выделение.

## Скриншоты

- Размер 1600×1000, сохранять в `docs/screenshots/<задача>/`.
- Меняй тему/язык/режим вида между кадрами, камеру — `F` + жесты.
- Контактный лист: `montage *.png -tile 3x2 -geometry 800x500+6+6 -background '#11111b' contact-sheet.jpg`.
- Каталог `docs/screenshots/` не игнорируется; проверить `git status`.

## Видео

```js
const ctx = await browser.newContext({
  viewport: { width: 1280, height: 800 },
  deviceScaleFactor: 1,
  recordVideo: { dir: '/tmp/tc-demo-raw', size: { width: 1280, height: 800 } },
})
```

- Playwright не рисует системный курсор: добавь фейковый div и обновляй его по `mousemove`
  (см. приём в истории задач) — так действия читаются.
- WebGL в headless иногда не поднимается: проверь `.viewport-canvas`, при fallback создай
  **новый контекст** (не reload — иначе автозагрузка восстановит сцену) и повтори.
- Пиши метки `t0` (начало демо) и `tEnd`; настройку сцены (5–10 с) обрежь ffmpeg.
- Склейка/обрезка:

```bash
ffmpeg -y -ss <t0-0.8> -i raw.webm -t <длительность> \
  -vf "fps=30,scale=1280:800:flags=lanczos" \
  -c:v libx264 -preset medium -crf 20 -pix_fmt yuv420p -movflags +faststart -an out.mp4
```

- Цель — 10–15 с. Финальный файл — `docs/demo_<тема>_vX.Y.Z.mp4`; `.mp4` в `.gitignore`,
  поэтому при необходимости коммита — `git add -f`.
- Не редактируй файлы во время записи (HMR), в конце останови dev-сервер.

## Проверка демо

Извлеки 5–8 кадров и посмотри глазами:

```bash
for t in 0.3 2 5 8 11 14; do ffmpeg -ss $t -i out.mp4 -frames:v 1 /tmp/f_$t.png -y; done
```

Убедись, что видны: светлая тема и механизм в начале, переключение темы, поворот,
создание и размещение резьбы, Child-View с вращением, финальный вид 3/4.
