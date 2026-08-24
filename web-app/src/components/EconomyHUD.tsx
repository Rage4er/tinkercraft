// src/components/EconomyHUD.tsx — HUD экономики (токены + ежедневный бонус)
import { useTranslation } from 'react-i18next'
import { useEconomyStore } from '../store/economy-store'
import { ECONOMY_UI, ICON_REGISTRY } from '../store/economy-ui-config'

export default function EconomyHUD() {
  const { t } = useTranslation()
  const tokens = useEconomyStore((s) => s.tokens)
  const claimDailyBonus = useEconomyStore((s) => s.claimDailyBonus)
  const watchAdForTokens = useEconomyStore((s) => s.watchAdForTokens)
  const todayAdsWatched = useEconomyStore((s) => s.todayAdsWatched)
  const lastDailyBonus = useEconomyStore((s) => s.lastDailyBonus)

  if (!ECONOMY_UI.showTokensInStatusBar) return null

  const canClaimBonus = lastDailyBonus ? new Date(lastDailyBonus).getDate() !== new Date().getDate() : true
  const canWatchAd = todayAdsWatched < 3

  return (
    <div className="economy-hud" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px' }}>
      {/* Токены */}
      <div className="economy-tokens" style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
        {ICON_REGISTRY.token && (
          <ICON_REGISTRY.token width={16} height={16} className="economy-icon" />
        )}
        <span className="economy-value" style={{ fontWeight: 'bold', fontSize: '14px' }}>
          {tokens}
        </span>
      </div>

      {/* Ежедневный бонус с иконкой подарка */}
      {ECONOMY_UI.showDailyBonus && canClaimBonus && (
        <button
          className="btn btn-compact btn-sm economy-bonus-btn"
          onClick={claimDailyBonus}
          style={{ fontSize: '12px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          {ICON_REGISTRY.gift && (
            <ICON_REGISTRY.gift width={14} height={14} />
          )}
          +50
        </button>
      )}

      {/* Реклама за токены с иконкой рекламы */}
      {ECONOMY_UI.showAdButton && canWatchAd && (
        <button
          className="btn btn-compact btn-sm economy-ad-btn"
          onClick={watchAdForTokens}
          style={{ fontSize: '12px', padding: '4px 8px', display: 'flex', alignItems: 'center', gap: '4px' }}
        >
          {ICON_REGISTRY.ad && (
            <ICON_REGISTRY.ad width={14} height={14} />
          )}
          +50
        </button>
      )}
    </div>
  )
}
