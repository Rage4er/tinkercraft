// src/components/GameUI.tsx — Баланс токенов и ежедневный бонус
import { useState } from "react"
import { useTranslation } from "react-i18next"
import { useGameStore } from "../store/game-store"

export default function GameUI() {
  const { t } = useTranslation()
  const {
    tokens,
    lastDailyBonus,
    claimDailyBonus,
    claimDailyBonusWithAd,
    syncToCloud,
  } = useGameStore()

  const [showBonus, setShowBonus] = useState(false)
  const [claiming, setClaiming] = useState(false)

  // Прошло больше 24 часов с последнего бонуса?
  const canClaimDaily =
    !lastDailyBonus || Date.now() - lastDailyBonus > 24 * 60 * 60 * 1000

  const handleClaim = async (withAd: boolean) => {
    if (claiming) return
    setClaiming(true)

    try {
      if (withAd) {
        await claimDailyBonusWithAd()
      } else {
        await claimDailyBonus()
      }
      // Синхронизируем с облаком
      await syncToCloud()
      setShowBonus(false)
    } finally {
      setClaiming(false)
    }
  }

  return (
    <>
      {/* Баланс токенов — всегда виден */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          padding: "6px 12px",
          background: "rgba(74, 158, 255, 0.15)",
          borderRadius: "8px",
          fontSize: "14px",
          fontWeight: 600,
          color: "#4a9eff",
          cursor: "default",
          userSelect: "none",
        }}
        title={t("gameUI.tokensTitle")}
      >
        💎 {tokens}
      </div>

      {/* Кнопка ежедневного бонуса */}
      {canClaimDaily && !showBonus && (
        <button
          onClick={() => setShowBonus(true)}
          style={{
            padding: "6px 14px",
            background: "linear-gradient(135deg, #6c5ce7, #4a9eff)",
            color: "#fff",
            border: "none",
            borderRadius: "8px",
            fontSize: "13px",
            fontWeight: 600,
            cursor: "pointer",
            boxShadow: "0 2px 8px rgba(74, 158, 255, 0.3)",
            transition: "transform 0.1s",
          }}
          onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.05)")}
          onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
        >
          🎁 {t("gameUI.dailyBonus")}
        </button>
      )}

      {/* Модалка ежедневного бонуса */}
      {showBonus && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: "rgba(0, 0, 0, 0.6)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 10000,
          }}
          onClick={() => setShowBonus(false)}
        >
          <div
            style={{
              background: "#1a1a2e",
              border: "1px solid #2a2a4a",
              borderRadius: "16px",
              padding: "28px 32px",
              maxWidth: "380px",
              width: "90%",
              textAlign: "center",
              boxShadow: "0 16px 48px rgba(0, 0, 0, 0.5)",
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3
              style={{
                fontSize: "20px",
                fontWeight: 600,
                color: "#f0f0f0",
                marginBottom: "8px",
              }}
            >
              🎁 {t("gameUI.dailyBonus")}
            </h3>
            <p style={{ color: "#8888aa", fontSize: "14px", marginBottom: "20px" }}>
              {t("gameUI.dailyBonusDesc")}
            </p>

            {/* Кнопка бесплатного бонуса */}
            <button
              onClick={() => handleClaim(false)}
              disabled={claiming}
              style={{
                display: "block",
                width: "100%",
                padding: "10px",
                background: "transparent",
                border: "2px solid #4a9eff",
                borderRadius: "10px",
                color: "#4a9eff",
                fontSize: "14px",
                fontWeight: 600,
                cursor: claiming ? "not-allowed" : "pointer",
                marginBottom: "10px",
              }}
            >
              ✅ {t("gameUI.claimFree")} (+5 💎)
            </button>

            {/* Кнопка бонуса с рекламой */}
            <button
              onClick={() => handleClaim(true)}
              disabled={claiming}
              style={{
                display: "block",
                width: "100%",
                padding: "10px",
                background: "linear-gradient(135deg, #6c5ce7, #4a9eff)",
                border: "none",
                borderRadius: "10px",
                color: "#fff",
                fontSize: "14px",
                fontWeight: 600,
                cursor: claiming ? "not-allowed" : "pointer",
                boxShadow: "0 2px 12px rgba(74, 158, 255, 0.3)",
              }}
            >
              📺 {t("gameUI.claimWithAd")} (+20 💎)
            </button>

            {/* Кнопка "Позже" */}
            <button
              onClick={() => setShowBonus(false)}
              style={{
                display: "block",
                width: "100%",
                padding: "8px",
                background: "transparent",
                border: "none",
                color: "#555577",
                fontSize: "13px",
                cursor: "pointer",
                marginTop: "4px",
              }}
            >
              {t("gameUI.later")}
            </button>
          </div>
        </div>
      )}
    </>
  )
}
