// src/components/QuestPanel.tsx — Панель ежедневных квестов
import { useTranslation } from 'react-i18next'
import { useEconomyStore } from '../store/economy-store'
import { ECONOMY_UI, DIFFICULTY_ICON, ICON_REGISTRY } from '../store/economy-ui-config'
import Section from './Section'

export default function QuestPanel() {
  const { t } = useTranslation()
  const todayQuests = useEconomyStore((s) => s.todayQuests)
  const todayQuestsCompleted = useEconomyStore((s) => s.todayQuestsCompleted)

  if (!ECONOMY_UI.showQuests) return null
  if (todayQuests.length === 0) return null

  /** Получить читаемое имя триггера из i18n */
  function getTriggerLabel(trigger: string, target: number): string {
    return t(`economy.triggers.${trigger}`, { n: target })
  }

  return (
    <Section title={t('economy.quests')}>
      <div className="quest-list" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {todayQuests.map((quest, idx) => {
          const isCompleted = todayQuestsCompleted.includes(quest.difficulty)
          const progress = Math.min(quest.progress / quest.target, 1)

          // Получаем иконку сложности из реестра
          const iconKey = DIFFICULTY_ICON[quest.difficulty]
          const IconComponent = ICON_REGISTRY[iconKey]
          const iconSize = 16

          return (
            <div
              key={idx}
              className="quest-item"
              style={{
                padding: '8px',
                borderRadius: '6px',
                background: isCompleted ? 'var(--bg-secondary)' : 'var(--bg-tertiary)',
                border: `1px solid ${isCompleted ? 'var(--border-success)' : 'var(--border)'}`,
                opacity: isCompleted ? 0.6 : 1,
              }}
            >
              {/* Заголовок с иконкой сложности */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  {IconComponent && (
                    <IconComponent width={iconSize} height={iconSize} />
                  )}
                  {quest.difficulty === 'easy' ? t('economy.difficulty.easy') :
                    quest.difficulty === 'medium' ? t('economy.difficulty.medium') :
                      t('economy.difficulty.hard')}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {quest.progress} / {quest.target}
                </span>
              </div>

              {/* Описание — i18n с подстановкой {n} */}
              <div style={{ fontSize: '13px', marginBottom: '4px' }}>
                {getTriggerLabel(quest.trigger, quest.target)}
              </div>

              {/* Прогресс-бар */}
              <div
                className="quest-progress"
                style={{
                  height: '4px',
                  borderRadius: '2px',
                  background: 'var(--bg-secondary)',
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    height: '100%',
                    width: `${progress * 100}%`,
                    background: isCompleted ? 'var(--success)' : 'var(--primary)',
                    borderRadius: '2px',
                    transition: 'width 0.3s ease',
                  }}
                />
              </div>

              {/* Награда с иконкой токена */}
              <div style={{ fontSize: '11px', marginTop: '4px', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: '4px' }}>
                {IconComponent && (
                  <IconComponent width={14} height={14} />
                )}
                +{quest.reward}
              </div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}
