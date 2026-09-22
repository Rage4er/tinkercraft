import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import NumInput from "./NumInput";
import AlignButtons from "./AlignButtons";
import CsgButtons from "./CsgButtons";
import ColorPalette from "./ColorPalette";
import EconomyMiniHUD from "./EconomyMiniHUD";
import type { ShapeParams, SceneObject } from "../csg/types";
import { EyeIcon, EyeOffIcon, FilletIcon, FolderIcon, SaveIcon, TokenIcon, GiftIcon, AdFilmIcon, CrownIcon, ClockIcon, SparkIcon, StarIcon, TrophyIcon, TextIcon, ColorIcon } from "./icons";
import { useEconomyStore, type QuestDifficulty, type RentalKey } from "../store/economy-store";
import { useUiStore } from "../store/ui-store";
import { isEconomyAvailable } from "../platform";
import { ECONOMY_UI, DIFFICULTY_ICON, ICON_REGISTRY } from "../store/economy-ui-config";
import Badge from "./Badge";
import Tooltip from "./Tooltip";
import { getCachedServerTime } from "../platform/server-time";
import { useAdCooldown } from "../platform/ad-timers";

// P1-8: единый источник «сейчас» — серверное время (§5 ECONOMY.md).
// Форматтеры оставшегося времени аренды/подписки используют кэш серверного
// времени (30с), а не локальный Date.now() — синхронно с кулдаунами бонуса/рекламы.
// U2: кулдауны рекламы считаются через useAdCooldown() (посекундный тик,
// привязка к серверному моменту через смещение serverTime − localTime).
function serverNow(): number {
  return getCachedServerTime() ?? Date.now() // fallback до первого ответа сервера
}

/** Форматировать оставшееся время аренды (ч м) */
function formatRentalRemaining(expiresAt: number, t: any): string {
  const remaining = expiresAt - serverNow()
  if (remaining <= 0) return t('economy.status.expired')
  const hours = Math.floor(remaining / (1000 * 60 * 60))
  const mins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60))
  return t('economy.time.hoursMins', { h: hours, m: mins })
}

/** Форматировать оставшееся время подписки (дн ч) */
function formatSubRemaining(expiresAt: number, t: any): string {
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

function EconomyPanel() {
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

  // U1/U9: лимит/кулдаун вида `tokens` (свой у каждого вида награды)
  const canWatchAd = tokensAdCount < 3 && cooldownMs === 0

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
  const tokensSection = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
      <Tooltip
        tooltip={{ labelKey: 'economy.tokensLabel', descriptionKey: 'economy.tooltip.tokensDesc' }}
        position="bottom"
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          {renderIcon('token', 20, 20)}
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
              {renderIcon('gift', 18, 18)} {t('economy.bonusLabel')}
            </button>
          </Tooltip>
        ) : (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ClockIcon width={14} height={14} /> {t('economy.bonusClaimed')}
          </span>
        )
      )}
      {ECONOMY_UI.showAdButton && (
        canWatchAd ? (
          <Tooltip
            tooltip={{ labelKey: 'economy.tooltip.adTitle', descriptionKey: 'economy.tooltip.adDesc' }}
            position="bottom"
          >
            <button className="btn btn-compact btn-sm" onClick={handleWatchAdTokens} disabled={!!busy}>
              {renderIcon('ad', 18, 18)} {t('economy.adLabel')}
            </button>
          </Tooltip>
        ) : cooldownMs > 0 ? (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <ClockIcon width={14} height={14} /> {cooldownLabel}
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
                    {IconComp && <IconComp width={14} height={14} />}
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
    { key: 'text3d' as const, cost: 75, icon: <TextIcon width={16} height={16} />, label: t('economy.rentals.text3d.label'), desc: t('economy.rentals.text3d.desc'), adReward: false },
    { key: 'extendedPalette' as const, cost: 75, icon: <ColorIcon width={16} height={16} />, label: t('economy.rentals.extendedPalette.label'), desc: t('economy.rentals.extendedPalette.desc'), adReward: false },
    { key: 'disableBanner' as const, cost: 50, icon: <AdFilmIcon width={16} height={16} />, label: t('economy.rentals.disableBanner.label'), desc: t('economy.rentals.disableBanner.desc'), adReward: true },
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
          <ClockIcon width={16} height={16} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }} />
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
              ) : (
                <div style={{ display: 'flex', gap: '4px' }}>
                  <button
                    className="btn btn-compact btn-sm"
                    disabled={tokens < r.cost || busy === r.key}
                    onClick={() => handleBuyRental(r.key)}
                    title={t('economy.rentals.title')}
                    style={{
                      fontSize: '10px', padding: '2px 6px',
                      display: 'flex', alignItems: 'center', gap: '3px',
                    }}
                  >
                    {/* UB2-3b: бейдж убран — он перекрывал маленькую кнопку,
                        а цена и так видна рядом (иконка + число). Иконка 10→14px. */}
                    <TokenIcon width={14} height={14} /> {r.cost}
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
                        display: 'flex', alignItems: 'center', gap: '3px',
                      }}
                    >
                      {/* UB2-3b: то же — без бейджа, цена видна инлайн */}
                      <AdFilmIcon width={14} height={14} /> 1
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
            <CrownIcon width={16} height={16} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }} />
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
                <TokenIcon width={14} height={14} /> {s.cost}
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

export default function PropertiesPanel({
  firstSelected,
  busy,
  selectedIds,
  canResize,
  canFillet,
  canCsg,
  canAlign,
  nonManifoldSelected,
  filletRadius,
  objectList,
  operationsLength,
  fileName,
  onSetFilletRadius,
  onMoveAxis,
  onRotAxis,
  onScaleAxis,
  onResizeDim,
  onResizeObject,
  onApplyFillet,
  onCsg,
  onAlign,
  onSetColor,
  onToggleVisible,
  onShowProjects,
  onSaveToProject,
  currentProjectId,
  currentProjectName,
  modified,
}: {
  firstSelected: SceneObject | null;
  busy: boolean;
  selectedIds: string[];
  canResize: boolean;
  canFillet: boolean;
  canCsg: boolean;
  canAlign: boolean;
  nonManifoldSelected?: boolean;
  filletRadius: number;
  objectList: SceneObject[];
  operationsLength: number;
  fileName: string | null;
  currentProjectId: string | null;
  currentProjectName: string | null;
  modified: boolean;
  onSetFilletRadius: (v: number) => void;
  onMoveAxis: (axis: "x" | "y" | "z", val: number) => void;
  onRotAxis: (axis: "rotX" | "rotY" | "rotZ", val: number) => void;
  onScaleAxis: (axis: "scaleX" | "scaleY" | "scaleZ", val: number) => void;
  onResizeDim: (dim: "width" | "height" | "depth", val: number) => void;
  onResizeObject: (id: string, params: ShapeParams) => void;
  onApplyFillet: (id: string, radius: number) => void;
  onCsg: (op: "union" | "subtract" | "intersect") => void;
  onAlign: (axis: "X" | "Y" | "Z", anchor: "min" | "center" | "max") => void;
  onSetColor: (id: string, color: string, skipHistory?: boolean) => void;
  onToggleVisible: (id: string) => void;
  onShowProjects: () => void;
  onSaveToProject: (name: string) => void;
}) {
  const { t } = useTranslation();
  // FIX: Draft color state — preview in real-time (no history), commit once
  // on blur or object switch.
  //
  // FIX (COLOR-HISTORY): Comparing draftColor against firstSelected.color was
  // always false — handleColorChange already previews the color into the store,
  // so at blur time they were equal and the 'color' operation was NEVER added
  // to history. Track the target object id and the base
  // (committed) color at draft start instead.
  const [draftColor, setDraftColor] = useState<string | null>(null);
  const draftTargetIdRef = useRef<string | null>(null);
  const baseColorRef = useRef<string | null>(null);

  // Toggle: показывать ли нативный color picker вместо палитры
  const [showNativePicker, setShowNativePicker] = useState(false);

  // FIX (UB-1): клик по «Расширенный выбор» БЕЗ аренды открывает МОДАЛКУ аренды
  // (раньше — молча переключал правую панель в режим экономики, и пользователь
  // не понимал, что делать). После успешной аренды RentalModal выставляет
  // palettePickerRequested — picker открывается сам, вторной клик не нужен.
  const setRentalModalKey = useUiStore(s => s.setRentalModalKey)
  const palettePickerRequested = useUiStore(s => s.palettePickerRequested)
  const setPalettePickerRequested = useUiStore(s => s.setPalettePickerRequested)
  useEffect(() => {
    if (!palettePickerRequested) return
    setPalettePickerRequested(false)
    setShowNativePicker(true)
  }, [palettePickerRequested, setPalettePickerRequested])

  // ✅ Проверка доступа к расширенной палитре — через RO-хелпер
  const hasExtendedPaletteRental = useEconomyStore(s => s.hasRentalRO('extendedPalette'))
  const hasActiveSub = useEconomyStore(s => s.hasActiveSubscriptionRO())
  const canUseExtendedPicker = hasExtendedPaletteRental || hasActiveSub
  // B2/B3: переходы «купить» больше НЕ снимают выделение — используется
  // store-флаг economyPanelOpen (ui-store): правая панель показывает экономику
  // независимо от выделения, панель свойств остаётся открытой.
  // Компонент сам читает флаг из store (единый источник) — проп не нужен.
  const economyPanelOpen = useUiStore(s => s.economyPanelOpen)
  const setEconomyPanelOpen = useUiStore(s => s.setEconomyPanelOpen)

  const commitDraftColor = () => {
    const targetId = draftTargetIdRef.current;
    const base = baseColorRef.current;
    if (targetId && draftColor && base !== null && draftColor !== base) {
      onSetColor(targetId, draftColor);
    }
    setDraftColor(null);
    draftTargetIdRef.current = null;
    baseColorRef.current = null;
  };

  // Apply draft color when blur fires
  const applyDraftColor = () => commitDraftColor();

  // Preview color change in real-time (no history entry)
  const handleColorChange = (color: string) => {
    if (firstSelected) {
      // Capture target object and committed color on the first change only
      if (draftTargetIdRef.current === null) {
        draftTargetIdRef.current = firstSelected.id;
        baseColorRef.current = firstSelected.color;
      }
      setDraftColor(color);
      // Update store for visual feedback — skip history
      onSetColor(firstSelected.id, color, true);
    }
  };

  // Commit pending draft when selected object changes (blur may not fire,
  // e.g. Escape deselect while the color input is focused), then reset
  useEffect(() => {
    const targetId = draftTargetIdRef.current;
    const base = baseColorRef.current;
    if (targetId && targetId !== firstSelected?.id && draftColor && base !== null && draftColor !== base) {
      onSetColor(targetId, draftColor);
    }
    setDraftColor(null);
    draftTargetIdRef.current = null;
    baseColorRef.current = null;
  }, [firstSelected?.id]);

  // P0-6: экономика рендерится только при реальном Yandex SDK (не clean-фолбэк)
  const isEconomyActive = isEconomyAvailable()

  // B2/B3: режим экономики в правой панели — активен по store-флагу
  // (переход «купить») либо при пустом выделении (U3).
  const showEconomyMode = economyPanelOpen || !firstSelected

  // B3: выходим из режима экономики только когда ИЗМЕНИЛСЯ выбранный объект
  // (клик в списке объектов/вьюпорте). Клик «Расширенный выбор» (B3) не меняет
  // selection → флаг остаётся, панель экономики показывается поверх свойств.
  const prevSelectedIdRef = useRef<string | null>(null)
  useEffect(() => {
    const currentId = firstSelected?.id ?? null
    const prevId = prevSelectedIdRef.current
    prevSelectedIdRef.current = currentId
    if (prevId !== currentId && currentId !== null && economyPanelOpen) {
      setEconomyPanelOpen(false)
    }
  }, [firstSelected?.id, economyPanelOpen, setEconomyPanelOpen])

  if (!firstSelected) {
    // ── Нет выделения: показываем экономику (yandex-only) + проект ──
    return (
      <>
        {/* Экономика — только при реальном Yandex SDK (§6.2, P0-6) */}
        {isEconomyActive && <EconomyPanel />}

        <div className="props-empty">
          {t("properties.selectObject")}
          <br />
          {t("properties.toViewProperties")}
        </div>
        {objectList.length > 0 && (
          <div className="text-sm text-muted-xs" style={{ padding: "8px 12px" }}>
            {t("properties.inScene")}{" "}
            <strong className="text-primary">
              {objectList.length}
            </strong>{" "}
            {t("properties.objects")}
          </div>
        )}
        {/* Проект */}
        <div className="csg-group margin-8-0">
          <div className="csg-group-title">{t("actions.save")}</div>
          {currentProjectName ? (
            <div className="text-sm text-muted" style={{ padding: "4px 12px 8px" }}>
              <FolderIcon width={16} height={16} style={{ display: 'inline-block', verticalAlign: 'middle' }} />{' '}
              <strong>{currentProjectName}</strong>
              {modified && <span className="text-warning"> •</span>}
            </div>
          ) : fileName ? (
            <div className="text-sm text-muted" style={{ padding: "4px 12px 8px" }}>
              {t("properties.unsavedProject")}
              {modified && <span className="text-warning"> •</span>}
            </div>
          ) : (
            <div className="text-sm text-muted" style={{ padding: "4px 12px 8px" }}>
              {t("properties.unsavedProject")}
            </div>
          )}
          <button
            className="btn btn-full"
            onClick={onShowProjects}
          >
            <FolderIcon size={32} /> {t("properties.projectManager")}
          </button>
          <button
            className="btn primary btn-full mt-2"
            disabled={operationsLength === 0}
            onClick={() =>
              onSaveToProject(currentProjectName ?? "")
            }
          >
            <SaveIcon size={32} /> {currentProjectId ? t("properties.save") : t("properties.quickSave")}
          </button>
        </div>
      </>
    );
  }

  return (
    <>
      {/* EC6: мини-HUD баланса при выделенном объекте (P0-6: только при Yandex SDK) */}
      {isEconomyActive && <EconomyMiniHUD />}

      {/* B2/B3: режим экономики — «купить» из LeftPanel/палитры (store-флаг).
          Показывается ВНУТРИ правой панели, не снимая выделение. */}
      {showEconomyMode && (
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

      <div className="props-row">
        <span className="props-label">{t("properties.type")}</span>
        <span className="props-value">
          {firstSelected.shapeType === 'csg' ? t("csg.result") :
            firstSelected.shapeType === 'import_mesh' ? t("actions.import") :
              firstSelected.shapeType === 'text3d' ? t("leftPanel.text3d") :
                t(`shapes.${firstSelected.shapeType}`)}
        </span>
      </div>

      <div className="props-row">
        <span className="props-label">{t("properties.color")}</span>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {/* U6: простая палитра Wad's Optimum 16 бесплатна и доступна ВСЕГДА
              (§3.4 «бесплатно навсегда — ядро редактора»). Аренда extendedPalette
              открывает ТОЛЬКО расширенный native picker. */}
          {!showNativePicker && (
            <ColorPalette
              selectedColor={draftColor || firstSelected.color}
              onChange={(color) => handleColorChange(color)}
              onBlur={applyDraftColor}
            />
          )}
          {showNativePicker && canUseExtendedPicker && (
            <div className="flex-row-6">
              <div
                className="color-swatch"
                style={{ background: draftColor || firstSelected.color }}
              />
              <input
                type="color"
                value={draftColor || firstSelected.color}
                className="color-input"
                onChange={(e) => handleColorChange(e.target.value)}
                onBlur={applyDraftColor}
              />
            </div>
          )}
          <button
            className="btn btn-compact btn-full"
            onClick={() => {
              if (!canUseExtendedPicker) {
                // 🔒 FIX (UB-1): нет доступа — открываем модалку аренды
                // extendedPalette (75 TC). Store-флаг rentalModalKey НЕ снимает
                // выделение → панель свойств остаётся открытой.
                setRentalModalKey('extendedPalette')
                return
              }
              setShowNativePicker(!showNativePicker)
              setDraftColor(null)
              draftTargetIdRef.current = null
              baseColorRef.current = null
            }}
            style={{ position: 'relative' }}
          >
            {/* UB2-3a: при открытом расширенном picker кнопка ВОЗВРАЩАЕТ к обычной
                палитре — подпись на русском («Обычная палитра», ключ palette.regular),
                а не бренд «Wad's Optimum 16» латиницей (properties.palette). */}
            {showNativePicker ? t("palette.regular") : t("properties.advancedPicker")}
            <Badge type="tokens" value="75" isActive={canUseExtendedPicker} />
          </button>
        </div>
      </div >

      <div className="props-row">
        <span className="props-label">{t("properties.visible")}</span>
        <button
          className="btn btn-compact"
          onClick={() => onToggleVisible(firstSelected.id)}
        >
          {firstSelected.visible ? <EyeIcon size={32} /> : <EyeOffIcon size={32} />}{" "}
          {firstSelected.visible ? t("properties.yes") : t("properties.no")}
        </button>
      </div>

      <div className="props-row">
        <span className="props-label">{t("properties.triangles")}</span>
        <span className="props-value">
          {(firstSelected.indices.length / 3).toLocaleString()}
        </span>
      </div>

      <div className="props-section-title">{t("properties.position")}</div>
      <NumInput
        label="X"
        value={firstSelected.transform.x}
        disabled={busy}
        onChange={(v) => onMoveAxis("x", v)}
      />
      <NumInput
        label="Y"
        value={firstSelected.transform.y}
        disabled={busy}
        onChange={(v) => onMoveAxis("y", v)}
      />
      <NumInput
        label="Z"
        value={firstSelected.transform.z}
        disabled={busy}
        onChange={(v) => onMoveAxis("z", v)}
      />

      <div className="props-section-title">{t("properties.rotation")}</div>
      <NumInput
        label="rotX"
        unit="°"
        value={firstSelected.transform.rotX}
        disabled={busy}
        onChange={(v) => onRotAxis("rotX", v)}
      />
      <NumInput
        label="rotY"
        unit="°"
        value={firstSelected.transform.rotY}
        disabled={busy}
        onChange={(v) => onRotAxis("rotY", v)}
      />
      <NumInput
        label="rotZ"
        unit="°"
        value={firstSelected.transform.rotZ}
        disabled={busy}
        onChange={(v) => onRotAxis("rotZ", v)}
      />

      <div className="props-section-title">{t("properties.scale")}</div>
      <NumInput
        label="X"
        unit="×"
        min={0.01}
        step={0.1}
        value={Math.round(firstSelected.transform.scaleX * 1000) / 1000}
        disabled={busy}
        onChange={(v) => onScaleAxis("scaleX", v)}
      />
      <NumInput
        label="Y"
        unit="×"
        min={0.01}
        step={0.1}
        value={Math.round(firstSelected.transform.scaleY * 1000) / 1000}
        disabled={busy}
        onChange={(v) => onScaleAxis("scaleY", v)}
      />
      <NumInput
        label="Z"
        unit="×"
        min={0.01}
        step={0.1}
        value={Math.round(firstSelected.transform.scaleZ * 1000) / 1000}
        disabled={busy}
        onChange={(v) => onScaleAxis("scaleZ", v)}
      />

      {/* Resize dims — только для примитивов и CSG результатов */}
      {
        canResize && firstSelected.shapeType !== "import_mesh" && (
          <div className="csg-group">
            <div className="csg-group-title">{t("properties.dimensions")}</div>
            {firstSelected.shapeType === "cube" && !firstSelected.params.width && firstSelected.originalBboxSize ? (
              // CSG result: show real bbox dimensions in mm
              <>
                <NumInput
                  label={t("properties.width")}
                  min={0.1}
                  value={Math.round(firstSelected.originalBboxSize.x * 100) / 100}
                  disabled={busy}
                  onChange={(v) => onResizeObject(firstSelected.id, { width: v })}
                />
                <NumInput
                  label={t("properties.height")}
                  min={0.1}
                  value={Math.round(firstSelected.originalBboxSize.y * 100) / 100}
                  disabled={busy}
                  onChange={(v) => onResizeObject(firstSelected.id, { height: v })}
                />
                <NumInput
                  label={t("properties.depth")}
                  min={0.1}
                  value={Math.round(firstSelected.originalBboxSize.z * 100) / 100}
                  disabled={busy}
                  onChange={(v) => onResizeObject(firstSelected.id, { depth: v })}
                />
              </>
            ) : firstSelected.shapeType === "cube" && firstSelected.params.width ? (
              // Regular cube: show params
              <>
                <NumInput
                  label={t("properties.width")}
                  min={0.1}
                  value={firstSelected.params.width ?? 20}
                  disabled={busy}
                  onChange={(v) => onResizeDim("width", v)}
                />
                <NumInput
                  label={t("properties.height")}
                  min={0.1}
                  value={firstSelected.params.height ?? 20}
                  disabled={busy}
                  onChange={(v) => onResizeDim("height", v)}
                />
                <NumInput
                  label={t("properties.depth")}
                  min={0.1}
                  value={firstSelected.params.depth ?? 20}
                  disabled={busy}
                  onChange={(v) => onResizeDim("depth", v)}
                />
              </>
            ) : null}
            {firstSelected.shapeType === "sphere" && (
              <>
                <NumInput
                  label={t("properties.radius")}
                  min={0.1}
                  value={firstSelected.params.radius ?? 12}
                  disabled={busy}
                  onChange={(v) =>
                    onResizeObject(firstSelected.id, {
                      radius: Math.max(0.1, v),
                    })
                  }
                />
              </>
            )}
            {(firstSelected.shapeType === "cylinder" ||
              firstSelected.shapeType === "cone") && (
                <>
                  <NumInput
                    label={t("properties.radius")}
                    min={0.1}
                    value={firstSelected.params.radius ?? 10}
                    disabled={busy}
                    onChange={(v) =>
                      onResizeObject(firstSelected.id, {
                        radius: Math.max(0.1, v),
                      })
                    }
                  />
                  <NumInput
                    label={t("properties.height")}
                    min={0.1}
                    value={firstSelected.params.height ?? 30}
                    disabled={busy}
                    onChange={(v) =>
                      onResizeObject(firstSelected.id, {
                        height: Math.max(0.1, v),
                      })
                    }
                  />
                </>
              )}
            {firstSelected.shapeType === "torus" && (
              <>
                <NumInput
                  label={t("properties.torusRadius")}
                  min={1}
                  value={firstSelected.params.torusRadius ?? 15}
                  disabled={busy}
                  onChange={(v) =>
                    onResizeObject(firstSelected.id, { torusRadius: Math.max(1, v) })
                  }
                />
                <NumInput
                  label={t("properties.tubeRadius")}
                  min={0.5}
                  value={firstSelected.params.tubeRadius ?? 4}
                  disabled={busy}
                  onChange={(v) =>
                    onResizeObject(firstSelected.id, { tubeRadius: Math.max(0.5, v) })
                  }
                />
              </>
            )}
            {(firstSelected.shapeType === "prism" ||
              firstSelected.shapeType === "pyramid") && (
                <>
                  <NumInput
                    label={t("properties.radius")}
                    min={0.5}
                    value={firstSelected.params.radius ?? 12}
                    disabled={busy}
                    onChange={(v) =>
                      onResizeObject(firstSelected.id, { radius: Math.max(0.5, v) })
                    }
                  />
                  <NumInput
                    label={t("properties.height")}
                    min={0.1}
                    value={firstSelected.params.height ?? 20}
                    disabled={busy}
                    onChange={(v) =>
                      onResizeObject(firstSelected.id, { height: Math.max(0.1, v) })
                    }
                  />
                  <NumInput
                    label={t("properties.sides")}
                    unit=""
                    min={3}
                    value={firstSelected.params.sides ?? (firstSelected.shapeType === "prism" ? 6 : 4)}
                    disabled={busy}
                    onChange={(v) =>
                      onResizeObject(firstSelected.id, { sides: Math.max(3, Math.round(v)) })
                    }
                  />
                </>
              )}
          </div>
        )
      }

      {/* Fillet — только для кубов (не для CSG результатов) */}
      {
        canFillet && firstSelected.shapeType === 'cube' && (
          <div className="csg-group">
            <div className="csg-group-title">{t("properties.filletTitle")}</div>
            <NumInput
              label={t("properties.radius")}
              unit="мм"
              min={0}
              value={filletRadius}
              onChange={onSetFilletRadius}
            />
            <button
              className="btn primary"
              disabled={!canFillet}
              onClick={() => onApplyFillet(firstSelected.id, filletRadius)}
            >
              <FilletIcon size={32} /> {t("actions.apply")}
            </button>
          </div>
        )
      }

      {/* Extrude — скрыто в свойствах, доступно на панели инструментов */}
      {/* Mirror — скрыто в свойствах, доступно на панели инструментов */}

      {/* CSG + Align */}
      {
        selectedIds.length === 2 && (
          <>
            <CsgButtons disabled={!canCsg} onCsg={onCsg} variant="full" nonManifoldSelected={nonManifoldSelected} />
            <AlignButtons disabled={!canAlign} onAlign={onAlign} variant="full" />
          </>
        )
      }
    </>
  );
}
