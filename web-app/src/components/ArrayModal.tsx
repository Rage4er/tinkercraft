import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import NumInput from "./NumInput";
import { ArrayIcon, ArrayCircularIcon } from "./icons";
import { useDocumentStore } from "../store/document-store";
import { computeWorldAABB } from "../store/helpers";
import { ARRAY_MAX_COUNT, DEFAULT_ARRAY_PARAMS } from "../store/array-tool";
import type { ArrayParams, Vec3 } from "../csg/types";

type Axis = ArrayParams["axis"];
const AXES: Axis[] = ["X", "Y", "Z"];
const KEY = { X: "x", Y: "y", Z: "z" } as const;
/** Зазор между экземплярами в шаге по умолчанию, мм */
const GAP = 5;
/** Количество по умолчанию у кругового массива */
const CIRCULAR_COUNT = 6;

/**
 * ARRAY-TOOL: окно «Массив» (кнопка в тулбаре, выбран объект). Линейный — ось, количество (всего, с
 * исходным), шаг; круговой — ось, количество, угол (360° — полный круг), центр (точка оси вращения).
 * «Создать» — один шаг истории `array`. Шаг по умолчанию — размер выделения по оси + 5 мм (копии
 * встают рядом, не внахлёст), пока его не меняли. Esc / фон / «Отмена» — закрыть без изменений.
 */
export default function ArrayModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const selectedIds = useDocumentStore((s) => s.selectedIds);
  const objects = useDocumentStore((s) => s.objects);
  const busy = useDocumentStore((s) => s.busy);
  const arraySelected = useDocumentStore((s) => s.arraySelected);

  /** Габарит выделения по мировым осям */
  const size = useMemo<Vec3>(() => {
    const min = { x: Infinity, y: Infinity, z: Infinity }, max = { x: -Infinity, y: -Infinity, z: -Infinity };
    for (const id of selectedIds) {
      const o = objects[id];
      if (!o) continue;
      const b = computeWorldAABB(o);
      for (const k of ["x", "y", "z"] as const) { min[k] = Math.min(min[k], b.min[k]); max[k] = Math.max(max[k], b.max[k]); }
    }
    const d = (k: "x" | "y" | "z") => (Number.isFinite(max[k] - min[k]) ? max[k] - min[k] : 0);
    return { x: d("x"), y: d("y"), z: d("z") };
  }, [selectedIds, objects]);
  const stepFor = (axis: Axis) => Math.round((size[KEY[axis]] + GAP) * 10) / 10 || DEFAULT_ARRAY_PARAMS.step;

  const [kind, setKind] = useState<ArrayParams["kind"]>("linear");
  const [axis, setAxis] = useState<Axis>("X");
  const [count, setCount] = useState(DEFAULT_ARRAY_PARAMS.count);
  const [countTouched, setCountTouched] = useState(false);
  const [step, setStep] = useState(() => stepFor("X"));
  const [stepTouched, setStepTouched] = useState(false);
  const [angle, setAngle] = useState(DEFAULT_ARRAY_PARAMS.angle);
  const [center, setCenter] = useState<Vec3>({ ...DEFAULT_ARRAY_PARAMS.center });
  const createRef = useRef<HTMLButtonElement>(null);
  useEffect(() => { createRef.current?.focus(); }, []);

  const pickKind = (k: ArrayParams["kind"]) => {
    setKind(k);
    // количество, которое не меняли, — по умолчанию типа: линейный ×3, круговой ×6
    if (!countTouched) setCount(k === "circular" ? CIRCULAR_COUNT : DEFAULT_ARRAY_PARAMS.count);
    if (k === "circular") setAxis("Z");
    else { setAxis("X"); if (!stepTouched) setStep(stepFor("X")); }
  };
  const pickAxis = (a: Axis) => { setAxis(a); if (kind === "linear" && !stepTouched) setStep(stepFor(a)); };

  const create = async () => {
    const params: ArrayParams = kind === "linear" ? { kind, axis, count, step } : { kind, axis, count, angle, center };
    if (await arraySelected(params)) onClose();
  };
  const canCreate = !busy && selectedIds.some((id) => objects[id]);

  return (
    <div
      className="text-modal-backdrop"
      onClick={onClose}
      onKeyDown={(e) => {
        e.stopPropagation();
        if (e.key === "Escape") onClose();
      }}
    >
      <div
        className="text-modal-box dim-settings-box"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="array-title"
        data-testid="array-modal"
      >
        <div className="text-modal-title" id="array-title">{t("array.title")}</div>

        <div className="dim-settings-field">
          <span className="dim-settings-label">{t("array.kind")}</span>
          <div className="array-seg" role="radiogroup" aria-label={t("array.kind")}>
            {(["linear", "circular"] as const).map((k) => (
              <button
                key={k}
                type="button"
                role="radio"
                aria-checked={kind === k}
                className={`btn array-seg-btn${kind === k ? " active" : ""}`}
                data-testid={`array-kind-${k}`}
                onClick={() => pickKind(k)}
              >
                {k === "linear" ? <ArrayIcon size={18} /> : <ArrayCircularIcon size={18} />} {t(`array.${k}`)}
              </button>
            ))}
          </div>
        </div>

        <div className="dim-settings-field">
          <span className="dim-settings-label">{kind === "linear" ? t("array.axisLinear") : t("array.axisCircular")}</span>
          <div className="array-seg" role="radiogroup" aria-label={t("array.axis")}>
            {AXES.map((a) => (
              <button
                key={a}
                type="button"
                role="radio"
                aria-checked={axis === a}
                className={`btn array-seg-btn${axis === a ? " active" : ""}`}
                data-testid={`array-axis-${a}`}
                onClick={() => pickAxis(a)}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <NumInput id="array-count" label={t("array.count")} unit="" integer min={2} max={ARRAY_MAX_COUNT} value={count} onChange={(v) => { setCount(Math.max(2, Math.min(ARRAY_MAX_COUNT, Math.round(v)))); setCountTouched(true); }} />
        {kind === "linear" ? (
          <NumInput id="array-step" label={t("array.step")} value={step} onChange={(v) => { setStep(v); setStepTouched(true); }} />
        ) : (
          <>
            <NumInput id="array-angle" label={t("array.angle")} unit="°" min={-360} max={360} value={angle} onChange={(v) => setAngle(Math.max(-360, Math.min(360, v)))} />
            <div className="text-sm text-muted-xs">{t("array.center")}</div>
            {(["x", "y", "z"] as const).map((k) => (
              <NumInput key={k} id={`array-center-${k.toUpperCase()}`} label={k.toUpperCase()} value={center[k]} onChange={(v) => setCenter((c) => ({ ...c, [k]: v }))} />
            ))}
          </>
        )}
        <div className="text-sm text-muted-xs" style={{ marginTop: 6 }}>
          {kind === "linear" ? t("array.hintLinear", { count }) : t("array.hintCircular", { count })}
        </div>

        <div className="text-modal-actions">
          <button className="btn" data-testid="array-cancel" onClick={onClose}>{t("array.cancel")}</button>
          <button ref={createRef} className="btn primary" data-testid="array-create" disabled={!canCreate} onClick={() => void create()}>{t("array.create")}</button>
        </div>
      </div>
    </div>
  );
}
