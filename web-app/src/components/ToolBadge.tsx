// src/components/ToolBadge.tsx — Бейдж на кнопку тулбара (замок/реклама/токены)
import type { LockBadgeKind } from '../store/lock-config'
import { LockIcon, AdFilmIcon, TokenIcon } from './icons'

const BADGE_ICON: Record<LockBadgeKind, any> = {
  lock: LockIcon,
  ad: AdFilmIcon,
  token: TokenIcon,
}

export function ToolBadge({ kind, pos }: { kind: LockBadgeKind; pos: 'tl' | 'bl' | 'br' }) {
  const I = BADGE_ICON[kind]
  return (
    <span className={`btn-badge btn-badge--${pos} btn-badge--${kind}`}>
      <I size={14} />
    </span>
  )
}
