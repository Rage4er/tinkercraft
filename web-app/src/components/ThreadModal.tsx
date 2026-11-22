import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { ThreadIcon, PlusIcon } from "./icons";
import {
  threadNominals, threadPitches, threadSizeOf, threadSizes, THREAD_STARTS,
  type ThreadHand, type ThreadKind, type ThreadSeries,
} from "../csg/thread-table";

export default function ThreadModal({
  series,
  sizeId,
  length,
  kind,
  hand,
  starts,
  allSizes,
  busy,
  workerOk,
  onSeriesChange,
  onSizeChange,
  onLengthChange,
  onKindChange,
  onHandChange,
  onStartsChange,
  onAllSizesChange,
  onCreate,
  onClose,
}: {
  series: ThreadSeries;
  sizeId: string;
  length: number;
  kind: ThreadKind;
  hand: ThreadHand;
  starts: number;
  allSizes: boolean;
  busy: boolean;
  workerOk: boolean;
  onSeriesChange: (v: ThreadSeries) => void;
  onSizeChange: (v: string) => void;
  onLengthChange: (v: number) => void;
  onKindChange: (v: ThreadKind) => void;
  onHandChange: (v: ThreadHand) => void;
  onStartsChange: (v: number) => void;
  onAllSizesChange: (v: boolean) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const handleCreate = useCallback(() => void onCreate(), [onCreate]);
  const selected = threadSizeOf(series, sizeId) ?? threadSizes(series, allSizes)[0];
  const nominal = selected.nominal ?? selected.id;
  const nominals = threadNominals(series, allSizes);
  const pitches = threadPitches(series, nominal, allSizes);

  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === "Escape") { e.preventDefault(); onCloseRef.current(); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const changeNominal = (value: string): void => {
    const first = threadPitches(series, value, allSizes)[0];
    if (first) onSizeChange(first.id);
  };
  const changeAllSizes = (checked: boolean): void => {
    onAllSizesChange(checked);
    if (!checked && !selected.popular) {
      const same = threadPitches(series, nominal, false)[0];
      onSizeChange((same ?? threadSizes(series, false)[0]).id);
    }
  };

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
              onChange={(e) => onSeriesChange(e.target.value as ThreadSeries)}
            >
              <option value="metric">{t("threadModal.metric")}</option>
              <option value="unc">{t("threadModal.unc")}</option>
              <option value="unf">{t("threadModal.unf")}</option>
              <option value="npt">{t("threadModal.npt")}</option>
              <option value="bsp">{t("threadModal.bsp")}</option>
              <option value="square">{t("threadModal.square")}</option>
            </select>
          </label>
          <label className="thread-modal-field">
            <span>{t("threadModal.size")}</span>
            <select
              className="thread-modal-control"
              data-testid="thread-nominal"
              value={nominal}
              onChange={(e) => changeNominal(e.target.value)}
            >
              {nominals.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
        </div>
        <div className="text-modal-row thread-modal-row">
          <label className="thread-modal-field">
            <span>{t("threadModal.pitch")}</span>
            <select
              className="thread-modal-control"
              data-testid="thread-size"
              value={selected.id}
              onChange={(e) => onSizeChange(e.target.value)}
            >
              {pitches.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
            </select>
          </label>
          <label className="thread-modal-field">
            <span>{t("threadModal.hand")}</span>
            <select
              className="thread-modal-control"
              data-testid="thread-hand"
              value={hand}
              onChange={(e) => onHandChange(e.target.value === "left" ? "left" : "right")}
            >
              <option value="right">{t("threadModal.rightHand")}</option>
              <option value="left">{t("threadModal.leftHand")}</option>
            </select>
          </label>
        </div>
        <div className="text-modal-row thread-modal-row">
          <label className="thread-modal-field">
            <span>{t("threadModal.starts")}</span>
            <select
              className="thread-modal-control"
              data-testid="thread-starts"
              value={starts}
              onChange={(e) => onStartsChange(Number(e.target.value))}
            >
              {THREAD_STARTS.map((n) => <option key={n} value={n}>{n}</option>)}
            </select>
          </label>
          <div className="thread-modal-field thread-modal-starts-hint">
            {t("threadModal.startsHint", { lead: Math.round(selected.pitch * starts * 100) / 100 })}
          </div>
        </div>
        <label className="thread-modal-check">
          <input
            type="checkbox"
            data-testid="thread-all-sizes"
            checked={allSizes}
            onChange={(e) => changeAllSizes(e.target.checked)}
          />
          <span>{t("threadModal.allSizes")}</span>
        </label>
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
        {(selected.extended || series === "npt" || series === "bsp" || series === "square") && (
          <div className="thread-modal-hint">
            {selected.extended ? t("threadModal.extendedHint")
              : series === "square" ? t("threadModal.squareHint") : t("threadModal.pipeHint")}
          </div>
        )}
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
