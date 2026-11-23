import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import IconButton from "./IconButton";
import { ChamferIcon, FilletIcon } from "./icons";
import { TOOLTIP_DATA } from "../constants";

/**
 * FILLET-CHAMFER-BREP: одна кнопка в тулбаре (на 1366 в одну строку больше кнопок
 * не помещается) → меню из двух пунктов: «Скругление» и «Фаска». Пока режим активен,
 * кнопка нажата; меню — в портале, закрывается выбором, кликом мимо и Esc.
 */
export default function BrepMenuButton({
  brepActive,
  canBrep,
  onBrep,
}: {
  brepActive: "fillet" | "chamfer" | null;
  canBrep: boolean;
  onBrep: (kind: "fillet" | "chamfer") => void;
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

  const pick = (kind: "fillet" | "chamfer") => () => {
    setOpen(false);
    onBrep(kind);
  };

  return (
    <span ref={wrapRef} className="tb-menu-wrap">
      <IconButton
        icon={brepActive === "chamfer" ? <ChamferIcon size={32} /> : <FilletIcon size={32} />}
        label={t("brep.menu")}
        onClick={() => setOpen((o) => !o)}
        disabled={!canBrep && brepActive === null}
        tooltip={TOOLTIP_DATA.brep_menu}
        tooltipSuppressed={open}
        buttonVariant={brepActive !== null || open ? "active" : "default"}
        ariaHasPopup="menu"
        ariaExpanded={open}
      />
      {open && pos && createPortal(
        <div ref={menuRef} className="tb-menu" role="menu" aria-label={t("brep.menu")} style={{ left: pos.left, top: pos.top }} data-testid="brep-menu">
          <button type="button" role="menuitem" className="tb-menu-item" data-testid="brep-menu-fillet" title={t("tooltips.filletBrep")} onClick={pick("fillet")}>
            <span className="tb-menu-check">{brepActive === "fillet" ? "✓" : ""}</span>
            <span className="tb-menu-icon"><FilletIcon size={28} /></span>
            <span className="tb-menu-label">{t("brep.fillet")}</span>
          </button>
          <button type="button" role="menuitem" className="tb-menu-item" data-testid="brep-menu-chamfer" title={t("tooltips.chamferBrep")} onClick={pick("chamfer")}>
            <span className="tb-menu-check">{brepActive === "chamfer" ? "✓" : ""}</span>
            <span className="tb-menu-icon"><ChamferIcon size={28} /></span>
            <span className="tb-menu-label">{t("brep.chamfer")}</span>
          </button>
        </div>,
        document.body,
      )}
    </span>
  );
}
