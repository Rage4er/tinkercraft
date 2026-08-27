import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  return (
    <div
      className="statusbar"
      role="status"
      aria-live="polite"
    >
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
        <span className="status-item">
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
      <span className="status-item status-auto">
        {t("statusbar.fps")} <strong>{fps}</strong>
      </span>
      <span className="status-item text-muted-xs">
        {/* FIX (LOW-18-42): Remove debug phase info from production status bar */}
        {t("app.webLabel")}
      </span>
    </div>
  );
}
