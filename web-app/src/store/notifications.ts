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
  show: (message: string, type?: NotificationType) => void
  dismiss: (id: string) => void
}

export const useNotifications = create<NotificationStore>((set) => ({
  notifications: [],
  show: (message, type = 'info') => {
    const id = crypto.randomUUID()
    set((s) => ({ notifications: [...s.notifications, { id, message, type }] }))
    // Auto-dismiss after 5 seconds
    setTimeout(() => {
      set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) }))
    }, 5000)
  },
  dismiss: (id) =>
    set((s) => ({ notifications: s.notifications.filter((n) => n.id !== id) })),
}))

/**
 * Convenience function for non-React contexts (e.g. document-store actions).
 * Usage: notify('Something went wrong', 'error')
 */
export function notify(message: string, type: NotificationType = 'info'): void {
  useNotifications.getState().show(message, type)
}
