import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import NumInput from "./NumInput";
import CsgButtons from "./CsgButtons";
import type { ShapeParams, SceneObject } from "../csg/types";
import { EyeIcon, EyeOffIcon, FolderIcon, SaveIcon } from "./icons";
import { isTextObject } from '../store/text-object'

export default function PropertiesPanel({
  firstSelected,
  busy,
  selectedIds,
  canResize,
  canCsg,
  objectList,
  operationsLength,
  fileName,
  onMoveAxis,
  onRotAxis,
  onScaleAxis,
  onResizeDim,
  onResizeObject,
  onCsg,
  onSetColor,
  onToggleVisible,
  onShowProjects,
  onSaveToProject,
  currentProjectId,
  currentProjectName,
  modified,
}: {
  firstSelected: SceneObject | null;
  busy: boolean;
  selectedIds: string[];
  canResize: boolean;
  canCsg: boolean;
  objectList: SceneObject[];
  operationsLength: number;
  fileName: string | null;
  currentProjectId: string | null;
  currentProjectName: string | null;
  modified: boolean;
  onMoveAxis: (axis: "x" | "y" | "z", val: number) => void;
  onRotAxis: (axis: "rotX" | "rotY" | "rotZ", val: number) => void;
  onScaleAxis: (axis: "scaleX" | "scaleY" | "scaleZ", val: number) => void;
  onResizeDim: (dim: "width" | "height" | "depth", val: number) => void;
  onResizeObject: (id: string, params: ShapeParams) => void;
  onCsg: (op: "union" | "subtract" | "intersect") => void;
  onSetColor: (id: string, color: string, skipHistory?: boolean) => void;
  onToggleVisible: (id: string) => void;
  onShowProjects: () => void;
  onSaveToProject: (name: string) => void;
}) {
  const { t } = useTranslation();
  // FIX: Draft color state — preview in real-time (no history), commit once
  // on blur or object switch.
  //
  // FIX (COLOR-HISTORY): Comparing draftColor against firstSelected.color was
  // always false — handleColorChange already previews the color into the store,
  // so at blur time they were equal and the 'color' operation was NEVER added
  // to history. As a result user-assigned colors were not saved to .3dtc and
  // reset to defaults after reload. Track the target object id and the base
  // (committed) color at draft start instead.
  const [draftColor, setDraftColor] = useState<string | null>(null);
  const draftTargetIdRef = useRef<string | null>(null);
  const baseColorRef = useRef<string | null>(null);

  const commitDraftColor = () => {
    const targetId = draftTargetIdRef.current;
    const base = baseColorRef.current;
    if (targetId && draftColor && base !== null && draftColor !== base) {
      onSetColor(targetId, draftColor);
    }
    setDraftColor(null);
    draftTargetIdRef.current = null;
    baseColorRef.current = null;
  };

  // Apply draft color when blur fires
  const applyDraftColor = () => commitDraftColor();

  // Preview color change in real-time (no history entry)
  const handleColorChange = (color: string) => {
    if (firstSelected) {
      // Capture target object and committed color on the first change only
      if (draftTargetIdRef.current === null) {
        draftTargetIdRef.current = firstSelected.id;
        baseColorRef.current = firstSelected.color;
      }
      setDraftColor(color);
      // Update store for visual feedback — skip history
      onSetColor(firstSelected.id, color, true);
    }
  };

  // Commit pending draft when selected object changes (blur may not fire,
  // e.g. Escape deselect while the color input is focused), then reset
  useEffect(() => {
    const targetId = draftTargetIdRef.current;
    const base = baseColorRef.current;
    if (targetId && targetId !== firstSelected?.id && draftColor && base !== null && draftColor !== base) {
      onSetColor(targetId, draftColor);
    }
    setDraftColor(null);
    draftTargetIdRef.current = null;
    baseColorRef.current = null;
  }, [firstSelected?.id]);

  if (!firstSelected) {
    return (
      <>
        <div className="props-empty">
          {t("properties.selectObject")}
          <br />
          {t("properties.toViewProperties")}
        </div>
        {objectList.length > 0 && (
          <div className="text-sm text-muted-xs" style={{ padding: "8px 12px" }}>
            {t("properties.inScene")}{" "}
            <strong className="text-primary">
              {objectList.length}
            </strong>{" "}
            {t("properties.objects")}
          </div>
        )}
        {/* Проект */}
        <div className="csg-group margin-8-0">
          <div className="csg-group-title">{t("actions.save")}</div>
          {currentProjectName ? (
            <div className="text-sm text-muted" style={{ padding: "4px 12px 8px" }}>
              📁 <strong>{currentProjectName}</strong>
              {modified && <span className="text-warning"> •</span>}
            </div>
          ) : fileName ? (
            <div className="text-sm text-muted" style={{ padding: "4px 12px 8px" }}>
              📄 <strong>{fileName}</strong>
              {modified && <span className="text-warning"> •</span>}
            </div>
          ) : (
            <div className="text-sm text-muted" style={{ padding: "4px 12px 8px" }}>
              {t("properties.unsavedProject")}
            </div>
          )}
          <button
            className="btn btn-full"
            onClick={onShowProjects}
          >
            <FolderIcon size={32} /> {t("properties.projectManager")}
          </button>
          <button
            className="btn primary btn-full mt-2"
            disabled={operationsLength === 0}
            onClick={() =>
              onSaveToProject(currentProjectName ?? "")
            }
          >
            <SaveIcon size={32} /> {currentProjectId ? t("properties.save") : t("properties.quickSave")}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="props-row">
        <span className="props-label">{t("properties.type")}</span>
        <span className="props-value">
          {firstSelected.shapeType === 'csg' ? t("csg.result") :
            isTextObject(firstSelected) ? t("shapes.text") :             /* UX-AUDIT-31 */
            firstSelected.shapeType === 'import_mesh' ? t("actions.import") :
              t(`shapes.${firstSelected.shapeType}`)}
        </span>
      </div>

      <div className="props-row">
        <span className="props-label">{t("properties.color")}</span>
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
        <span className="props-label">{t("properties.visible")}</span>
        <button
          className="btn btn-compact"
          onClick={() => onToggleVisible(firstSelected.id)}
        >
          {firstSelected.visible ? <EyeIcon size={32} /> : <EyeOffIcon size={32} />}{" "}
          {firstSelected.visible ? t("properties.yes") : t("properties.no")}
        </button>
      </div>

      <div className="props-row">
        <span className="props-label">{t("properties.triangles")}</span>
        <span className="props-value">
          {(firstSelected.indices.length / 3).toLocaleString()}
        </span>
      </div>

      <div className="props-section-title">{t("properties.position")}</div>
      <NumInput
        id="num-input-pos-X"
        label="X"
        value={firstSelected.transform.x}
        disabled={busy}
        onChange={(v) => onMoveAxis("x", v)}
      />
      <NumInput
        id="num-input-pos-Y"
        label="Y"
        value={firstSelected.transform.y}
        disabled={busy}
        onChange={(v) => onMoveAxis("y", v)}
      />
      <NumInput
        id="num-input-pos-Z"
        label="Z"
        value={firstSelected.transform.z}
        disabled={busy}
        onChange={(v) => onMoveAxis("z", v)}
      />

      <div className="props-section-title">{t("properties.rotation")}</div>
      <NumInput
        id="num-input-rot-X"
        label="rotX"
        unit="°"
        value={firstSelected.transform.rotX}
        disabled={busy}
        onChange={(v) => onRotAxis("rotX", v)}
      />
      <NumInput
        id="num-input-rot-Y"
        label="rotY"
        unit="°"
        value={firstSelected.transform.rotY}
        disabled={busy}
        onChange={(v) => onRotAxis("rotY", v)}
      />
      <NumInput
        id="num-input-rot-Z"
        label="rotZ"
        unit="°"
        value={firstSelected.transform.rotZ}
        disabled={busy}
        onChange={(v) => onRotAxis("rotZ", v)}
      />

      <div className="props-section-title">{t("properties.scale")}</div>
      <NumInput
        id="num-input-scale-X"
        label="X"
        unit="×"
        min={0.01}
        step={0.1}
        value={Math.round(firstSelected.transform.scaleX * 1000) / 1000}
        disabled={busy}
        onChange={(v) => onScaleAxis("scaleX", v)}
      />
      <NumInput
        id="num-input-scale-Y"
        label="Y"
        unit="×"
        min={0.01}
        step={0.1}
        value={Math.round(firstSelected.transform.scaleY * 1000) / 1000}
        disabled={busy}
        onChange={(v) => onScaleAxis("scaleY", v)}
      />
      <NumInput
        id="num-input-scale-Z"
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
          <div className="csg-group-title">{t("properties.dimensions")}</div>
          {firstSelected.shapeType === "cube" && !firstSelected.params.width && firstSelected.originalBboxSize ? (
            // CSG result: show real bbox dimensions in mm
            <>
              <NumInput
                label={t("properties.width")}
                min={0.1}
                value={Math.round(firstSelected.originalBboxSize.x * 100) / 100}
                disabled={busy}
                onChange={(v) => onResizeObject(firstSelected.id, { width: v })}
              />
              <NumInput
                label={t("properties.height")}
                min={0.1}
                value={Math.round(firstSelected.originalBboxSize.y * 100) / 100}
                disabled={busy}
                onChange={(v) => onResizeObject(firstSelected.id, { height: v })}
              />
              <NumInput
                label={t("properties.depth")}
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
                label={t("properties.width")}
                min={0.1}
                value={firstSelected.params.width ?? 20}
                disabled={busy}
                onChange={(v) => onResizeDim("width", v)}
              />
              <NumInput
                label={t("properties.height")}
                min={0.1}
                value={firstSelected.params.height ?? 20}
                disabled={busy}
                onChange={(v) => onResizeDim("height", v)}
              />
              <NumInput
                label={t("properties.depth")}
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
                label={t("properties.radius")}
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
                  label={t("properties.radius")}
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
                  label={t("properties.height")}
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
                label={t("properties.torusRadius")}
                min={1}
                value={firstSelected.params.torusRadius ?? 15}
                disabled={busy}
                onChange={(v) =>
                  onResizeObject(firstSelected.id, { torusRadius: Math.max(1, v) })
                }
              />
              <NumInput
                label={t("properties.tubeRadius")}
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
                  label={t("properties.radius")}
                  min={0.5}
                  value={firstSelected.params.radius ?? 12}
                  disabled={busy}
                  onChange={(v) =>
                    onResizeObject(firstSelected.id, { radius: Math.max(0.5, v) })
                  }
                />
                <NumInput
                  label={t("properties.height")}
                  min={0.1}
                  value={firstSelected.params.height ?? 20}
                  disabled={busy}
                  onChange={(v) =>
                    onResizeObject(firstSelected.id, { height: Math.max(0.1, v) })
                  }
                />
                <NumInput
                  label={t("properties.sides")}
                  unit=""
                  integer
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

      {/* Extrude — скрыто в свойствах, доступно на панели инструментов */}
      {/* Mirror — скрыто в свойствах, доступно на панели инструментов */}

      {/* CSG (выравнивание — режим «Выровнять» в тулбаре, ALIGN-UI-REVIT) */}
      {selectedIds.length === 2 && (
        <CsgButtons disabled={!canCsg} onCsg={onCsg} variant="full" />
      )}
    </>
  );
}
