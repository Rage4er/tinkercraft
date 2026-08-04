// ============================================================
// Notification store — lightweight toast notifications
// Replaces blocking alert() calls (SEC-2 fix).
// ============================================================

import { create } from 'zustand/react'

export type NotificationType = 'error' | 'warning' | 'info'

export interface Notification {
  id: string
  message: string
  type: NotificationType
}

interface NotificationStore {
  notifications: Notification[]
  timeouts: Map<string, number>
  show: (message: string, type?: NotificationType) => void
  dismiss: (id: string) => void
}

const MAX_NOTIFICATIONS = 5

export const useNotifications = create<NotificationStore>((set, get) => ({
  notifications: [],
  timeouts: new Map(),
  show: (message, type = 'info') => {
    // FIX (MED-18-12): Limit max notifications to prevent UI clutter
    const state = get()
    if (state.notifications.length >= MAX_NOTIFICATIONS) {
      const oldest = state.notifications[0]
      if (oldest) {
        const timeout = state.timeouts.get(oldest.id)
        if (timeout) clearTimeout(timeout)
        state.timeouts.delete(oldest.id)
        set((s) => ({ notifications: s.notifications.slice(1) }))
      }
    }

    const id = crypto.randomUUID()
    set((s) => ({ notifications: [...s.notifications, { id, message, type }] }))

    const timeout = window.setTimeout(() => {
      set((s) => {
        const newTimeouts = new Map(s.timeouts)
        newTimeouts.delete(id)
        return {
          notifications: s.notifications.filter((n) => n.id !== id),
          timeouts: newTimeouts,
        }
      })
    }, 5000)

    // FIX (MED-18-10): Store timeout id for cleanup on dismiss
    set((s) => ({ timeouts: new Map(s.timeouts).set(id, timeout) }))
  },
  dismiss: (id) => {
    // FIX (MED-18-10): Clear pending timeout when manually dismissed
    const state = get()
    const timeout = state.timeouts.get(id)
    if (timeout) {
      window.clearTimeout(timeout)
      const newTimeouts = new Map(state.timeouts)
      newTimeouts.delete(id)
      set((s) => ({
        notifications: s.notifications.filter((n) => n.id !== id),
        timeouts: newTimeouts,
      }))
    } else {
      set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }))
    }
  },
}))

/**
 * Convenience function for non-React contexts (e.g. document-store actions).
 * Usage: notify('Something went wrong', 'error')
 */
export function notify(message: string, type: NotificationType = 'info'): void {
  useNotifications.getState().show(message, type)
}
