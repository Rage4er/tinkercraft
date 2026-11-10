import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import IconButton from "./IconButton";
import { DimensionIcon } from "./icons";
import { TOOLTIP_DATA } from "../constants";

/**
 * DIMENSIONS: одна кнопка «Размер» в тулбаре (на 1366 в одну строку больше кнопок не помещается) →
 * меню из трёх пунктов: «Поставить размер» (режим; D — сразу, без меню), «Настройки размера»
 * (окно), «Показать / скрыть размеры» (слой, галочка). Меню — в портале (у тулбара
 * `overflow: hidden`), под кнопкой; закрывается выбором пункта, кликом мимо и Esc.
 * Пока идёт режим «Размер», кнопка нажата.
 */
export default function DimensionMenuButton({
  dimensionActive,
  dimensionsVisible,
  onDimensionMode,
  onDimensionSettings,
  onToggleDimensions,
}: {
  dimensionActive: boolean;
  dimensionsVisible: boolean;
  onDimensionMode: () => void;
  onDimensionSettings: () => void;
  onToggleDimensions: () => void;
}) {
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

  const pick = (action: () => void) => () => {
    setOpen(false);
    action();
  };

  return (
    <span ref={wrapRef} className="tb-menu-wrap">
      <IconButton
        icon={<DimensionIcon size={32} />}
        label={t("dimensions.button")}
        onClick={() => setOpen((o) => !o)}
        tooltip={TOOLTIP_DATA.dimension}
        tooltipSuppressed={open}
        buttonVariant={dimensionActive || open ? "active" : "default"}
        ariaHasPopup="menu"
        ariaExpanded={open}
      />
      {open && pos && createPortal(
        <div ref={menuRef} className="tb-menu" role="menu" aria-label={t("dimensions.button")} style={{ left: pos.left, top: pos.top }} data-testid="dimension-menu">
          <button type="button" role="menuitemcheckbox" aria-checked={dimensionActive} className="tb-menu-item" data-testid="dimension-menu-place" onClick={pick(onDimensionMode)}>
            <span className="tb-menu-check">{dimensionActive ? "✓" : ""}</span>
            <span className="tb-menu-label">{t("dimensions.place")}</span>
            <kbd className="tb-menu-kbd">D</kbd>
          </button>
          <button type="button" role="menuitem" className="tb-menu-item" data-testid="dimension-menu-settings" title={t("tooltips.dimensionSettings")} onClick={pick(onDimensionSettings)}>
            <span className="tb-menu-check" />
            <span className="tb-menu-label">{t("dimensions.settings")}</span>
          </button>
          <button type="button" role="menuitemcheckbox" aria-checked={dimensionsVisible} className="tb-menu-item" data-testid="dimension-menu-toggle" title={t("tooltips.dimensionsToggle")} onClick={pick(onToggleDimensions)}>
            <span className="tb-menu-check">{dimensionsVisible ? "✓" : ""}</span>
            <span className="tb-menu-label">{t("dimensions.toggle")}</span>
          </button>
        </div>,
        document.body,
      )}
    </span>
  );
}
