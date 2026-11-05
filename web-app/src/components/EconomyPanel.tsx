// src/components/EconomyPanel.tsx — Панель экономики (yandex-only, §6.2 ECONOMY.md v2.0)
// Y.1: вынесено из PropertiesPanel.tsx, чтобы merge main → yandex-games не
// конфликтовал в общем файле. Без пропсов: всё состояние — в economy-store.
import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { TokenIcon, GiftIcon, AdFilmIcon, CrownIcon, ClockIcon, TextIcon, ColorIcon } from "./icons";
import { useEconomyStore, type RentalKey } from "../store/economy-store";
import { ECONOMY_UI, DIFFICULTY_ICON, ICON_REGISTRY } from "../store/economy-ui-config";
import Tooltip from "./Tooltip";
import EconomyMiniHUD from "./EconomyMiniHUD";
import { useUiStore } from "../store/ui-store";
import { isEconomyAvailable } from "../platform";
import { getCachedServerTime } from "../platform/server-time";
import { useAdCooldown, useDailyReset } from "../platform/ad-timers";
import { adShowsLimit } from "../store/economy-config";

// P1-8: единый источник «сейчас» — серверное время (§5 ECONOMY.md).
// Форматтеры оставшегося времени аренды/подписки используют кэш серверного
// времени (30с), а не локальный Date.now() — синхронно с кулдаунами бонуса/рекламы.
// U2: кулдауны рекламы считаются через useAdCooldown() (посекундный тик,
// привязка к серверному моменту через смещение serverTime − localTime).
function serverNow(): number {
  return getCachedServerTime() ?? Date.now() // fallback до первого ответа сервера
}

/** Форматировать оставшееся время аренды (ч м) */
function formatRentalRemaining(expiresAt: number, t: TFunction): string {
  const remaining = expiresAt - serverNow()
  if (remaining <= 0) return t('economy.status.expired')
  const hours = Math.floor(remaining / (1000 * 60 * 60))
  const mins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60))
  return t('economy.time.hoursMins', { h: hours, m: mins })
}

/** Форматировать оставшееся время подписки (дн ч) */
function formatSubRemaining(expiresAt: number, t: TFunction): string {
  const remaining = expiresAt - serverNow()
  if (remaining <= 0) return t('economy.status.expired')
  const days = Math.floor(remaining / (1000 * 60 * 60 * 24))
  const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  return t('economy.time.daysHours', { d: days, h: hours })
}

/** Проверить, прошёл ли день (§5 серверное время) */
async function checkBonusAvailable(lastDailyBonus: number | null): Promise<boolean> {
  if (!lastDailyBonus) return true
  const { isDayPassed } = await import('../store/economy-config')
  return await isDayPassed(lastDailyBonus)
}

// ─── Экономика: панель (yandex-only, §6.2 ECONOMY.md v2.0) ──────────

export default function EconomyPanel() {
  const { t } = useTranslation()
  const tokens = useEconomyStore((s) => s.tokens)
  const claimDailyBonus = useEconomyStore((s) => s.claimDailyBonus)
  const watchAdForTokens = useEconomyStore((s) => s.watchAdForTokens)
  const watchAdForBanner = useEconomyStore((s) => s.watchAdForBanner)
  // U1/U9: счётчик вида `tokens` для кнопки рекламы за токены
  const tokensAdCount = useEconomyStore((s) => s.adRewards.tokens?.countToday ?? 0)
  const lastDailyBonus = useEconomyStore((s) => s.lastDailyBonus)
  const todayQuests = useEconomyStore((s) => s.todayQuests)
  const todayQuestsCompleted = useEconomyStore((s) => s.todayQuestsCompleted)
  const rentals = useEconomyStore((s) => s.rentals)
  const activeSubscription = useEconomyStore((s) => s.activeSubscription)
  const subscriptionExpiresAt = useEconomyStore((s) => s.subscriptionExpiresAt)
  const buyRental = useEconomyStore((s) => s.buyRental)
  const buySubscription = useEconomyStore((s) => s.buySubscription)
  const setBannerVisible = useEconomyStore((s) => s.setBannerVisible)
  const hasActiveSub = useEconomyStore((s) => s.hasActiveSubscriptionRO())
  const hasRental = useEconomyStore((s) => s.hasRentalRO)

  const [busy, setBusy] = useState<string | null>(null)
  const [canClaimBonus, setCanClaimBonus] = useState(true)

  // U2: живой посекундный отсчёт кулдауна рекламы (вид `tokens`).
  // Значение пересчитывается раз в секунду по локальным часам с поправкой
  // на серверное смещение — «м:сс» тикает, а не стоит на месте 30с.
  const { remainingMs: cooldownMs, formatted: cooldownLabel } = useAdCooldown('tokens')
  // UB3-5: живой отсчёт до сброса ежедневного бонуса (ч:мм:сс до полуночи)
  const dailyReset = useDailyReset()

  // Бонус доступен (день сменился по серверной дате)
  useEffect(() => {
    const update = async () => {
      const bonus = await checkBonusAvailable(lastDailyBonus)
      setCanClaimBonus(bonus)
    }
    void update()
    const iv = setInterval(() => {
      void update()
    }, 60_000)
    return () => clearInterval(iv)
  }, [lastDailyBonus])

  // U1/U9: лимит/кулдаун вида `tokens` (свой у каждого вида награды).
  // UB3-1: лимит берём из конфига показов вида, а не хардкод 3.
  const canWatchAd = tokensAdCount < adShowsLimit('tokens') && cooldownMs === 0

  const handleBuyRental = async (key: RentalKey) => {
    if (busy) return
    setBusy(key)
    const result = await buyRental(key)
    setBusy(null)
    if (result.ok && key === 'disableBanner') setBannerVisible(false)
  }

  const handleWatchAdForBanner = async () => {
    if (busy) return
    setBusy('bannerAd')
    const result = await watchAdForBanner()
    setBusy(null)
    if (result.ok) setBannerVisible(false)
  }

  const handleBuySub = async (type: 'weekly' | 'monthly') => {
    if (busy) return
    setBusy(type)
    const result = await buySubscription(type)
    setBusy(null)
    if (result.ok) setBannerVisible(false)
  }

  // EC-R2: busy-guard для бонуса и рекламы — двойной клик по кнопке не должен
  // запускать вторую параллельную операцию (store дополнительно защищён
  // in-flight guard'ом, здесь — UX-уровень: кнопка дизейблится сразу).
  const handleClaimBonus = async () => {
    if (busy) return
    setBusy('dailyBonus')
    await claimDailyBonus()
    setBusy(null)
  }

  const handleWatchAdTokens = async () => {
    if (busy) return
    setBusy('adTokens')
    await watchAdForTokens()
    setBusy(null)
  }

  // Утилиты для рендера иконок
  const renderIcon = (key: string, w = 14, h = 14) => {
    const Icon = ICON_REGISTRY[key]
    return Icon ? <Icon width={w} height={h} /> : null
  }

  const getTriggerLabel = (trigger: string, target: number) =>
    t(`economy.triggers.${trigger}`, { n: target })

  // ── Токены и бонусы ──
  // UB2-5: расширенные тултипы (label мгновенно, описание через 1.5с)
  // UB3-2: иконки экономических секций увеличены ×2 (см. ECONOMY.md §6.4 —
  // зафиксированная таблица размеров: баланс 40, кнопки бонуса/рекламы 36,
  // статусы/квесты 28, заголовки и строки аренды 32, иконки в кнопках 20).
  const tokensSection = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
      <Tooltip
        tooltip={{ labelKey: 'economy.tokensLabel', descriptionKey: 'economy.tooltip.tokensDesc' }}
        position="bottom"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {renderIcon('token', 40, 40)}
          <span style={{ fontWeight: 'bold', fontSize: '16px' }}>{tokens}</span>
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('economy.tokensLabel')}</span>
        </div>
      </Tooltip>
    </div>
  )

  const bonusSection = (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {ECONOMY_UI.showDailyBonus && (
        canClaimBonus ? (
          <Tooltip
            tooltip={{ labelKey: 'economy.tooltip.bonusTitle', descriptionKey: 'economy.tooltip.bonusDesc' }}
            position="bottom"
          >
            <button className="btn btn-compact btn-sm" onClick={handleClaimBonus} disabled={!!busy}>
              {renderIcon('gift', 36, 36)} {t('economy.bonusLabel')}
            </button>
          </Tooltip>
        ) : (
          // UB3-5: вместо «уже получено» — подарок + тикающий остаток до
          // полуночи (сброс бонуса), как откат у рекламы. Тултип тот же.
          <Tooltip
            tooltip={{ labelKey: 'economy.tooltip.bonusTitle', descriptionKey: 'economy.tooltip.bonusDesc' }}
            position="bottom"
          >
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <GiftIcon width={28} height={28} /> {dailyReset.formatted ?? t('economy.bonusClaimed')}
            </span>
          </Tooltip>
        )
      )}
      {ECONOMY_UI.showAdButton && (
        canWatchAd ? (
          <Tooltip
            tooltip={{ labelKey: 'economy.tooltip.adTitle', descriptionKey: 'economy.tooltip.adDesc' }}
            position="bottom"
          >
            <button className="btn btn-compact btn-sm" onClick={handleWatchAdTokens} disabled={!!busy}>
              {renderIcon('ad', 36, 36)} {t('economy.adLabel')}
            </button>
          </Tooltip>
        ) : cooldownMs > 0 ? (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ClockIcon width={28} height={28} /> {cooldownLabel}
          </span>
        ) : (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t('economy.adLimitReached')}</span>
        )
      )}
    </div>
  )

  // ── Квесты ──
  const questsSection = todayQuests.length > 0 && ECONOMY_UI.showQuests ? (() => {
    const completedCount = todayQuestsCompleted.length
    return (
      <div>
        {/* UB2-5: расширенный тултип на заголовке квестов */}
        <Tooltip
          tooltip={{ labelKey: 'economy.quests', descriptionKey: 'economy.tooltip.questsDesc' }}
          position="bottom"
        >
          <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: 'var(--text-muted)' }}>
            {t('economy.quests')} · {completedCount}/{todayQuests.length}
          </div>
        </Tooltip>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {todayQuests.map((quest, idx) => {
            const isCompleted = todayQuestsCompleted.includes(quest.difficulty)
            // P2-5: событийные квесты (export_stl/import_stl и др.) не обновляют
            // progress в evaluateQuests — их прогресс скачет из completeEventQuest,
            // который ставит progress = target. Для надёжности UI показывает
            // полный прогресс (target/target), если квест завершён.
            const displayProgress = isCompleted
              ? quest.target
              : Math.min(quest.progress, quest.target)
            const progress = Math.min(displayProgress / quest.target, 1)
            const iconKey = DIFFICULTY_ICON[quest.difficulty]
            const IconComp = ICON_REGISTRY[iconKey]
            return (
              <div key={idx} style={{
                padding: '6px 8px', borderRadius: '4px',
                background: isCompleted ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                border: `1px solid ${isCompleted ? 'var(--border-success)' : 'var(--border)'}`,
                opacity: isCompleted ? 0.6 : 1,
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                  <span style={{ fontSize: '11px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    {IconComp && <IconComp width={28} height={28} />}
                    {quest.difficulty === 'easy' ? t('economy.difficulty.easy') :
                      quest.difficulty === 'medium' ? t('economy.difficulty.medium') :
                        t('economy.difficulty.hard')}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{displayProgress}/{quest.target}</span>
                </div>
                <div style={{ fontSize: '11px' }}>{getTriggerLabel(quest.trigger, quest.target)}</div>
                <div style={{ height: '3px', borderRadius: '2px', background: 'var(--bg-secondary)', overflow: 'hidden', marginTop: '3px' }}>
                  <div style={{ height: '100%', width: `${progress * 100}%`, background: isCompleted ? 'var(--success)' : 'var(--primary)', borderRadius: '2px', transition: 'width 0.3s ease' }} />
                </div>
                <div style={{ fontSize: '10px', marginTop: '2px', color: 'var(--text-muted)' }}>
                  +{quest.reward}
                </div>
              </div>
            )
          })}
        </div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '4px' }}>
          {t('economy.tooltip.quests')}
        </div>
      </div>
    )
  })() : null

  // ── Аренда и подписки ──
  // FIX (UB-4): `adReward` — для отключения баннера аренда оплачивается и
  // токенами, и 1 просмотром рекламы. Кнопки живут ТОЛЬКО здесь (в разделе
  // «Аренда»): раньше была дублирующая секция «Скрытие баннера» ниже по
  // панели плюс баннер-виджет над тулбаром.
  const rentalsConfig = [
    { key: 'text3d' as const, cost: 75, icon: <TextIcon width={32} height={32} />, label: t('economy.rentals.text3d.label'), desc: t('economy.rentals.text3d.desc'), adReward: false },
    { key: 'extendedPalette' as const, cost: 75, icon: <ColorIcon width={32} height={32} />, label: t('economy.rentals.extendedPalette.label'), desc: t('economy.rentals.extendedPalette.desc'), adReward: false },
    { key: 'disableBanner' as const, cost: 50, icon: <AdFilmIcon width={32} height={32} />, label: t('economy.rentals.disableBanner.label'), desc: t('economy.rentals.disableBanner.desc'), adReward: true },
  ]

  const subsConfig = [
    { key: 'weekly' as const, label: t('economy.subscriptions.weekly'), cost: 700, days: 7, perDay: t('economy.subscriptions.perDay7') },
    { key: 'monthly' as const, label: t('economy.subscriptions.monthly'), cost: 2000, days: 30, perDay: t('economy.subscriptions.perDay30') },
  ]

  const rentalsSection = (
    <div>
      {/* UB2-5: расширенный тултип на заголовке аренды */}
      <Tooltip
        tooltip={{ labelKey: 'economy.rentals.title', descriptionKey: 'economy.tooltip.rentalsDesc' }}
        position="bottom"
      >
        <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: 'var(--text-muted)' }}>
          <ClockIcon width={32} height={32} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }} />
          {t('economy.rentals.title')}
        </div>
      </Tooltip>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {rentalsConfig.map((r) => {
          const isActive = hasRental(r.key)
          const rentalExpires = rentals[r.key]
          const remaining = rentalExpires !== null ? formatRentalRemaining(rentalExpires, t) : null
          return (
            <div key={r.key} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 8px', borderRadius: '4px',
              background: isActive ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
              border: `1px solid ${isActive ? 'var(--border-success)' : 'var(--border)'}`,
              opacity: isActive ? 0.7 : 1,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <div style={{ color: 'var(--text-primary)' }}>{r.icon}</div>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 'bold' }}>{r.label}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {r.desc}{remaining && ` · ${remaining}`}
                  </div>
                </div>
              </div>
              {isActive ? (
                <span style={{ fontSize: '10px', color: 'var(--success)' }}>
                  {r.key === 'disableBanner' && remaining
                    ? t('economy.status.bannerHidden', { remaining })
                    : t('economy.status.active')}
                </span>
              ) : hasActiveSub ? (
                // UB5-1: функция уже входит в Pro-подписку (ECONOMY.md §3.3) —
                // кнопки покупки скрыты; buyRental на всякий случай отсекает
                // списание на уровне store (code 'included_in_subscription').
                <span style={{ fontSize: '10px', color: 'var(--success)', whiteSpace: 'nowrap' }}>
                  {t('economy.status.includedInPro')}
                </span>
              ) : (
                // UB3-2: кнопки «токены» и «ревард» — друг над другом
                // (flexDirection: column): в панели 200px две кнопки в строку
                // не влезали и обрезались.
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', alignItems: 'stretch' }}>
                  <button
                    className="btn btn-compact btn-sm"
                    disabled={tokens < r.cost || busy === r.key}
                    onClick={() => handleBuyRental(r.key)}
                    title={t('economy.rentals.title')}
                    style={{
                      fontSize: '10px', padding: '2px 6px',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
                    }}
                  >
                    {/* UB2-3b: бейдж убран — он перекрывал маленькую кнопку,
                        а цена и так видна рядом (иконка + число). */}
                    <TokenIcon width={20} height={20} /> {r.cost}
                  </button>
                  {/* FIX (UB-4): единственный способ «рекламой» для скрытия баннера */}
                  {r.adReward && (
                    <button
                      className="btn btn-compact btn-sm"
                      disabled={!!busy}
                      onClick={handleWatchAdForBanner}
                      title={t('economy.tooltip.bannerOff')}
                      style={{
                        fontSize: '10px', padding: '2px 6px',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '3px',
                      }}
                    >
                      {/* UB2-3b: то же — без бейджа, цена видна инлайн */}
                      <AdFilmIcon width={20} height={20} /> 1
                    </button>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Подписки */}
      <div style={{ marginTop: '8px' }}>
        {/* UB2-5: расширенный тултип на заголовке подписки */}
        <Tooltip
          tooltip={{ labelKey: 'economy.subscription', descriptionKey: 'economy.tooltip.subsDesc' }}
          position="bottom"
        >
          <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: 'var(--text-muted)' }}>
            <CrownIcon width={32} height={32} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }} />
            {t('economy.subscription')}
          </div>
        </Tooltip>
        {hasActiveSub && subscriptionExpiresAt ? (
          <div style={{
            padding: '4px 8px', borderRadius: '4px', background: 'var(--bg-secondary)',
            border: '1px solid var(--border-success)', fontSize: '11px', color: 'var(--success)'
          }}>
            {t('economy.status.proActive')}{formatSubRemaining(subscriptionExpiresAt, t)}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '4px' }}>
            {subsConfig.map((s) => (
              <button
                key={s.key}
                className="btn btn-compact btn-sm"
                disabled={tokens < s.cost || busy === s.key}
                onClick={() => handleBuySub(s.key)}
                title={t('economy.tooltip.subsDesc')}
                style={{
                  fontSize: '10px', padding: '2px 6px',
                  display: 'flex', alignItems: 'center', gap: '3px',
                }}
              >
                {/* UB2-3b: бейдж убран (дублировал инлайн-цену и перекрывал кнопку) */}
                <TokenIcon width={20} height={20} /> {s.cost}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  // FIX (UB-4): отдельная секция «Скрытие баннера» (2 место §6.3) УДАЛЕНА —
  // её кнопки дублировали строку «Отключение баннера» в разделе «Аренда»
  // выше. Ревард-кнопка (1 просмотр) переехала в ту строку.

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {/* Токены */}
      <div className="csg-group">
        <div className="csg-group-title">{t('economy.tokensLabel')}</div>
        {tokensSection}
        {bonusSection}
      </div>

      {/* Квесты */}
      {questsSection && <div className="csg-group">{questsSection}</div>}

      {/* Аренда + подписки (включая «Отключение баннера»: токены + 1 просмотр) */}
      <div className="csg-group">{rentalsSection}</div>
    </div>
  )
}

// ─── Режим экономики в правой панели (при выделенном объекте) ────────

/** B3: выходим из режима экономики только когда ИЗМЕНИЛСЯ выбранный объект
 *  (клик в списке объектов/вьюпорте). Клик «Расширенный выбор» не меняет
 *  selection → флаг остаётся, панель экономики показывается поверх свойств. */
export function useEconomyModeReset(firstSelectedId: string | null | undefined): void {
  const economyPanelOpen = useUiStore((s) => s.economyPanelOpen)
  const setEconomyPanelOpen = useUiStore((s) => s.setEconomyPanelOpen)
  const prevSelectedIdRef = useRef<string | null>(null)
  useEffect(() => {
    const currentId = firstSelectedId ?? null
    const prevId = prevSelectedIdRef.current
    prevSelectedIdRef.current = currentId
    if (prevId !== currentId && currentId !== null && economyPanelOpen) {
      setEconomyPanelOpen(false)
    }
  }, [firstSelectedId, economyPanelOpen, setEconomyPanelOpen])
}

/** Мини-HUD баланса (EC6) + режим экономики внутри правой панели (B2/B3,
 *  store-флаг economyPanelOpen: «купить» из LeftPanel/палитры не снимает выделение).
 *  P0-6: рендерится только при реальном Yandex SDK (не clean-фолбэк). */
export function EconomyModeSection() {
  const { t } = useTranslation()
  const economyPanelOpen = useUiStore((s) => s.economyPanelOpen)
  const setEconomyPanelOpen = useUiStore((s) => s.setEconomyPanelOpen)
  const isEconomyActive = isEconomyAvailable()
  return (
    <>
      {isEconomyActive && <EconomyMiniHUD />}
      {economyPanelOpen && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <button
            className="btn btn-compact"
            onClick={() => setEconomyPanelOpen(false)}
            style={{ alignSelf: 'flex-start', fontSize: '12px' }}
          >
            {t('properties.backToProps')}
          </button>
          {isEconomyActive && <EconomyPanel />}
        </div>
      )}
    </>
  )
}
