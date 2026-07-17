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
  return (
    <div 
      className="statusbar"
      role="status"
      aria-live="polite"
    >
      <span className="status-item">
        CSG:&nbsp;
        {workerOk ? (
          <strong className="status-ok">manifold-3d ✓</strong>
        ) : (
          <strong className="status-loading">загрузка…</strong>
        )}
      </span>
      <span className="status-item">
        Объектов: <strong>{objectCount}</strong>
      </span>
      <span className="status-item">
        Треуг.: <strong>{totalTris.toLocaleString()}</strong>
      </span>
      <span className="status-item">
        История:{" "}
        <strong>
          {historyIndex}/{operationsLength}
        </strong>
      </span>
      {modified && (
        <span className="status-item text-yellow">
          ● Не сохранено
        </span>
      )}
      {currentProjectId && (
        <span className="status-item text-green">
          ● Проект сохранён
        </span>
      )}
      {lastCsgMs !== null && (
        <span className="status-item">
          CSG:&nbsp;
          <strong className={lastCsgMs < 100 ? "status-ok" : "status-warn"}>
            {lastCsgMs.toFixed(1)} мс
          </strong>
        </span>
      )}
      {rulerActive && (
        <span className="status-item" style={{ color: "#facc15" }}>
          📏 Режим измерения
        </span>
      )}
      <span className="status-item status-auto">
        FPS: <strong>{fps}</strong>
      </span>
      <span className="status-item text-muted-xs">
        Фазы 0–6 · Resize · Extrude · Ruler · ComponentTree · ProjectManager ·
        ViewCube fix
      </span>
    </div>
  );
}
