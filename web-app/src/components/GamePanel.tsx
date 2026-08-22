// src/components/GamePanel.tsx — Игровая панель (только для Yandex-версии)
// Монтируется в PropertiesPanel, когда ничего не выбрано.
// Вся игровая логика: токены, бонусы, реклама за токены, экспорт STL.
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useGameStore } from "../store/game-store";
import { useDocumentStore } from "../store/document-store";
import { notify } from "../store/notifications";
import { TokenIcon, GiftIcon, AdIcon, ExportIcon, FolderIcon, PlayIcon } from "./icons";

interface GamePanelProps {
  onShowProjects: () => void;
}

export default function GamePanel({ onShowProjects }: GamePanelProps) {
  const { t } = useTranslation();
  const {
    tokens,
    lastDailyBonus,
    claimDailyBonus,
    claimDailyBonusWithAd,
    watchAdForTokens,
    spendTokens,
  } = useGameStore();

  const exportStl = useDocumentStore((s) => s.exportStl);
  const objectCount = useDocumentStore((s) => Object.keys(s.objects).length);

  const [busy, setBusy] = useState(false);

  const canClaimDaily =
    !lastDailyBonus || Date.now() - lastDailyBonus > 24 * 60 * 60 * 1000;
  const hasObjects = objectCount > 0;

  // ✅ Порядок: валидация → списание → экспорт (REVIEW-6)
  const handleExportStl = () => {
    if (!hasObjects) {
      notify(t("game.emptyScene"), "warning");
      return;
    }
    const ok = spendTokens(5, "export_stl");
    if (!ok) {
      notify(t("game.notEnoughTokens"), "error");
      return;
    }
    exportStl();
    notify(t("game.exported"), "info");
  };

  // Экспорт бесплатно за рекламу
  const handleExportWithAd = async () => {
    if (!hasObjects) {
      notify(t("game.emptyScene"), "warning");
      return;
    }
    setBusy(true);
    try {
      const watched = await watchAdForTokens();
      if (watched) {
        exportStl();
        notify(t("game.exportedFree"), "info");
      } else {
        notify(t("game.adNotShown"), "warning");
      }
    } finally {
      setBusy(false);
    }
  };

  // Ежедневный бонус (+5)
  const handleDailyBonus = async () => {
    setBusy(true);
    try {
      const ok = await claimDailyBonus();
      if (ok) notify(t("game.bonusClaimed", { amount: 5 }), "info");
      else notify(t("game.bonusNotReady"), "warning");
    } finally {
      setBusy(false);
    }
  };

  // Ежедневный бонус с рекламой (+20, 1 раз/день)
  const handleDailyBonusWithAd = async () => {
    if (!canClaimDaily) {
      notify(t("game.bonusNotReady"), "warning");
      return;
    }
    setBusy(true);
    try {
      const ok = await claimDailyBonusWithAd();
      if (ok) notify(t("game.dailyClaimed", { amount: 20 }), "info");
      else notify(t("game.adNotReady"), "warning");
    } finally {
      setBusy(false);
    }
  };

  // Реклама за токены (+10, безлимитно)
  const handleWatchAd = async () => {
    setBusy(true);
    try {
      const ok = await watchAdForTokens();
      if (ok) notify(t("game.adTokens", { amount: 10 }), "info");
      else notify(t("game.adNotReady"), "warning");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="game-panel">
      {/* Баланс токенов */}
      <div className="game-balance">
        <TokenIcon size={18} />
        <span className="game-balance-value">{tokens}</span>
      </div>

      {/* Ежедневный бонус */}
      <div className="game-section-title">{t("game.dailyBonus")}</div>
      <div className="game-actions">
        <button
          className="btn btn-full"
          disabled={busy || !canClaimDaily}
          onClick={handleDailyBonus}
        >
          <GiftIcon size={32} /> {t("game.claimFree")} (+5)
        </button>
        <button
          className="btn btn-full"
          disabled={busy || !canClaimDaily}
          onClick={handleDailyBonusWithAd}
        >
          <AdIcon size={32} /> {t("game.claimWithAd")} (+20)
        </button>
        {!canClaimDaily && (
          <div className="game-hint">{t("game.dailyDone")}</div>
        )}
      </div>

      {/* Реклама за токены */}
      <button
        className="btn btn-full"
        disabled={busy}
        onClick={handleWatchAd}
      >
        <PlayIcon size={32} /> {t("game.watchAd")} (+10)
      </button>

      <hr className="game-hr" />

      {/* Экспорт STL */}
      <div className="game-section-title">{t("game.exportTitle")}</div>
      <button
        className="btn btn-full"
        disabled={!hasObjects}
        onClick={handleExportStl}
      >
        <ExportIcon size={32} /> {t("game.exportStl")} ({t("game.cost", { amount: 5 })})
      </button>
      <button
        className="btn btn-full"
        disabled={busy || !hasObjects}
        onClick={handleExportWithAd}
      >
        <AdIcon size={32} /> {t("game.exportStlFree")}
      </button>
      {!hasObjects && <div className="game-hint">{t("game.addShapes")}</div>}

      <hr className="game-hr" />

      {/* Проекты — открывает модалку */}
      <button className="btn btn-full" onClick={onShowProjects}>
        <FolderIcon size={32} /> {t("game.projects")}
      </button>
    </div>
  );
}
