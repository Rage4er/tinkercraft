// src/components/EconomyOnboarding.tsx — Онбординг экономики (§6.7 ECONOMY.md v2.0)
// 3 шага: ХУД → бейджи → панель. Флаг в облако — показывать один раз.
import { useState, useEffect } from 'react'
import { useTranslation } from 'react-i18next'
import { useEconomyStore } from '../store/economy-store'
import { getPlatform } from '../platform'

const STEPS = [
  {
    key: 'hud',
    title: '💎 Токены',
    text: 'Это ваша внутренняя валюта. Тратьте на экспорт, аренду и подписку.',
  },
  {
    key: 'badges',
    title: '📦 Экспорт и импорт',
    text: 'Экспорт стоит 50 💎, импорт — 100 💎. Бейджи показывают стоимость.',
  },
  {
    key: 'quests',
    title: '📋 Задания дня',
    text: 'Постройте модель и сохраните проект — задания засчитаются!',
  },
] as const

export default function EconomyOnboarding() {
  const { t } = useTranslation()
  const syncToCloud = useEconomyStore((s) => s.syncToCloud)

  const [step, setStep] = useState(0)
  const [visible, setVisible] = useState(false)
  const [dismissed, setDismissed] = useState(false)

  // Проверяем, показывали ли онбординг ранее
  useEffect(() => {
    const platform = getPlatform()
    if (!platform) return

    // Проверяем флаг в облаке
    const checkOnboarding = async () => {
      try {
        const data = await platform.loadData()
        if (data.onboardingDone) {
          return // Уже показывали
        }
      } catch {
        // Если ошибка — показываем онбординг
      }
      setVisible(true)
    }

    checkOnboarding()
  }, [])

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

    // Сохраняем флаг в облако
    const platform = getPlatform()
    if (platform) {
      try {
        await platform.saveData({ onboardingDone: true })
        await syncToCloud()
      } catch {
        // Игнорируем ошибки сохранения флага
      }
    }
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
          <div style={{ fontSize: '20px', fontWeight: 'bold', marginBottom: '12px' }}>
            {currentStep.title}
          </div>
          <div style={{ fontSize: '15px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
            {currentStep.text}
          </div>
        </div>

        {/* Кнопки */}
        <div className="text-modal-actions" style={{ justifyContent: 'center', gap: '12px' }}>
          {step < STEPS.length - 1 ? (
            <>
              <button className="btn primary" onClick={handleNext}>
                Далее
              </button>
              <button className="btn" onClick={handleDone}>
                Пропустить
              </button>
            </>
          ) : (
            <button className="btn primary" onClick={handleDone}>
              Готово!
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
