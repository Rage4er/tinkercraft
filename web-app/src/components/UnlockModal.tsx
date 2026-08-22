// src/components/UnlockModal.tsx — Модалка выбора оплаты разблокировки
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useGameStore } from '../store/game-store'
import { getLockConfig } from '../store/lock-config'
import { notify } from '../store/notifications'
import { LockIcon, TokenIcon, AdFilmIcon } from './icons'

export function UnlockModal({
  itemId,
  onClose,
}: {
  itemId: string | null
  onClose: () => void
}) {
  const { t } = useTranslation()
  const tokens = useGameStore((s) => s.tokens)
  const unlockWithTokens = useGameStore((s) => s.unlockWithTokens)
  const unlockWithAd = useGameStore((s) => s.unlockWithAd)
  const [busy, setBusy] = useState<'tokens' | 'ad' | null>(null)

  if (!itemId) return null

  const cfg = getLockConfig(itemId)
  if (!cfg) return null

  const handle = async (
    fn: () => Promise<{ ok: boolean; code?: string }>,
    kind: 'tokens' | 'ad'
  ) => {
    setBusy(kind)
    const res = await fn()
    setBusy(null)
    if (res.ok) {
      notify(t('unlock.success'), 'info')
      onClose()
    } else if (res.code === 'not_enough') {
      notify(t('unlock.notEnough'), 'warning')
    } else if (res.code === 'ad_skipped' || res.code === 'no_ad') {
      notify(t('unlock.adSkipped'), 'warning')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="unlock-modal" onClick={(e) => e.stopPropagation()}>
        <h3>
          <LockIcon size={24} /> {t('unlock.title')}
        </h3>

        <button
          className="unlock-btn unlock-btn--tokens"
          disabled={tokens < cfg.tokens || busy !== null}
          onClick={() => handle(() => unlockWithTokens(itemId), 'tokens')}
        >
          <TokenIcon size={20} /> {t('unlock.forTokens', { n: cfg.tokens })}
        </button>

        {cfg.ad && (
          <button
            className="unlock-btn unlock-btn--ad"
            disabled={busy !== null}
            onClick={() => handle(() => unlockWithAd(itemId), 'ad')}
          >
            <AdFilmIcon size={20} /> {t('unlock.forAd')}
          </button>
        )}

        <button
          className="unlock-btn unlock-btn--cancel"
          onClick={onClose}
          disabled={busy !== null}
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  )
}
