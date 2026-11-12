import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import IconButton from "./IconButton";
import { ExportIcon } from "./icons";
import { TOOLTIP_DATA } from "../constants";
import { EXPORT_FORMATS, type ExportFormat } from "../io/mesh-formats";

/**
 * FORMATS-OBJ-3MF-GLTF: кнопка «Экспорт» в тулбаре → меню форматов: STL, OBJ, 3MF, glTF.
 * Как меню «Размер»: в портале под кнопкой, закрывается выбором, кликом мимо и Esc.
 */
export default function ExportMenuButton({ disabled, onExport }: { disabled: boolean; onExport: (format: ExportFormat) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (!open || !wrapRef.current) return;
    const r = wrapRef.current.getBoundingClientRect();
    setPos({ left: Math.max(4, Math.min(r.left, window.innerWidth - 240)), top: r.bottom + 4 });
  }, [open]);

  useEffect(() => { if (disabled) setOpen(false); }, [disabled]);
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (menuRef.current?.contains(target) || wrapRef.current?.contains(target)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      e.stopImmediatePropagation();
      setOpen(false);
    };
    document.addEventListener("mousedown", onDown, true);
    window.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("mousedown", onDown, true);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [open]);

  return (
    <span ref={wrapRef} className="tb-menu-wrap">
      <IconButton
        icon={<ExportIcon size={32} />}
        label={t("export.menuLabel")}
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        tooltip={TOOLTIP_DATA.export_stl}
        tooltipSuppressed={open}
        buttonVariant={open ? "active" : "default"}
        ariaHasPopup="menu"
        ariaExpanded={open}
      />
      {open && pos && createPortal(
        <div ref={menuRef} className="tb-menu" role="menu" aria-label={t("actions.export")} style={{ left: pos.left, top: pos.top }} data-testid="export-menu">
          {EXPORT_FORMATS.map((f) => (
            <button key={f} type="button" role="menuitem" className="tb-menu-item" data-testid={`export-menu-${f}`} title={t(`export.formatTip.${f}`)}
              onClick={() => { setOpen(false); onExport(f); }}>
              <span className="tb-menu-check" />
              <span className="tb-menu-label">{t(`export.format.${f}`)}</span>
            </button>
          ))}
        </div>,
        document.body,
      )}
    </span>
  );
}
