import NumInput from "./NumInput";
import type { ShapeParams, SceneObject } from "../csg/types";

export default function PropertiesPanel({
  firstSelected,
  busy,
  selectedIds,
  canResize,
  canFillet,
  canExtrude,
  canMirror,
  canAlign,
  canCsg,
  filletRadius,
  extrudeAxis,
  extrudeDepth,
  objectList,
  operationsLength,
  onSetFilletRadius,
  onSetExtrudeAxis,
  onSetExtrudeDepth,
  onMoveAxis,
  onRotAxis,
  onScaleAxis,
  onResizeDim,
  onResizeObject,
  onApplyFillet,
  onExtrude,
  onMirror,
  onCsg,
  onAlign,
  onSetColor,
  onToggleVisible,
  onShowProjects,
  onSaveToProject,
}: {
  firstSelected: SceneObject | null;
  busy: boolean;
  selectedIds: string[];
  canResize: boolean;
  canFillet: boolean;
  canExtrude: boolean;
  canMirror: boolean;
  canAlign: boolean;
  canCsg: boolean;
  filletRadius: number;
  extrudeAxis: "X" | "Y" | "Z";
  extrudeDepth: number;
  objectList: SceneObject[];
  operationsLength: number;
  onSetFilletRadius: (v: number) => void;
  onSetExtrudeAxis: (a: "X" | "Y" | "Z") => void;
  onSetExtrudeDepth: (v: number) => void;
  onMoveAxis: (axis: "x" | "y" | "z", val: number) => void;
  onRotAxis: (axis: "rotX" | "rotY" | "rotZ", val: number) => void;
  onScaleAxis: (axis: "scaleX" | "scaleY" | "scaleZ", val: number) => void;
  onResizeDim: (dim: "width" | "height" | "depth", val: number) => void;
  onResizeObject: (id: string, params: ShapeParams) => void;
  onApplyFillet: (id: string, radius: number) => void;
  onExtrude: (axis: "X" | "Y" | "Z", depth: number) => void;
  onMirror: (plane: "XY" | "XZ" | "YZ") => void;
  onCsg: (op: "union" | "subtract" | "intersect") => void;
  onAlign: (axis: "X" | "Y" | "Z", anchor: "min" | "center" | "max") => void;
  onSetColor: (id: string, color: string) => void;
  onToggleVisible: (id: string) => void;
  onShowProjects: () => void;
  onSaveToProject: (name: string) => void;
}) {
  if (!firstSelected) {
    return (
      <>
        <div className="props-empty">
          Выберите объект
          <br />
          для просмотра свойств
        </div>
        {objectList.length > 0 && (
          <div
            style={{
              padding: "8px 12px",
              fontSize: 11,
              color: "var(--text-muted)",
            }}
          >
            В сцене:{" "}
            <strong style={{ color: "var(--text-primary)" }}>
              {objectList.length}
            </strong>{" "}
            объектов
          </div>
        )}
        {/* Проект */}
        <div className="csg-group" style={{ margin: "8px 8px 0" }}>
          <div className="csg-group-title">Проект</div>
          <button
            className="btn"
            style={{ width: "100%" }}
            onClick={onShowProjects}
          >
            📁 Менеджер проектов
          </button>
          <button
            className="btn primary"
            style={{ width: "100%", marginTop: 4 }}
            disabled={operationsLength === 0}
            onClick={() =>
              onSaveToProject(
                "Проект " + new Date().toLocaleTimeString("ru"),
              )
            }
          >
            💾 Быстрое сохранение
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="props-row">
        <span className="props-label">Тип</span>
        <span className="props-value">{firstSelected.shapeType}</span>
      </div>

      <div className="props-row">
        <span className="props-label">Цвет</span>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <div
            className="color-swatch"
            style={{ background: firstSelected.color }}
          />
          <input
            type="color"
            value={firstSelected.color}
            style={{
              width: 28,
              height: 22,
              border: "none",
              background: "none",
              cursor: "pointer",
              padding: 0,
            }}
            onChange={(e) => onSetColor(firstSelected.id, e.target.value)}
          />
        </div>
      </div>

      <div className="props-row">
        <span className="props-label">Видим</span>
        <button
          className="btn"
          style={{ padding: "2px 8px", fontSize: 11 }}
          onClick={() => onToggleVisible(firstSelected.id)}
        >
          {firstSelected.visible ? "👁 Да" : "🚫 Нет"}
        </button>
      </div>

      <div className="props-row">
        <span className="props-label">Триг.</span>
        <span className="props-value">
          {(firstSelected.indices.length / 3).toLocaleString()}
        </span>
      </div>

      <div className="props-section-title">Позиция (мм)</div>
      <NumInput
        label="X"
        value={firstSelected.transform.x}
        disabled={busy}
        onChange={(v) => onMoveAxis("x", v)}
      />
      <NumInput
        label="Y"
        value={firstSelected.transform.y}
        disabled={busy}
        onChange={(v) => onMoveAxis("y", v)}
      />
      <NumInput
        label="Z"
        value={firstSelected.transform.z}
        disabled={busy}
        onChange={(v) => onMoveAxis("z", v)}
      />

      <div className="props-section-title">Вращение (°)</div>
      <NumInput
        label="rotX"
        unit="°"
        value={firstSelected.transform.rotX}
        disabled={busy}
        onChange={(v) => onRotAxis("rotX", v)}
      />
      <NumInput
        label="rotY"
        unit="°"
        value={firstSelected.transform.rotY}
        disabled={busy}
        onChange={(v) => onRotAxis("rotY", v)}
      />
      <NumInput
        label="rotZ"
        unit="°"
        value={firstSelected.transform.rotZ}
        disabled={busy}
        onChange={(v) => onRotAxis("rotZ", v)}
      />

      <div className="props-section-title">Масштаб</div>
      <NumInput
        label="X"
        unit="×"
        min={0.01}
        step={0.1}
        value={Math.round(firstSelected.transform.scaleX * 1000) / 1000}
        disabled={busy}
        onChange={(v) => onScaleAxis("scaleX", v)}
      />
      <NumInput
        label="Y"
        unit="×"
        min={0.01}
        step={0.1}
        value={Math.round(firstSelected.transform.scaleY * 1000) / 1000}
        disabled={busy}
        onChange={(v) => onScaleAxis("scaleY", v)}
      />
      <NumInput
        label="Z"
        unit="×"
        min={0.01}
        step={0.1}
        value={Math.round(firstSelected.transform.scaleZ * 1000) / 1000}
        disabled={busy}
        onChange={(v) => onScaleAxis("scaleZ", v)}
      />

      {/* Resize dims — только для примитивов */}
      {canResize && firstSelected.shapeType !== "import_mesh" && (
        <div className="csg-group">
          <div className="csg-group-title">Размеры (мм)</div>
          {firstSelected.shapeType === "cube" && (
            <>
              <NumInput
                label="Ширина"
                min={0.1}
                value={firstSelected.params.width ?? 20}
                disabled={busy}
                onChange={(v) => onResizeDim("width", v)}
              />
              <NumInput
                label="Высота"
                min={0.1}
                value={firstSelected.params.height ?? 20}
                disabled={busy}
                onChange={(v) => onResizeDim("height", v)}
              />
              <NumInput
                label="Глубина"
                min={0.1}
                value={firstSelected.params.depth ?? 20}
                disabled={busy}
                onChange={(v) => onResizeDim("depth", v)}
              />
            </>
          )}
          {firstSelected.shapeType === "sphere" && (
            <>
              <NumInput
                label="Радиус"
                min={0.1}
                value={firstSelected.params.radius ?? 12}
                disabled={busy}
                onChange={(v) =>
                  onResizeObject(firstSelected.id, {
                    radius: Math.max(0.1, v),
                  })
                }
              />
            </>
          )}
          {(firstSelected.shapeType === "cylinder" ||
            firstSelected.shapeType === "cone") && (
            <>
              <NumInput
                label="Радиус"
                min={0.1}
                value={firstSelected.params.radius ?? 10}
                disabled={busy}
                onChange={(v) =>
                  onResizeObject(firstSelected.id, {
                    radius: Math.max(0.1, v),
                  })
                }
              />
              <NumInput
                label="Высота"
                min={0.1}
                value={firstSelected.params.height ?? 30}
                disabled={busy}
                onChange={(v) =>
                  onResizeObject(firstSelected.id, {
                    height: Math.max(0.1, v),
                  })
                }
              />
            </>
          )}
          {firstSelected.shapeType === "torus" && (
            <>
              <NumInput
                label="Радиус тора"
                min={1}
                value={firstSelected.params.torusRadius ?? 15}
                disabled={busy}
                onChange={(v) =>
                  onResizeObject(firstSelected.id, { torusRadius: Math.max(1, v) })
                }
              />
              <NumInput
                label="Радиус трубки"
                min={0.5}
                value={firstSelected.params.tubeRadius ?? 4}
                disabled={busy}
                onChange={(v) =>
                  onResizeObject(firstSelected.id, { tubeRadius: Math.max(0.5, v) })
                }
              />
            </>
          )}
          {(firstSelected.shapeType === "prism" ||
            firstSelected.shapeType === "pyramid") && (
            <>
              <NumInput
                label="Радиус"
                min={0.5}
                value={firstSelected.params.radius ?? 12}
                disabled={busy}
                onChange={(v) =>
                  onResizeObject(firstSelected.id, { radius: Math.max(0.5, v) })
                }
              />
              <NumInput
                label="Высота"
                min={0.1}
                value={firstSelected.params.height ?? 20}
                disabled={busy}
                onChange={(v) =>
                  onResizeObject(firstSelected.id, { height: Math.max(0.1, v) })
                }
              />
              <NumInput
                label="Граней"
                unit=""
                min={3}
                value={firstSelected.params.sides ?? (firstSelected.shapeType === "prism" ? 6 : 4)}
                disabled={busy}
                onChange={(v) =>
                  onResizeObject(firstSelected.id, { sides: Math.max(3, Math.round(v)) })
                }
              />
            </>
          )}
        </div>
      )}

      {/* Fillet — только для кубов */}
      {canFillet && (
        <div className="csg-group">
          <div className="csg-group-title">Скругление (Fillet)</div>
          <NumInput
            label="Радиус"
            unit="мм"
            min={0}
            value={filletRadius}
            onChange={onSetFilletRadius}
          />
          <button
            className="btn primary"
            disabled={!canFillet}
            onClick={() => onApplyFillet(firstSelected.id, filletRadius)}
          >
            ◌ Применить
          </button>
        </div>
      )}

      {/* Extrude */}
      {canExtrude && (
        <div className="csg-group">
          <div className="csg-group-title">Выдавливание (Extrude)</div>
          <div className="props-row">
            <span className="props-label">Ось</span>
            <div style={{ display: "flex", gap: 4 }}>
              {(["X", "Y", "Z"] as const).map((a) => (
                <button
                  key={a}
                  className={`btn${extrudeAxis === a ? " active" : ""}`}
                  style={{ minWidth: 30 }}
                  onClick={() => onSetExtrudeAxis(a)}
                >
                  {a}
                </button>
              ))}
            </div>
          </div>
          <NumInput
            label="Глубина"
            unit="мм"
            min={0.1}
            value={extrudeDepth}
            onChange={onSetExtrudeDepth}
          />
          <div style={{ display: "flex", gap: 4 }}>
            <button
              className="btn primary"
              style={{ flex: 1 }}
              disabled={!canExtrude}
              onClick={() => onExtrude(extrudeAxis, extrudeDepth)}
            >
              ▲ +{extrudeAxis}
            </button>
            <button
              className="btn"
              style={{ flex: 1 }}
              disabled={!canExtrude}
              onClick={() => onExtrude(extrudeAxis, -extrudeDepth)}
            >
              ▼ −{extrudeAxis}
            </button>
          </div>
        </div>
      )}

      {/* Зеркало */}
      {selectedIds.length === 1 && (
        <div className="csg-group">
          <div className="csg-group-title">Зеркало</div>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              className="btn"
              style={{ flex: 1 }}
              disabled={!canMirror}
              onClick={() => onMirror("YZ")}
            >
              YZ
            </button>
            <button
              className="btn"
              style={{ flex: 1 }}
              disabled={!canMirror}
              onClick={() => onMirror("XZ")}
            >
              XZ
            </button>
            <button
              className="btn"
              style={{ flex: 1 }}
              disabled={!canMirror}
              onClick={() => onMirror("XY")}
            >
              XY
            </button>
          </div>
        </div>
      )}

      {/* CSG */}
      {selectedIds.length === 2 && (
        <div className="csg-group">
          <div className="csg-group-title">CSG операции</div>
          <button
            className="btn primary"
            disabled={!canCsg}
            onClick={() => onCsg("union")}
          >
            ∪ Объединение
          </button>
          <button
            className="btn primary"
            disabled={!canCsg}
            onClick={() => onCsg("subtract")}
          >
            − Вычитание
          </button>
          <button
            className="btn primary"
            disabled={!canCsg}
            onClick={() => onCsg("intersect")}
          >
            ∩ Пересечение
          </button>
          <div className="csg-group-title" style={{ marginTop: 8 }}>
            Выравнивание
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            <button
              className="btn"
              style={{ flex: 1, minWidth: 36 }}
              disabled={!canAlign}
              onClick={() => onAlign("X", "min")}
            >
              X◧
            </button>
            <button
              className="btn"
              style={{ flex: 1, minWidth: 36 }}
              disabled={!canAlign}
              onClick={() => onAlign("X", "center")}
            >
              X⊡
            </button>
            <button
              className="btn"
              style={{ flex: 1, minWidth: 36 }}
              disabled={!canAlign}
              onClick={() => onAlign("X", "max")}
            >
              X◨
            </button>
            <button
              className="btn"
              style={{ flex: 1, minWidth: 36 }}
              disabled={!canAlign}
              onClick={() => onAlign("Y", "min")}
            >
              Y◧
            </button>
            <button
              className="btn"
              style={{ flex: 1, minWidth: 36 }}
              disabled={!canAlign}
              onClick={() => onAlign("Y", "center")}
            >
              Y⊡
            </button>
            <button
              className="btn"
              style={{ flex: 1, minWidth: 36 }}
              disabled={!canAlign}
              onClick={() => onAlign("Y", "max")}
            >
              Y◨
            </button>
          </div>
        </div>
      )}
    </>
  );
}
