import { useState } from "react";
import { useTranslation } from "react-i18next";
import Section from "./Section";
import Timeline from "./Timeline";
import ComponentTree, { displayName } from "./ComponentTree";
import Badge from "./Badge";
import { useEconomyStore } from "../store/economy-store";
import DimensionList from "./DimensionList";
import { useDimensionsStore } from "../store/dimensions-store";
import { useDocumentStore } from "../store/document-store";
import { isDimensionAlive } from "../store/dimensions";
import { OP_FILTER_LABELS } from "../constants";
import { ALL_SHAPES } from "../constants.tsx";
import type { TinkerCraftOperation, SceneObject } from "../csg/types";
import { usePlacementModeStore, type PlaceableShape } from "../store/placement-mode";
import { ChevronUpIcon, ChevronDownIcon } from "./icons";

export default function LeftPanel({
  shapeSearch,
  onShapeSearchChange,
  workerOk,
  busy,
  onAddShape,
  onShowTextModal,
  openEconomy,
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
  onTimelineEdit,
}: {
  shapeSearch: string;
  onShapeSearchChange: (v: string) => void;
  workerOk: boolean;
  busy: boolean;
  /** PLUG-AND-PLAY: клик по фигуре — режим размещения (фигура — после клика по грани / сетке) */
  onAddShape: (type: PlaceableShape) => void;
  onShowTextModal: () => void;
  /** yandex-games: клик по 3D-тексту без доступа — модалка аренды text3d
   *  (не передан — гейтинг у родителя в onShowTextModal) */
  openEconomy?: () => void;
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
  onTimelineEdit?: (op: import("../csg/types").TinkerCraftOperation, index: number) => void;
}) {
  const { t } = useTranslation();
  const placing = usePlacementModeStore((st) => st.placementMode?.shapeType ?? null);
  // DIMENSIONS: в счётчике — видимые размеры (объекты на месте), как в списке
  const dimensions = useDimensionsStore((st) => st.dimensions);
  const docObjects = useDocumentStore((st) => st.objects);
  const dimensionCount = dimensions.filter((d) => isDimensionAlive(d, docObjects)).length;
  // P1-4: RO-селектор вместо мутирующего hasActiveSubscription() в render-фазе.
  // P1-5: единый хелпер доступа к 3D-тексту (подписка ИЛИ аренда text3d по серверному времени).
  const textActive = useEconomyStore(s => s.canUseText3dRO());

  // FIX (LOW-18-31): Remove useMemo — ALL_SHAPES has only 8 elements, memo overhead > benefit
  const filteredShapes = shapeSearch.trim()
    ? ALL_SHAPES.filter((s) =>
      t(s.labelKey).toLowerCase().includes(shapeSearch.toLowerCase()),
    )
    : ALL_SHAPES;

  // Filter dropdown state
  const [filtersOpen, setFiltersOpen] = useState(false);

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
              className={s.type === placing ? "shape-btn active" : "shape-btn"}
              title={t(s.type === "text" ? "leftPanel.addShape" : "leftPanel.placeShape", { label: t(`shapesAcc.${s.type}`) })}
              aria-pressed={s.type === "text" ? undefined : s.type === placing}
              // UX-AUDIT-9: не блокируется на время busy — поставленная фигура ждёт очереди (add-shape-queue);
              // PLUG-AND-PLAY: клик — режим размещения, фигура — после клика по грани / сетке или Enter
              disabled={!workerOk}
              onClick={() => {
                if (s.type !== "text") { onAddShape(s.type as PlaceableShape); return }
                // B2 / UB-1 (yandex-games): без доступа к 3D-тексту — НЕ disabled,
                // клик ведёт к аренде text3d (75 токенов)
                if (!textActive) { (openEconomy ?? onShowTextModal)(); return }
                onShowTextModal()
              }}
            >
              <span className="shape-icon">{s.icon({ size: 32 })}</span>
              <span className="shape-lbl">{t(s.labelKey)}</span>
              {s.type === "text" && <Badge type="tokens" value="75" isActive={textActive} />}
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
                {/* UX-AUDIT-28: имя — как в «Дереве» («Куб 1», «CSG результат 3»), а не «Куб», «Куб» */}
                <span className="object-list-label">
                  {displayName(obj, t)}
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
          onEdit={onTimelineEdit}
        />
      </Section>

      {/* DIMENSIONS: размеры — список, выделение, корзина */}
      <Section title={t("dimensions.section")} badge={dimensionCount}>
        <DimensionList />
      </Section>
    </div>
  );
}
