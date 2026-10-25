# 🎨 ARCHITECTURE_RENDER.md — Единый источник данных и отрисовки

**Фаза 8.5 — Унификация отрисовки и данных (v1.2.0)**

Версия: 1.0 · Дата: 2026-10-20 · Статус: утверждено

---

## 1. ПРИНЦИП

**`SceneObject.vertices`** — **всегда в origin** (центр масс).

**`SceneObject.transform`** — **мировой pivot** (spawn + user).

**Отрисовка** = `mesh.position = transform`, `geometry = vertices`.

`centerGeometry` — удалён (8.5.3).

## 2. ИНВАРИАНТ

```
render_world_vertex = mesh.matrixWorld @ geometry.vertex
data_world_vertex = applyTRS(obj.transform, obj.vertices)
render_world_vertex === data_world_vertex (diff < 1e-6)
```

## 3. ВСЕ СЛОИ (единый источник)

| Слой | `vertices` | `transform` | Отрисовка |
|------|-----------|-------------|-----------|
| **Worker** (`buildShape`) | origin (COM) | — | — |
| **Store** (`addShape`) | origin (COM) | spawn + user | — |
| **Viewport** (`useMeshSync`) | origin (COM) | spawn + user | `mesh.position = transform` |
| **STL-export** | origin (COM) | spawn + user | `applyTRS(transform, vertex)` |
| **Ruler** | origin (COM) | spawn + user | из mesh (render = data) |
| **Снап** | origin (COM) | spawn + user | из mesh (render = data) |

## 4. ПОЧЕМУ

- **Один источник** — нет «трёх моделей» (primitive / CSG / import).
- **Ruler корректен** — привязка к данным, не к сдвинутому мешу.
- **Нет багов** `RENDER-PRISM-BBOX-OFFSET`, `VIEWPORT-DOUBLE-CENTERING`, `PIVOT-CSG`.

## 5. РЕШАЕМЫЕ ПРОБЛЕМЫ

| Проблема | Корень | Решение |
|----------|--------|---------|
| **RENDER-PRISM-BBOX-OFFSET** | `centerGeometry` вычитал bboxCenter (28,0,0) вместо spawn (25,0,0) → сдвиг 3 мм | Удалить `centerGeometry` — vertices уже в origin |
| **VIEWPORT-DOUBLE-CENTERING** | `centerGeometry` применялся к CSG (уже COM-центрирован) | Удалить `centerGeometry` |
| **PIVOT-CSG** | pivot = COM ≠ transformA | pivot = transformA, vertices = world − transformA |

## 6. МИГРАЦИЯ

- **Формат `.doodle` → `.3dtc`** (новый формат, старые игнорируем).
- ✅ `isPivotCenteredGeometry` — **удалён** (8.5.3).
- ✅ `centerGeometry` — **удалён** (8.5.3).

## 7. ЧЕК-ЛИСТ ЭТАПОВ

| Этап | Что | Статус |
|------|-----|--------|
| **8.5.0** | **Подготовка + документация** | ✅ 2026-10-21 |
| **8.5.1** | **Worker возвращает origin для всех primitive** | ✅ 2026-10-21 |
| **8.5.2** | **Store применяет spawn к transform, не к vertices** | ✅ 2026-10-21 |
| **8.5.2.5** | **`handleRebuildScene` возвращает origin-вершины (undo/redo/load)** | ✅ 2026-10-23 |
| **8.5.3** | **Удалить `centerGeometry`/`isPivotCenteredGeometry`; `importStl` → COM-центрирование** | ✅ 2026-10-24 |
| **8.5.4** | **Миграция `.doodle` → `.3dtc`** | ✅ 2026-10-24 |
| **8.5.5** | **CI-тест «render = data» для всех объектов (import_mesh, CSG, mirror, fillet, resize)** | ✅ 2026-10-24 |
| **8.5.6** | **Релиз v1.2.0 (CSG-инварианты, версия, CHANGELOG)** | ✅ 2026-10-25 |

---

## 💎 ИТОГ

**`vertices` — origin · `transform` — pivot · render = data · один источник.**
