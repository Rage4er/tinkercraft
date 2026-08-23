// src/components/QuestPanel.tsx — Панель ежедневных квестов
import { useTranslation } from 'react-i18next'
import { useEconomyStore } from '../store/economy-store'
import { ECONOMY_UI, QUEST_LABELS, TRIGGER_LABELS } from '../store/economy-ui-config'
import Section from './Section'

export default function QuestPanel() {
  const { t } = useTranslation()
  const todayQuests = useEconomyStore((s) => s.todayQuests)
  const todayQuestsCompleted = useEconomyStore((s) => s.todayQuestsCompleted)

  if (!ECONOMY_UI.showQuests) return null
  if (todayQuests.length === 0) return null

  return (
    <Section title={t('economy.quests')}>
      <div className="quest-list" style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
        {todayQuests.map((quest, idx) => {
          const isCompleted = todayQuestsCompleted.includes(quest.difficulty)
          const progress = Math.min(quest.progress / quest.target, 1)

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
              {/* Заголовок */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '12px', fontWeight: 'bold' }}>
                  {QUEST_LABELS[quest.difficulty]}
                </span>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  {quest.progress} / {quest.target}
                </span>
              </div>

              {/* Описание */}
              <div style={{ fontSize: '13px', marginBottom: '4px' }}>
                {TRIGGER_LABELS[quest.trigger] || quest.trigger}
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

              {/* Награда */}
              <div style={{ fontSize: '11px', marginTop: '4px', color: 'var(--text-muted)' }}>
                🎁 +{quest.reward} 💎
              </div>
            </div>
          )
        })}
      </div>
    </Section>
  )
}
