import { useState } from "react";
import { useTranslation } from "react-i18next";
import Section from "./Section";
import Timeline from "./Timeline";
import ComponentTree from "./ComponentTree";
import { ALL_SHAPES } from "../constants.tsx";
import { OP_FILTER_LABELS } from "../constants";
import type { ShapeType, TinkerCraftOperation, SceneObject } from "../csg/types";
import { ChevronUpIcon, ChevronDownIcon } from "./icons";

// Отображаемое имя фигуры для списка объектов
function getShapeLabel(obj: SceneObject, t: (key: string) => string): string {
  if (obj.name) return obj.name
  if (obj.shapeType === 'csg') return t('csg.result')
  if (obj.shapeType === 'import_mesh') return t('actions.import')
  if (obj.shapeType === 'text3d') return t('leftPanel.text3d')
  return t(`shapes.${obj.shapeType}`)
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
  const { t } = useTranslation();

  // FIX (LOW-18-31): Remove useMemo — ALL_SHAPES has only 8 elements, memo overhead > benefit
  const filteredShapes = shapeSearch.trim()
    ? ALL_SHAPES.filter((s) =>
      t(s.labelKey).toLowerCase().includes(shapeSearch.toLowerCase()),
    )
    : ALL_SHAPES;

  // Filter dropdown state
  const [filtersOpen, setFiltersOpen] = useState(false);

  const handleShapeClick = (type: ShapeType) => {
    if (type === 'import_mesh') return // handled elsewhere
    onAddShape(type)
  };

  return (
    <div className="panel-left">
      {/* Фигуры с поиском */}
      <Section title={t("leftPanel.shapes")}>
        <div className="search-wrap">
          <input
            className="search-input"
            type="text"
            placeholder={t("leftPanel.searchPlaceholder")}
            value={shapeSearch}
            onChange={(e) => onShapeSearchChange(e.target.value)}
          />
        </div>
        <div className="shape-grid">
          {filteredShapes.length === 0 && (
            <div className="ct-empty" style={{ gridColumn: "1/-1" }}>
              {t("leftPanel.notFound")}
            </div>
          )}
          {filteredShapes.map((s) => (
            <button
              key={s.type}
              className="shape-btn"
              title={t('leftPanel.addShape', { label: t(s.labelKey) })}
              disabled={!workerOk || busy}
              onClick={() => handleShapeClick(s.type as ShapeType)}
            >
              <span className="shape-icon">{s.icon({ size: 32 })}</span>
              <span className="shape-lbl">{t(s.labelKey)}</span>
            </button>
          ))}
        </div>
      </Section>

      {/* Объекты / ComponentTree — переключатель вкладок */}
      <Section title={t("leftPanel.objects")} badge={objectList.length}>
        <div className="tab-bar">
          <button
            className={`tab-btn${activeTab === "objects" ? " active" : ""}`}
            onClick={() => onTabChange("objects")}
          >
            {t("leftPanel.list")}
          </button>
          <button
            className={`tab-btn${activeTab === "tree" ? " active" : ""}`}
            onClick={() => onTabChange("tree")}
          >
            {t("leftPanel.tree")}
          </button>
        </div>

        {activeTab === "objects" ? (
          <div className="object-list">
            {objectList.length === 0 && (
              <div className="object-list-empty">{t("leftPanel.sceneEmpty")}</div>
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
                  {getShapeLabel(obj, t)}
                </span>
                {!obj.visible && <span className="obj-hidden">{t("leftPanel.hidden")}</span>}
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
        title={`${t("leftPanel.history")} ${historyIndex}/${operations.length}`}
        defaultOpen={true}
      >
        {/* Filter dropdown */}
        <div className="tl-filter-dropdown">
          <button
            className="btn btn-compact tl-filter-toggle"
            onClick={() => setFiltersOpen(!filtersOpen)}
          >
            {filtersOpen ? <ChevronUpIcon size={32} /> : <ChevronDownIcon size={32} />} {t("leftPanel.filter")}
          </button>
          {filtersOpen && (
            <div className="tl-filter-panel">
              {Object.entries(OP_FILTER_LABELS).map(([key, labelKey]) => (
                <label key={key} className="tl-filter-row">
                  <input
                    type="checkbox"
                    checked={tlFilters[key] !== false}
                    onChange={(e) => onFilterChange(key, e.target.checked)}
                  />
                  {t(labelKey)}
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
