import { useTranslation } from "react-i18next";
import { APP_VERSION } from "../constants";
import { useAlignModeStore, alignHintKey } from "../store/align-mode";
import { useCsgGroupModeStore, groupBOf } from "../store/csg-group-mode";
import { useDocumentStore } from "../store/document-store";

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
