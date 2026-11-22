import { useTranslation } from "react-i18next";
import NumInput from "./NumInput";
import {
  THREAD_STARTS, THREAD_LENGTH_MAX, THREAD_LENGTH_MIN, threadNominals, threadPitches,
  threadSizeOf, threadSizes, type ThreadParams, type ThreadSeries,
} from "../csg/thread-table";

/**
 * THREAD-PARAMETRIC: параметры выбранной резьбы в PropertiesPanel. Каждое изменение —
 * полный новый набор параметров; document-store пишет шаг `edit_step` с пересборкой.
 */
export default function ThreadProperties({
  params,
  disabled,
  onChange,
}: {
  params: ThreadParams;
  disabled: boolean;
  onChange: (next: ThreadParams) => void;
}) {
  const { t } = useTranslation();
  const selected = threadSizeOf(params.series, params.sizeId) ?? threadSizes(params.series, true)[0];
  const nominal = selected.nominal ?? selected.id;
  const nominals = threadNominals(params.series, true);
  const pitches = threadPitches(params.series, nominal, true);
  const lead = Math.round(selected.pitch * params.starts * 100) / 100;

  const changeSeries = (series: ThreadSeries): void => {
    const first = threadSizes(series)[0] ?? threadSizes(series, true)[0];
    if (first) onChange({ ...params, series, sizeId: first.id });
  };
  const changeNominal = (value: string): void => {
    const first = threadPitches(params.series, value, true)[0];
    if (first) onChange({ ...params, sizeId: first.id });
  };

  return (
    <div className="csg-group" data-testid="props-thread">
      <div className="csg-group-title">{t("threadProperties.title")}</div>
      <label className="thread-modal-field">
        <span>{t("threadModal.series")}</span>
        <select
          className="thread-modal-control"
          data-testid="props-thread-series"
          value={params.series}
          disabled={disabled}
          onChange={(e) => changeSeries(e.target.value as ThreadSeries)}
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
          data-testid="props-thread-nominal"
          value={nominal}
          disabled={disabled}
          onChange={(e) => changeNominal(e.target.value)}
        >
          {nominals.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </label>
      <label className="thread-modal-field">
        <span>{t("threadModal.pitch")}</span>
        <select
          className="thread-modal-control"
          data-testid="props-thread-size"
          value={selected.id}
          disabled={disabled}
          onChange={(e) => onChange({ ...params, sizeId: e.target.value })}
        >
          {pitches.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      </label>
      <div className="thread-modal-row">
        <label className="thread-modal-field">
          <span>{t("threadModal.starts")}</span>
          <select
            className="thread-modal-control"
            data-testid="props-thread-starts"
            value={params.starts}
            disabled={disabled}
            onChange={(e) => onChange({ ...params, starts: Number(e.target.value) })}
          >
            {THREAD_STARTS.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </label>
        <label className="thread-modal-field">
          <span>{t("threadModal.hand")}</span>
          <select
            className="thread-modal-control"
            data-testid="props-thread-hand"
            value={params.hand}
            disabled={disabled}
            onChange={(e) => onChange({ ...params, hand: e.target.value === "left" ? "left" : "right" })}
          >
            <option value="right">{t("threadModal.rightHand")}</option>
            <option value="left">{t("threadModal.leftHand")}</option>
          </select>
        </label>
      </div>
      <NumInput
        label={t("threadModal.length")}
        testId="props-thread-length"
        min={THREAD_LENGTH_MIN}
        max={THREAD_LENGTH_MAX}
        value={params.length}
        disabled={disabled}
        onChange={(value) => onChange({ ...params, length: value })}
      />
      <label className="thread-modal-field">
        <span>{t("threadModal.kind")}</span>
        <select
          className="thread-modal-control"
          data-testid="props-thread-kind"
          value={params.kind}
          disabled={disabled}
          onChange={(e) => onChange({ ...params, kind: e.target.value === "nut" ? "nut" : "bolt" })}
        >
          <option value="bolt">{t("threadModal.bolt")}</option>
          <option value="nut">{t("threadModal.nut")}</option>
        </select>
      </label>
      <div className="thread-modal-hint">{t("threadProperties.lead", { value: lead })}</div>
    </div>
  );
}
