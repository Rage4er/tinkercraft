import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import NumInput from "./NumInput";
import AlignButtons from "./AlignButtons";
import CsgButtons from "./CsgButtons";
import ColorPalette from "./ColorPalette";
import type { ShapeParams, SceneObject } from "../csg/types";
import { EyeIcon, EyeOffIcon, FilletIcon, FolderIcon, SaveIcon, TokenIcon, GiftIcon, AdFilmIcon, CrownIcon, ClockIcon, SparkIcon, StarIcon, TrophyIcon } from "./icons";
import { useEconomyStore, type QuestDifficulty, type RentalKey } from "../store/economy-store";
import { getPlatform } from "../platform";
import { ECONOMY_UI, DIFFICULTY_ICON, ICON_REGISTRY } from "../store/economy-ui-config";

/** Форматировать оставшееся время аренды (ч м) */
function formatRentalRemaining(expiresAt: number): string {
  const remaining = expiresAt - Date.now()
  if (remaining <= 0) return 'Истекла'
  const hours = Math.floor(remaining / (1000 * 60 * 60))
  const mins = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60))
  return `${hours}ч ${mins}м`
}

/** Форматировать оставшееся время подписки (дн ч) */
function formatSubRemaining(expiresAt: number): string {
  const remaining = expiresAt - Date.now()
  if (remaining <= 0) return 'Истекла'
  const days = Math.floor(remaining / (1000 * 60 * 60 * 24))
  const hours = Math.floor((remaining % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60))
  return `${days}д ${hours}ч`
}

/** Форматировать ms → "5:00" */
function formatCooldown(ms: number): string {
  const totalSec = Math.ceil(ms / 1000)
  const min = Math.floor(totalSec / 60)
  const sec = totalSec % 60
  return `${min}:${sec.toString().padStart(2, '0')}`
}

/** Рассчитать оставшееся время кулдауна рекламы (мс) */
function getAdCooldownRemaining(): number {
  const { lastAdTimestamp } = useEconomyStore.getState()
  if (!lastAdTimestamp) return 0
  const AD_COOLDOWN_MS = 5 * 60 * 1000
  const elapsed = Date.now() - lastAdTimestamp
  return Math.max(0, AD_COOLDOWN_MS - elapsed)
}

// ─── Экономика: панель (yandex-only, §6.2 ECONOMY.md v2.0) ──────────

function EconomyPanel() {
  const { t } = useTranslation()
  const tokens = useEconomyStore((s) => s.tokens)
  const claimDailyBonus = useEconomyStore((s) => s.claimDailyBonus)
  const watchAdForTokens = useEconomyStore((s) => s.watchAdForTokens)
  const todayAdsWatched = useEconomyStore((s) => s.todayAdsWatched)
  const lastDailyBonus = useEconomyStore((s) => s.lastDailyBonus)
  const todayQuests = useEconomyStore((s) => s.todayQuests)
  const todayQuestsCompleted = useEconomyStore((s) => s.todayQuestsCompleted)
  const rentals = useEconomyStore((s) => s.rentals)
  const activeSubscription = useEconomyStore((s) => s.activeSubscription)
  const subscriptionExpiresAt = useEconomyStore((s) => s.subscriptionExpiresAt)
  const buyRental = useEconomyStore((s) => s.buyRental)
  const buySubscription = useEconomyStore((s) => s.buySubscription)
  const setBannerVisible = useEconomyStore((s) => s.setBannerVisible)
  const hasActiveSub = useEconomyStore((s) => s.hasActiveSubscription())
  const hasRental = useEconomyStore((s) => s.hasRental)

  const [busy, setBusy] = useState<string | null>(null)
  const [cooldownMs, setCooldownMs] = useState(getAdCooldownRemaining())

  useEffect(() => {
    const iv = setInterval(() => setCooldownMs(getAdCooldownRemaining()), 1000)
    return () => clearInterval(iv)
  }, [])

  const canClaimBonus = lastDailyBonus ? new Date(lastDailyBonus).getDate() !== new Date().getDate() : true
  const canWatchAd = todayAdsWatched < 3 && cooldownMs === 0

  const handleBuyRental = async (key: RentalKey) => {
    if (busy) return
    setBusy(key)
    const result = await buyRental(key)
    setBusy(null)
    if (result.ok && key === 'disableBanner') setBannerVisible(false)
  }

  const handleBuySub = async (type: 'weekly' | 'monthly') => {
    if (busy) return
    setBusy(type)
    const result = await buySubscription(type)
    setBusy(null)
    if (result.ok) setBannerVisible(false)
  }

  // Утилиты для рендера иконок
  const renderIcon = (key: string, w = 14, h = 14) => {
    const Icon = ICON_REGISTRY[key]
    return Icon ? <Icon width={w} height={h} /> : null
  }

  const getTriggerLabel = (trigger: string, target: number) =>
    t(`economy.triggers.${trigger}`, { n: target })

  // ── Токены и бонусы ──
  const tokensSection = (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {renderIcon('token', 20, 20)}
        <span style={{ fontWeight: 'bold', fontSize: '16px' }}>{tokens}</span>
        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{t('economy.tokensLabel')}</span>
      </div>
      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>(i)</span>
    </div>
  )

  const bonusSection = (
    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
      {ECONOMY_UI.showDailyBonus && canClaimBonus && (
        <button className="btn btn-compact btn-sm" onClick={claimDailyBonus} disabled={!!busy}
          title={t('economy.tooltip.bonus')}>
          {renderIcon('gift', 14, 14)} {t('economy.bonusLabel')}
        </button>
      )}
      {ECONOMY_UI.showAdButton && canWatchAd && (
        <button className="btn btn-compact btn-sm" onClick={watchAdForTokens} disabled={!!busy}
          title={t('economy.tooltip.ad')}>
          {renderIcon('ad', 14, 14)} {t('economy.adLabel')}
        </button>
      )}
      {ECONOMY_UI.showAdButton && todayAdsWatched < 3 && cooldownMs > 0 && (
        <span style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
          ⏱ {formatCooldown(cooldownMs)}
        </span>
      )}
      {ECONOMY_UI.showAdButton && todayAdsWatched >= 3 && cooldownMs === 0 && (
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{t('economy.tooltip.adLimit')}</span>
      )}
    </div>
  )

  // ── Квесты ──
  const questsSection = todayQuests.length > 0 && ECONOMY_UI.showQuests ? (() => {
    const completedCount = todayQuestsCompleted.length
    return (
      <div>
        <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: 'var(--text-muted)' }}>
          {t('economy.quests')} · {completedCount}/{todayQuests.length}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          {todayQuests.map((quest, idx) => {
            const isCompleted = todayQuestsCompleted.includes(quest.difficulty)
            const progress = Math.min(quest.progress / quest.target, 1)
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
                    {IconComp && <IconComp width={12} height={12} />}
                    {quest.difficulty === 'easy' ? t('economy.difficulty.easy') :
                      quest.difficulty === 'medium' ? t('economy.difficulty.medium') :
                        t('economy.difficulty.hard')}
                  </span>
                  <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{quest.progress}/{quest.target}</span>
                </div>
                <div style={{ fontSize: '11px' }}>{getTriggerLabel(quest.trigger, quest.target)}</div>
                <div style={{ height: '3px', borderRadius: '2px', background: 'var(--bg-secondary)', overflow: 'hidden', marginTop: '3px' }}>
                  <div style={{ height: '100%', width: `${progress * 100}%`, background: isCompleted ? 'var(--success)' : 'var(--primary)', borderRadius: '2px', transition: 'width 0.3s ease' }} />
                </div>
                <div style={{ fontSize: '10px', marginTop: '2px', color: 'var(--text-muted)' }}>
                  +{quest.reward} 💎
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
  const rentalsConfig = [
    { key: 'text3d' as const, label: '3D-текст', cost: 75, icon: '🔤', desc: 'Создание 3D-текста' },
    { key: 'extendedPalette' as const, label: 'Расширенная палитра', cost: 75, icon: '🎨', desc: 'Дополнительные цвета' },
    { key: 'disableBanner' as const, label: 'Отключение баннера', cost: 50, icon: '🚫', desc: 'Без рекламы на 24ч' },
  ]

  const subsConfig = [
    { key: 'weekly' as const, label: 'Недельная', cost: 700, days: 7, perDay: '≈ 100/день' },
    { key: 'monthly' as const, label: 'Месячная', cost: 2000, days: 30, perDay: '≈ 67/день' },
  ]

  const rentalsSection = (
    <div>
      <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: 'var(--text-muted)' }}>
        <ClockIcon width={14} height={14} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }} />
        Аренда 24ч
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
        {rentalsConfig.map((r) => {
          const isActive = hasRental(r.key)
          const rentalExpires = rentals[r.key]
          const remaining = rentalExpires !== null ? formatRentalRemaining(rentalExpires) : null
          return (
            <div key={r.key} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '6px 8px', borderRadius: '4px',
              background: isActive ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
              border: `1px solid ${isActive ? 'var(--border-success)' : 'var(--border)'}`,
              opacity: isActive ? 0.7 : 1,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ fontSize: '14px' }}>{r.icon}</span>
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 'bold' }}>{r.label}</div>
                  <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                    {r.desc}{remaining && ` · ${remaining}`}
                  </div>
                </div>
              </div>
              {isActive ? (
                <span style={{ fontSize: '10px', color: 'var(--success)' }}>Активно</span>
              ) : (
                <button className="btn btn-compact btn-sm" disabled={tokens < r.cost || busy === r.key}
                  onClick={() => handleBuyRental(r.key)}
                  style={{ fontSize: '10px', padding: '2px 6px' }}>
                  <TokenIcon width={10} height={10} /> {r.cost}
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* Подписки */}
      <div style={{ marginTop: '8px' }}>
        <div style={{ fontSize: '12px', fontWeight: 'bold', marginBottom: '6px', color: 'var(--text-muted)' }}>
          <CrownIcon width={14} height={14} style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: '4px' }} />
          {t('economy.subscription')}
        </div>
        {hasActiveSub && subscriptionExpiresAt ? (
          <div style={{
            padding: '4px 8px', borderRadius: '4px', background: 'var(--bg-secondary)',
            border: '1px solid var(--border-success)', fontSize: '11px', color: 'var(--success)'
          }}>
            Pro активна · {formatSubRemaining(subscriptionExpiresAt)}
          </div>
        ) : (
          <div style={{ display: 'flex', gap: '4px' }}>
            {subsConfig.map((s) => (
              <button key={s.key} className="btn btn-compact btn-sm" disabled={tokens < s.cost || busy === s.key}
                onClick={() => handleBuySub(s.key)}
                style={{ fontSize: '10px', padding: '2px 6px' }}>
                <TokenIcon width={10} height={10} /> {s.cost}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )

  // ── Скрытие баннера (2 место §6.3) ──
  const bannerOffSection = (
    <div style={{
      padding: '6px 8px', borderRadius: '4px',
      background: 'var(--bg-tertiary)', border: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    }}>
      <div>
        <div style={{ fontSize: '11px', fontWeight: 'bold' }}>{t('economy.triggers.bannerOff', { defaultValue: 'Нет баннера на 24 ч' })}</div>
        <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>{t('economy.tooltip.bannerOff')}</div>
      </div>
      <div style={{ display: 'flex', gap: '4px' }}>
        <button className="btn btn-compact btn-sm" disabled={tokens < 50 || busy === 'disableBanner'}
          onClick={() => handleBuyRental('disableBanner')}
          style={{ fontSize: '10px', padding: '2px 6px' }}>
          <TokenIcon width={10} height={10} /> 50
        </button>
        <button className="btn btn-compact btn-sm" disabled={busy === 'disableBanner'}
          onClick={() => handleBuyRental('disableBanner')}
          style={{ fontSize: '10px', padding: '2px 6px' }}>
          <AdFilmIcon width={10} height={10} /> 1
        </button>
      </div>
    </div>
  )

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

      {/* Аренда + подписки */}
      <div className="csg-group">{rentalsSection}</div>

      {/* Баннер off */}
      <div className="csg-group">{bannerOffSection}</div>
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

  // Проверка yandex-only
  const isYandex = getPlatform() !== null

  if (!firstSelected) {
    // ── Нет выделения: показываем экономику (yandex-only) + проект ──
    return (
      <>
        {/* Экономика — только в yandex-режиме (§6.2) */}
        {isYandex && <EconomyPanel />}

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
          {showNativePicker ? (
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
          ) : (
            <ColorPalette
              selectedColor={draftColor || firstSelected.color}
              onChange={(color) => handleColorChange(color)}
              onBlur={applyDraftColor}
            />
          )}
          <button
            className="btn btn-compact btn-full"
            onClick={() => {
              setShowNativePicker(!showNativePicker);
              setDraftColor(null);
              draftTargetIdRef.current = null;
              baseColorRef.current = null;
            }}
          >
            {showNativePicker ? t("properties.palette") : t("properties.advancedPicker")}
          </button>
        </div>
      </div>

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
      {canResize && firstSelected.shapeType !== "import_mesh" && (
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
      )}

      {/* Fillet — только для кубов (не для CSG результатов) */}
      {canFillet && firstSelected.shapeType === 'cube' && (
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
      )}

      {/* Extrude — скрыто в свойствах, доступно на панели инструментов */}
      {/* Mirror — скрыто в свойствах, доступно на панели инструментов */}

      {/* CSG + Align */}
      {selectedIds.length === 2 && (
        <>
          <CsgButtons disabled={!canCsg} onCsg={onCsg} variant="full" nonManifoldSelected={nonManifoldSelected} />
          <AlignButtons disabled={!canAlign} onAlign={onAlign} variant="full" />
        </>
      )}
    </>
  );
}
