import { useTranslation } from "react-i18next";
import { APP_VERSION } from "../constants";
import { useAlignModeStore, alignHintKey } from "../store/align-mode";
import { useCsgGroupModeStore, groupBOf } from "../store/csg-group-mode";
import { useDocumentStore } from "../store/document-store";
import { usePlacementModeStore, type PlacementModeState } from "../store/placement-mode";
import { AXIS_PLANE_NAME } from "../store/placement";
import { useDimensionModeStore } from "../store/dimension-mode";
import { displayName } from "./ComponentTree";
import { GearIcon } from "./icons";
import { useUiStore } from "../store/ui-store";
import type { SceneObject } from "../csg/types";

type TFn = (key: string, opts?: Record<string, unknown>) => string;

/** Число для подсказки: без лишних нулей и «−0». */
const fmt = (v: number) => String(Math.round(v * 100) / 100 + 0);

/** PLUG-AND-PLAY: где встанет фигура — плоскость и место (или «рядом с прошлыми» без превью). */
function placementWhere(m: PlacementModeState, objects: Record<string, SceneObject>, t: TFn): string {
  const p = m.preview;
  if (!p) return t(m.lock ? "placement.whereAxisOnly" : "placement.whereDefault", { plane: m.lock ? AXIS_PLANE_NAME[m.lock] : "" });
  const plane = p.plane.kind === "face"
    ? t("placement.planeFace", { name: objects[p.plane.objectId] ? displayName(objects[p.plane.objectId], t) : p.plane.objectId })
    : p.plane.kind === "axis"
      ? t("placement.planeAxis", { plane: AXIS_PLANE_NAME[p.plane.axis], axis: p.plane.axis })
      : t("placement.planeGrid");
  return t("placement.where", { plane, x: fmt(p.transform.x), y: fmt(p.transform.y), z: fmt(p.transform.z) });
}

export default function StatusBar({
  workerOk,
  objectCount,
  totalTris,
  historyIndex,
  operationsLength,
  modified,
  currentProjectId,
  lastCsgMs,
  rulerActive,
  fps,
}: {
  workerOk: boolean;
  objectCount: number;
  totalTris: number;
  historyIndex: number;
  operationsLength: number;
  modified: boolean;
  currentProjectId: string | null;
  lastCsgMs: number | null;
  rulerActive: boolean;
  fps: number;
}) {
  const { t, i18n } = useTranslation();
  const alignMode = useAlignModeStore((s) => s.alignMode);
  // CSG-GROUP-FIX: режим вычитания / пересечения — подсказка, «ОК» (= Enter), «Отмена» (= Esc)
  const csgMode = useCsgGroupModeStore((s) => s.csgGroupMode);
  const confirmCsgGroup = useCsgGroupModeStore((s) => s.confirmCsgGroup);
  const cancelCsgGroup = useCsgGroupModeStore((s) => s.cancelCsgGroup);
  const selectedIds = useDocumentStore((s) => s.selectedIds);
  const objects = useDocumentStore((s) => s.objects);
  const busy = useDocumentStore((s) => s.busy);
  const csgB = csgMode ? groupBOf(csgMode, selectedIds, objects).length : 0;
  // PLUG-AND-PLAY: режим размещения — подсказка, плоскость и место, «Поставить» (= Enter), «Отмена» (= Esc)
  const placement = usePlacementModeStore((s) => s.placementMode);
  const confirmPlacement = usePlacementModeStore((s) => s.confirmPlacement);
  const cancelPlacement = usePlacementModeStore((s) => s.cancelPlacement);
  // DIMENSIONS: режим «Размер» — подсказка (A / B), сколько создано, «Готово» (= Esc)
  const dimMode = useDimensionModeStore((s) => s.dimensionMode);
  const exitDimensionMode = useDimensionModeStore((s) => s.exitDimensionMode);
  const currentLang = i18n.language?.startsWith("ru") ? "ru" : "en";
  const toggleLanguage = () => {
    const next = currentLang === "en" ? "ru" : "en";
    i18n.changeLanguage(next);
    localStorage.setItem("i18nextLng", next);
  };
  return (
    <div
      className="statusbar"
      role="status"
      aria-live="polite"
    >
      {dimMode && (
        <span className="status-item status-csg-mode status-placement" data-testid="dimension-mode" data-step={dimMode.first ? "b" : "a"}>
          <span className="status-csg-hint" data-testid="dimension-hint">
            {t(dimMode.first ? "dimensions.hintB" : "dimensions.hintA")}
          </span>
          {dimMode.created > 0 && (
            <span className="status-placement-where" data-testid="dimension-created">{t("dimensions.created", { count: dimMode.created })}</span>
          )}
          <button
            type="button"
            className="btn btn-compact status-btn"
            data-testid="dimension-done"
            title={t("dimensions.doneTip")}
            onClick={() => exitDimensionMode()}
          >
            {t("dimensions.done")}
          </button>
        </span>
      )}
      {placement && (
        <span
          className="status-item status-csg-mode status-placement"
          data-testid="placement-mode"
          data-shape={placement.shapeType}
          data-plane={placement.preview ? (placement.preview.plane.kind === "axis" ? placement.preview.plane.axis : placement.preview.plane.kind) : ""}
          data-lock={placement.lock ?? ""}
        >
          <span className="status-csg-hint" data-testid="placement-hint">
            {t("placement.hint", { shape: t(`shapesAcc.${placement.shapeType}`) })}
          </span>
          <span className="status-placement-where" data-testid="placement-where">
            {placementWhere(placement, objects, t)}
          </span>
          <button
            type="button"
            className="btn btn-compact status-btn primary"
            data-testid="placement-ok"
            title={t("placement.okTip")}
            onClick={() => void confirmPlacement()}
          >
            {t("placement.ok")}
          </button>
          <button
            type="button"
            className="btn btn-compact status-btn"
            data-testid="placement-cancel"
            title={t("placement.cancelTip")}
            onClick={() => cancelPlacement()}
          >
            {t("actions.cancel")}
          </button>
        </span>
      )}
      {csgMode && (
        <span className="status-item status-csg-mode" data-testid="csg-mode" data-operation={csgMode.operation}>
          <span className="status-csg-hint" data-testid="csg-mode-hint">
            {t("csgMode.hint", {
              op: t(csgMode.operation === "subtract" ? "csg.subtract" : "csg.intersect"),
              a: csgMode.groupA.length,
              b: csgB,
            })}
          </span>
          <button
            type="button"
            className="btn btn-compact status-btn primary"
            data-testid="csg-mode-ok"
            disabled={csgB === 0 || busy}
            title={t("csgMode.okTip")}
            onClick={() => void confirmCsgGroup()}
          >
            {t("csgMode.ok")}
          </button>
          <button
            type="button"
            className="btn btn-compact status-btn"
            data-testid="csg-mode-cancel"
            title={t("csgMode.cancelTip")}
            onClick={() => cancelCsgGroup()}
          >
            {t("actions.cancel")}
          </button>
        </span>
      )}
      <span className="status-item">
        {t("statusbar.csgEngine")}&nbsp;
        {workerOk ? (
          <strong className="status-ok">{t("statusbar.workerOk")}</strong>
        ) : (
          <strong className="status-loading">{t("statusbar.workerLoading")}</strong>
        )}
      </span>
      <span className="status-item">
        {t("statusbar.objects")} <strong>{objectCount}</strong>
      </span>
      <span className="status-item">
        {t("statusbar.triangles")} <strong>{totalTris.toLocaleString()}</strong>
      </span>
      <span className="status-item">
        {t("statusbar.history")}{" "}
        <strong>
          {historyIndex}/{operationsLength}
        </strong>
      </span>
      {modified && (
        <span className="status-item text-yellow">
          {t("statusbar.unsaved")}
        </span>
      )}
      {currentProjectId && (
        <span className="status-item text-green">
          {t("statusbar.projectSaved")}
        </span>
      )}
      {lastCsgMs !== null && (
        <span className="status-item status-optional">
          {t("statusbar.csgTime")}&nbsp;
          <strong className={lastCsgMs < 100 ? "status-ok" : "status-warn"}>
            {lastCsgMs.toFixed(1)} {t("statusbar.ms")}
          </strong>
        </span>
      )}
      {rulerActive && (
        <span className="status-item" style={{ color: "#facc15" }}>
          {t("statusbar.rulerMode")}
        </span>
      )}
      {alignMode && (
        <span className="status-item status-shrink" style={{ color: "#89b4fa" }} data-testid="align-hint">
          {t(alignHintKey(alignMode))}
        </span>
      )}
      <span className="status-item status-auto">
        {t("statusbar.fps")} <strong>{fps}</strong>
      </span>
      {/* APP-SETTINGS: окно «Настройки» — язык, тема, звуки, единицы */}
      <button
        className="settings-btn"
        data-testid="settings-button"
        aria-label={t("settings.title")}
        title={t("settings.title")}
        onClick={() => useUiStore.getState().setShowSettings(true)}
      >
        <GearIcon size={14} />
      </button>
      <button
        className="lang-switcher"
        onClick={toggleLanguage}
        title={t("language.switch", { lang: currentLang.toUpperCase() })}
      >
        {currentLang === "en" ? "🇬🇧 EN" : "🇷🇺 RU"}
      </button>
      <span className="status-item status-optional text-muted-xs">
        {t("app.name")} v{APP_VERSION}
      </span>
    </div>
  );
}
