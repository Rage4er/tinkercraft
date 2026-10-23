# 🎨 ARCHITECTURE_RENDER.md — Единый источник данных и отрисовки

**Фаза 8.5 — Унификация отрисовки и данных (v1.2.0)**

Версия: 1.0 · Дата: 2026-10-20 · Статус: утверждено

---

## 1. ПРИНЦИП

**`SceneObject.vertices`** — **всегда в origin** (центр масс).

**`SceneObject.transform`** — **мировой pivot** (spawn + user).

**Отрисовка** = `mesh.position = transform`, `geometry = vertices`.

**`centerGeometry` — НЕТ.**

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
- `isPivotCenteredGeometry` — **удалён**.
- `centerGeometry` — **удалён**.

## 7. ЧЕК-ЛИСТ ЭТАПОВ

| Этап | Что | Статус |
|------|-----|--------|
| 8.5.0 | Подготовка + документация | ✅ 2026-10-21 |
| 8.5.1 | Worker возвращает origin для всех primitive | ✅ 2026-10-21 |
| 8.5.2 | Store применяет spawn к transform, не к vertices | ✅ 2026-10-21 |
| **8.5.2.5** | **`handleRebuildScene` возвращает origin-вершины (undo/redo/load)** | ✅ 2026-10-23 |
| 8.5.3 | Удалить `centerGeometry` из viewport | 🔲 |
| 8.5.4 | Миграция `.doodle` → `.3dtc` | 🔲 |
| 8.5.5 | CI-тест «render = data» для всех объектов | 🔲 |

### ⚠️ Переходное состояние между 8.5.2.5 и 8.5.3

После 8.5.2.5 **данные** (`SceneObject.vertices` + `transform`) во всех путях —
создание, undo/redo, загрузка проекта — едины: вершины в origin (COM), pivot =
мировой COM. Но `centerGeometry` во вьюпорте ещё активен и вычитает **bbox-центр**
из уже чистых вершин. Поэтому асимметричные формы (`cone`, `prism`, `pyramid`),
у которых `COM ≠ bboxCenter`, отрисовываются со сдвигом на `−bboxCenter(origin)`.

Сдвиг **одинаков** в live- и rebuild-путях (то есть данные согласованы — цель
8.5.2.5 достигнута) и полностью исчезает после удаления `centerGeometry` в 8.5.3.
Для `import_mesh` rebuild-путь расходится с live на `COM` исходного меша — по той
же причине; 8.5.3 (центрирование в `importStl`) приводит их к совпадению.

---

## 💎 ИТОГ

**`vertices` — origin · `transform` — pivot · render = data · один источник.**
