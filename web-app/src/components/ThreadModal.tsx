import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ThreadIcon, PlusIcon } from "./icons";
import { threadSizes, type ThreadKind, type ThreadSeries } from "../csg/thread-table";

/** THREAD-GENERATOR: окно «Резьба» — серия, размер, длина, болт/гайка, «Создать». */
export default function ThreadModal({
  series,
  sizeId,
  length,
  kind,
  busy,
  workerOk,
  onSeriesChange,
  onSizeChange,
  onLengthChange,
  onKindChange,
  onCreate,
  onClose,
}: {
  series: ThreadSeries;
  sizeId: string;
  length: number;
  kind: ThreadKind;
  busy: boolean;
  workerOk: boolean;
  onSeriesChange: (v: ThreadSeries) => void;
  onSizeChange: (v: string) => void;
  onLengthChange: (v: number) => void;
  onKindChange: (v: ThreadKind) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const handleCreate = useCallback(() => void onCreate(), [onCreate]);
  const sizes = threadSizes(series);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") { e.preventDefault(); onCloseRef.current(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="text-modal-backdrop" onClick={onClose}>
      <div
        className="text-modal-box thread-modal-box"
        data-testid="thread-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="thread-modal-title"
      >
        <div className="text-modal-title thread-modal-title" id="thread-modal-title">
          <ThreadIcon size={28} /> {t("threadModal.title")}
        </div>
        <div className="text-modal-row thread-modal-row">
          <label className="thread-modal-field">
            <span>{t("threadModal.series")}</span>
            <select
              className="thread-modal-control"
              data-testid="thread-series"
              value={series}
              onChange={(e) => onSeriesChange(e.target.value === "imperial" ? "imperial" : "metric")}
            >
              <option value="metric">{t("threadModal.metric")}</option>
              <option value="imperial">{t("threadModal.imperial")}</option>
            </select>
          </label>
          <label className="thread-modal-field">
            <span>{t("threadModal.size")}</span>
            <select
              className="thread-modal-control"
              data-testid="thread-size"
              value={sizeId}
              onChange={(e) => onSizeChange(e.target.value)}
            >
              {sizes.map((s) => (
                <option key={s.id} value={s.id}>{s.label}</option>
              ))}
            </select>
          </label>
        </div>
        <div className="text-modal-row thread-modal-row">
          <label className="thread-modal-field">
            <span>{t("threadModal.length")}</span>
            <span className="thread-modal-length">
              <input
                type="number"
                value={length}
                min={4}
                max={120}
                className="thread-modal-control"
                data-testid="thread-length"
                onChange={(e) => {
                  const v = Number(e.target.value);
                  if (!isNaN(v)) onLengthChange(v);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleCreate();
                }}
              />
              <span>{t("units.mm")}</span>
            </span>
          </label>
          <label className="thread-modal-field">
            <span>{t("threadModal.kind")}</span>
            <select
              className="thread-modal-control"
              data-testid="thread-kind"
              value={kind}
              onChange={(e) => onKindChange(e.target.value === "nut" ? "nut" : "bolt")}
            >
              <option value="bolt">{t("threadModal.bolt")}</option>
              <option value="nut">{t("threadModal.nut")}</option>
            </select>
          </label>
        </div>
        <div className="text-modal-actions">
          <button
            className="btn primary flex-1"
            data-testid="thread-create"
            disabled={busy || !workerOk || !(length > 0)}
            onClick={handleCreate}
          >
            <PlusIcon size={20} /> {t("threadModal.create")}
          </button>
          <button className="btn" onClick={onClose}>
            {t("actions.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
