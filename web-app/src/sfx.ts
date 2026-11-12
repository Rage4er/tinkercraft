// ============================================================
// sfx.ts — звуки интерфейса (SFX)
// ============================================================
// Короткие тоны Web Audio (без файлов): клик (кнопки), создание (фигура, импорт, текст),
// успех (CSG, размер), ошибка (уведомление-ошибка / предупреждение). Вкл. / громкость —
// «Настройки» (`store/settings.ts`). AudioContext создаётся при первом звуке (после жеста
// пользователя — политика автозапуска браузеров); нет Web Audio — звука нет, без ошибок.
// Для e2e: `<html data-sfx-last="…" data-sfx-count="N">` — какой звук сыгран последним и сколько.

import { useSettingsStore } from './store/settings'

export type SfxKind = 'click' | 'create' | 'success' | 'error'
export const SFX_KINDS: readonly SfxKind[] = ['click', 'create', 'success', 'error']

interface Tone { freq: number; to?: number; at: number; dur: number; type: OscillatorType; gain: number }
/** Рецепты: ноты (Гц), сдвиг начала и длительность (с), форма волны, относительная громкость */
export const SFX_RECIPES: Record<SfxKind, Tone[]> = {
  click: [{ freq: 1200, at: 0, dur: 0.03, type: 'square', gain: 0.25 }],
  create: [{ freq: 520, to: 880, at: 0, dur: 0.09, type: 'triangle', gain: 0.6 }],
  success: [
    { freq: 660, at: 0, dur: 0.08, type: 'sine', gain: 0.6 },
    { freq: 990, at: 0.08, dur: 0.12, type: 'sine', gain: 0.6 },
  ],
  error: [{ freq: 220, to: 150, at: 0, dur: 0.18, type: 'sawtooth', gain: 0.35 }],
}

/** Клик не чаще, мс (двойной клик не «трещит»); события (создание, успех, ошибка) — каждое */
const MIN_GAP_MS = 40

type Backend = (kind: SfxKind, volume: number) => void
let ctx: AudioContext | null = null

function webAudioBackend(kind: SfxKind, volume: number): void {
  const AC = (typeof window !== 'undefined' ? (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext) : undefined)
  if (!AC) return
  try {
    ctx ??= new AC()
    if (ctx.state === 'suspended') void ctx.resume()
    const t0 = ctx.currentTime
    for (const n of SFX_RECIPES[kind]) {
      const osc = ctx.createOscillator()
      const g = ctx.createGain()
      osc.type = n.type
      osc.frequency.setValueAtTime(n.freq, t0 + n.at)
      if (n.to) osc.frequency.exponentialRampToValueAtTime(n.to, t0 + n.at + n.dur)
      const peak = Math.max(0.0001, volume * n.gain * 0.5)
      g.gain.setValueAtTime(0.0001, t0 + n.at)
      g.gain.exponentialRampToValueAtTime(peak, t0 + n.at + 0.005)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + n.at + n.dur)
      osc.connect(g).connect(ctx.destination)
      osc.start(t0 + n.at)
      osc.stop(t0 + n.at + n.dur + 0.02)
    }
  } catch { /* звук не обязателен */ }
}

let backend: Backend = webAudioBackend
/** Подменить вывод звука (тесты); без аргумента — Web Audio */
export function setSfxBackend(b?: Backend): void { backend = b ?? webAudioBackend }

const lastAt: Partial<Record<SfxKind, number>> = {}
let count = 0

/** Сыграть звук; false — звуки выключены, громкость 0 или клик только что */
export function playSfx(kind: SfxKind, now = performance.now()): boolean {
  const { enabled, volume } = useSettingsStore.getState().sound
  if (!enabled || volume <= 0) return false
  const prev = lastAt[kind]
  if (kind === 'click' && prev !== undefined && now - prev < MIN_GAP_MS) return false   // дробь кликов — один звук
  lastAt[kind] = now
  count++
  if (typeof document !== 'undefined') {
    document.documentElement.dataset.sfxLast = kind
    document.documentElement.dataset.sfxCount = String(count)
  }
  backend(kind, volume)
  return true
}

/** Сброс счётчика и паузы (тесты) */
export function resetSfxState(): void {
  for (const k of SFX_KINDS) delete lastAt[k]
  count = 0
  if (typeof document !== 'undefined') { delete document.documentElement.dataset.sfxLast; delete document.documentElement.dataset.sfxCount }
}
