// src/components/EconomyOnboarding.tsx — Онбординг экономики (§6.7 ECONOMY.md v2.0)
// 3 шага: ХУД → бейджи → панель. Флаг в облако — показывать один раз.
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useEconomyStore } from '../store/economy-store'
import { initPlatform, isEconomyAvailable } from '../platform'
import { TokenIcon, PackageIcon } from './icons'

const STEPS = [
  {
    key: 'hud',
    icon: <TokenIcon width={32} height={32} />,
    title: 'onboarding.steps.hud.title',
    text: 'onboarding.steps.hud.text',
  },
  {
    key: 'badges',
    icon: <PackageIcon width={32} height={32} />,
    title: 'onboarding.steps.badges.title',
    text: 'onboarding.steps.badges.text',
  },
  {
    key: 'quests',
    icon: null,
    title: 'onboarding.steps.quests.title',
    text: 'onboarding.steps.quests.text',
  },
] as const

export default function EconomyOnboarding() {
  const { t } = useTranslation()
  // P2-3: флаг онбординга и action берём из store — единая точка
  // персиста/синхронизации (persist + syncToCloud), а не прямой saveData().
  const onboardingDone = useEconomyStore((s) => s.onboardingDone)
  const completeOnboarding = useEconomyStore((s) => s.completeOnboarding)

  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // P2-3: флаг уже в store (восстановлен из persist при гидрации и/или
  // из облака через loadFromCloud в App.bootstrap) — отдельный loadData
  // в компоненте больше не нужен. Ждём только инициализацию платформы,
  // чтобы не показывать онбординг до завершения SDK-инициализации.
  useEffect(() => {
    let cancelled = false

    const checkOnboarding = async () => {
      // ⚠️ Ждём initPlatform() (идемпотентен) — чтобы изоляция от error #185
      // сохранялась: при yandex-платформе онбординг рендерится только после
      // RAF-инициализации платформы (App.tsx рендерит <EconomyOnboarding/>
      // только при isEconomyAvailable()).
      await initPlatform().catch(() => false)
      if (cancelled) return

      // P0-6: без реального Yandex SDK онбординг не показываем
      if (!isEconomyAvailable()) return

      // P2-3: проверяем флаг из store (persist/облако синхронизированы
      // в bootstrap). Если флаг ещё не успел прийти из облака — онбординг
      // может показаться один раз, но completeOnboarding() запишет флаг
      // и в persist, и в облако, так что повторно он не появится.
      if (useEconomyStore.getState().onboardingDone) {
        return // Уже показывали
      }
      if (!cancelled) setVisible(true)
    }

    checkOnboarding()
    return () => { cancelled = true }
  }, [])

  // P2-3: если флаг пришёл из облака/локального хранилища во время показа
  // (синхронизация завершилась позже) — скрываем онбординг.
  useEffect(() => {
    if (onboardingDone) {
      setVisible(false)
      setDismissed(true)
    }
  }, [onboardingDone])

  const handleNext = () => {
    if (step < STEPS.length - 1) {
      setStep(step + 1)
    } else {
      handleDone()
    }
  }

  const handleDone = async () => {
    setDismissed(true)
    setVisible(false)

    // P2-3: флаг сохраняется через store — persist + syncToCloud атомарно.
    // Прямой platform.saveData() НЕ используется: он мог затереть облачные
    // поля экономики (saveData перезаписывает весь блоб в Yandex SDK) и
    // терялся при перезагрузке до синхронизации.
    completeOnboarding()
  }

  if (!visible || dismissed) return null

  const currentStep = STEPS[step]

  return (
    <div className="text-modal-backdrop" onClick={handleDone}>
      <div
        className="text-modal-box"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Индикатор шагов */}
        <div style={{ display: 'flex', gap: '8px', justifyContent: 'center', marginBottom: '16px' }}>
          {STEPS.map((_, i) => (
            <div
              key={i}
              style={{
                width: i === step ? '24px' : '8px',
                height: '8px',
                borderRadius: '4px',
                background: i === step ? 'var(--primary)' : 'var(--bg-secondary)',
                transition: 'all 0.3s ease',
              }}
            />
          ))}
        </div>

        {/* Контент шага */}
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          {currentStep.icon && (
            <div style={{ marginBottom: '12px' }}>
              {currentStep.icon}
            </div>
          )}
          <div style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>
            {t(currentStep.title)}
          </div>
          <div style={{ fontSize: '15px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {t(currentStep.text)}
          </div>
        </div>

        {/* Кнопки */}
        <div className="text-modal-actions" style={{ justifyContent: 'center', gap: '12px' }}>
          {step < STEPS.length - 1 ? (
            <>
              <button className="btn primary" onClick={handleNext}>
                {t('onboarding.next')}
              </button>
              <button className="btn" onClick={handleDone}>
                {t('onboarding.skip')}
              </button>
            </>
          ) : (
            <button className="btn primary" onClick={handleDone}>
              {t('onboarding.done')}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
