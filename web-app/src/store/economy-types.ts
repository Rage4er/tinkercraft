// src/store/economy-types.ts — типы экономики, нужные общим (не-yandex) файлам
// Y.4 (рефакторинг yandex-games): вынесено из store/types.ts, document-store.ts,
// ExportModal.tsx и EconomyOverlays.tsx — общий литерал меняется в одном месте.

/** Способ оплаты экспорта STL: токены или просмотр ревард-рекламы. */
export type ExportPaymentMethod = 'tokens' | 'ad'
