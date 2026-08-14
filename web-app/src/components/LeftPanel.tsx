import { useState } from "react";
import Section from "./Section";
import Timeline from "./Timeline";
import ComponentTree from "./ComponentTree";
import { OP_FILTER_LABELS } from "../constants";
import { ALL_SHAPES } from "../constants.tsx";
import type { ShapeType, TinkerCraftOperation, SceneObject } from "../csg/types";
import { ChevronUpIcon, ChevronDownIcon } from "./icons";

// Отображаемое имя фигуры для списка объектов
function getShapeLabel(obj: SceneObject): string {
  if (obj.name) return obj.name
  if (obj.shapeType === 'csg') return 'CSG результат'
  if (obj.shapeType === 'import_mesh') return 'Импорт'
  return obj.shapeType
}

export default function LeftPanel({
  shapeSearch,
  onShapeSearchChange,
  workerOk,
  busy,
  onAddShape,
  onShowTextModal,
  objectList,
  selSet,
  activeTab,
  onTabChange,
  onSelect,
  onRename,
  onToggleVis,
  onDeleteObject,
  historyIndex,
  operations,
  tlFilters,
  onFilterChange,
  onJumpHistory,
}: {
  shapeSearch: string;
  onShapeSearchChange: (v: string) => void;
  workerOk: boolean;
  busy: boolean;
  onAddShape: (type: ShapeType) => void;
  onShowTextModal: () => void;
  objectList: SceneObject[];
  selSet: Set<string>;
  activeTab: "objects" | "tree";
  onTabChange: (tab: "objects" | "tree") => void;
  onSelect: (id: string | null, add: boolean) => void;
  onRename: (id: string, name: string) => void;
  onToggleVis: (id: string) => void;
  onDeleteObject: (id: string) => void;
  historyIndex: number;
  operations: TinkerCraftOperation[];
  tlFilters: Record<string, boolean>;
  onFilterChange: (key: string, checked: boolean) => void;
  onJumpHistory: (index: number) => void;
}) {
  // FIX (LOW-18-31): Remove useMemo — ALL_SHAPES has only 8 elements, memo overhead > benefit
  const filteredShapes = shapeSearch.trim()
    ? ALL_SHAPES.filter((s) =>
      s.label.toLowerCase().includes(shapeSearch.toLowerCase()),
    )
    : ALL_SHAPES;

  // Filter dropdown state
  const [filtersOpen, setFiltersOpen] = useState(false);

  return (
    <div className="panel-left">
      {/* Фигуры с поиском */}
      <Section title="Фигуры">
        <div className="search-wrap">
          <input
            className="search-input"
            type="text"
            placeholder="🔍 Поиск фигуры…"
            value={shapeSearch}
            onChange={(e) => onShapeSearchChange(e.target.value)}
          />
        </div>
        <div className="shape-grid">
          {filteredShapes.length === 0 && (
            <div className="ct-empty" style={{ gridColumn: "1/-1" }}>
              Не найдено
            </div>
          )}
          {filteredShapes.map((s) => (
            <button
              key={s.type}
              className="shape-btn"
              title={`Добавить ${s.label}`}
              disabled={!workerOk || busy}
              onClick={() =>
                s.type === "text"
                  ? onShowTextModal()
                  : onAddShape(s.type as ShapeType)
              }
            >
              <span className="shape-icon">{s.icon({ size: 32 })}</span>
              <span className="shape-lbl">{s.label}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* Объекты / ComponentTree — переключатель вкладок */}
      <Section title="Объекты" badge={objectList.length}>
        <div className="tab-bar">
          <button
            className={`tab-btn${activeTab === "objects" ? " active" : ""}`}
            onClick={() => onTabChange("objects")}
          >
            Список
          </button>
          <button
            className={`tab-btn${activeTab === "tree" ? " active" : ""}`}
            onClick={() => onTabChange("tree")}
          >
            Дерево
          </button>
        </div>

        {activeTab === "objects" ? (
          <div className="object-list">
            {objectList.length === 0 && (
              <div className="object-list-empty">Сцена пуста</div>
            )}
            {objectList.map((obj) => (
              <div
                key={obj.id}
                className={`object-list-item${selSet.has(obj.id) ? " selected" : ""}`}
                onClick={(e) =>
                  onSelect(obj.id, e.shiftKey || e.ctrlKey || e.metaKey)
                }
                title={`${obj.shapeType} — ${obj.id}`}
              >
                <div
                  className="object-list-swatch"
                  style={{
                    background: obj.color,
                    opacity: obj.visible ? 1 : 0.35,
                  }}
                />
                <span className="object-list-label">
                  {getShapeLabel(obj)}
                </span>
                {!obj.visible && <span className="obj-hidden">скрыт</span>}
              </div>
            ))}
          </div>
        ) : (
          <ComponentTree
            objects={objectList}
            selectedIds={selSet}
            onSelect={onSelect}
            onRename={onRename}
            onToggleVis={onToggleVis}
            onDelete={onDeleteObject}
          />
        )}
      </Section>

      {/* История */}
      <Section
        title={`История ${historyIndex}/${operations.length}`}
        defaultOpen={true}
      >
        {/* Filter dropdown */}
        <div className="tl-filter-dropdown">
          <button
            className="btn btn-compact tl-filter-toggle"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            {filtersOpen ? <ChevronUpIcon size={32} /> : <ChevronDownIcon size={32} />} Фильтр
          </button>
          {filtersOpen && (
            <div className="tl-filter-panel">
              {Object.entries(OP_FILTER_LABELS).map(([key, label]) => (
                <label key={key} className="tl-filter-row">
                  <input
                    type="checkbox"
                    checked={tlFilters[key] !== false}
                    onChange={(e) => onFilterChange(key, e.target.checked)}
                  />
                  {label}
                </label>
              ))}
            </div>
          )}
        </div>
        <Timeline
          operations={operations}
          historyIndex={historyIndex}
          busy={busy}
          onJump={onJumpHistory}
          filters={tlFilters}
        />
      </Section>
    </div>
  );
}
