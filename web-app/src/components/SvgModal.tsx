import { useCallback, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { SvgIcon, PlusIcon } from "./icons";

/** SVG-EXTRUDE: окно «SVG → 3D» — файл выбран, задаются глубина и масштаб, «Создать» строит тело. */
export default function SvgModal({
  fileName,
  depth,
  scale,
  busy,
  workerOk,
  onDepthChange,
  onScaleChange,
  onCreate,
  onClose,
}: {
  fileName: string;
  depth: number;
  scale: number;
  busy: boolean;
  workerOk: boolean;
  onDepthChange: (v: number) => void;
  onScaleChange: (v: number) => void;
  onCreate: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const handleCreate = useCallback(() => void onCreate(), [onCreate]);

  // Как в TextModal: Esc закрывает модалку откуда угодно; сочетания App под модалкой заблокированы.
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
        className="text-modal-box"
        data-testid="svg-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="svg-modal-title"
      >
        <div className="text-modal-title" id="svg-modal-title">
          <SvgIcon size={32} /> {t("svgModal.title")}
        </div>
        <div className="text-modal-row" data-testid="svg-file-name">
          {t("svgModal.file")}: {fileName}
        </div>
        <div className="text-modal-row">
          <label className="text-modal-label">
            {t("svgModal.depth")}
            <input
              type="number"
              value={depth}
              min={0.1}
              max={1000}
              className="text-modal-num"
              data-testid="svg-depth"
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!isNaN(v)) onDepthChange(v);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
            {t("units.mm")}
          </label>
          <label className="text-modal-label">
            {t("svgModal.scale")}
            <input
              type="number"
              value={scale}
              min={0.001}
              max={1000}
              className="text-modal-num"
              data-testid="svg-scale"
              onChange={(e) => {
                const v = Number(e.target.value);
                if (!isNaN(v)) onScaleChange(v);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleCreate();
              }}
            />
          </label>
        </div>
        <div className="text-modal-actions">
          <button
            className="btn primary flex-1"
            data-testid="svg-create"
            disabled={busy || !workerOk || !(depth > 0) || !(scale > 0)}
            onClick={handleCreate}
          >
            <PlusIcon size={32} /> {t("svgModal.create")}
          </button>
          <button className="btn" onClick={onClose}>
            {t("actions.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
