import { useState, useEffect } from "react";
import NumInput from "./NumInput";
import AlignButtons from "./AlignButtons";
import CsgButtons from "./CsgButtons";
import type { ShapeParams, SceneObject } from "../csg/types";

export default function PropertiesPanel({
  firstSelected,
  busy,
  selectedIds,
  canResize,
  canFillet,
  canCsg,
  canAlign,
  filletRadius,
  objectList,
  operationsLength,
  onSetFilletRadius,
  onMoveAxis,
  onRotAxis,
  onScaleAxis,
  onResizeDim,
  onResizeObject,
  onApplyFillet,
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
  canCsg: boolean;
  canAlign: boolean;
  filletRadius: number;
  objectList: SceneObject[];
  operationsLength: number;
  onSetFilletRadius: (v: number) => void;
  onMoveAxis: (axis: "x" | "y" | "z", val: number) => void;
  onRotAxis: (axis: "rotX" | "rotY" | "rotZ", val: number) => void;
  onScaleAxis: (axis: "scaleX" | "scaleY" | "scaleZ", val: number) => void;
  onResizeDim: (dim: "width" | "height" | "depth", val: number) => void;
  onResizeObject: (id: string, params: ShapeParams) => void;
  onApplyFillet: (id: string, radius: number) => void;
  onCsg: (op: "union" | "subtract" | "intersect") => void;
  onAlign: (axis: "X" | "Y" | "Z", anchor: "min" | "center" | "max") => void;
  onSetColor: (id: string, color: string, skipHistory?: boolean) => void;
  onToggleVisible: (id: string) => void;
  onShowProjects: () => void;
  onSaveToProject: (name: string) => void;
}) {
  // FIX: Draft color state — only commit to history on blur or object switch
  const [draftColor, setDraftColor] = useState<string | null>(null);

  // Apply draft color when object changes or when blur fires
  const applyDraftColor = () => {
    if (firstSelected && draftColor && draftColor !== firstSelected.color) {
      onSetColor(firstSelected.id, draftColor);
    }
    setDraftColor(null);
  };

  // Preview color change in real-time (no history entry)
  const handleColorChange = (color: string) => {
    if (firstSelected) {
      setDraftColor(color);
      // Update store for visual feedback — skip history
      onSetColor(firstSelected.id, color, true);
    }
  };

  // Reset draft color when selected object changes
  useEffect(() => {
    setDraftColor(null);
  }, [firstSelected?.id]);

  if (!firstSelected) {
    return (
      <>
        <div className="props-empty">
          Выберите объект
          <br />
          для просмотра свойств
        </div>
        {objectList.length > 0 && (
          <div className="text-sm text-muted-xs" style={{ padding: "8px 12px" }}>
            В сцене:{" "}
            <strong className="text-primary">
              {objectList.length}
            </strong>{" "}
            объектов
          </div>
        )}
        {/* Проект */}
        <div className="csg-group margin-8-0">
          <div className="csg-group-title">Проект</div>
          <button
            className="btn btn-full"
            onClick={onShowProjects}
          >
            📁 Менеджер проектов
          </button>
          <button
            className="btn primary btn-full mt-2"
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
        <div className="flex-row-6">
          <div
            className="color-swatch"
            style={{ background: draftColor || firstSelected.color }}
          />
          <input
            type="color"
            value={draftColor || firstSelected.color}
            className="color-input"
            onChange={(e) => handleColorChange(e.target.value)}
            onBlur={applyDraftColor}
          />
        </div>
      </div>

      <div className="props-row">
        <span className="props-label">Видим</span>
        <button
          className="btn btn-compact"
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

      {/* Resize dims — только для примитивов и CSG результатов */}
      {canResize && firstSelected.shapeType !== "import_mesh" && (
        <div className="csg-group">
          <div className="csg-group-title">Размеры (мм)</div>
          {firstSelected.shapeType === "cube" && !firstSelected.params.width && firstSelected.originalBboxSize ? (
            // CSG result: show real bbox dimensions in mm
            <>
              <NumInput
                label="Ширина"
                min={0.1}
                value={Math.round(firstSelected.originalBboxSize.x * 100) / 100}
                disabled={busy}
                onChange={(v) => onResizeObject(firstSelected.id, { width: v })}
              />
              <NumInput
                label="Высота"
                min={0.1}
                value={Math.round(firstSelected.originalBboxSize.y * 100) / 100}
                disabled={busy}
                onChange={(v) => onResizeObject(firstSelected.id, { height: v })}
              />
              <NumInput
                label="Глубина"
                min={0.1}
                value={Math.round(firstSelected.originalBboxSize.z * 100) / 100}
                disabled={busy}
                onChange={(v) => onResizeObject(firstSelected.id, { depth: v })}
              />
            </>
          ) : firstSelected.shapeType === "cube" && firstSelected.params.width ? (
            // Regular cube: show params
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
          ) : null}
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

      {/* Extrude — скрыто в свойствах, доступно на панели инструментов */}
      {/* Mirror — скрыто в свойствах, доступно на панели инструментов */}

      {/* CSG + Align */}
      {selectedIds.length === 2 && (
        <>
          <CsgButtons disabled={!canCsg} onCsg={onCsg} variant="full" />
          <AlignButtons disabled={!canAlign} onAlign={onAlign} variant="full" />
        </>
      )}
    </>
  );
}
