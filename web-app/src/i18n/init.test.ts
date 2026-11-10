// src/i18n/init.test.ts — порядок определения языка (yandex-games): SDK (п. 2.14) → выбор
// переключателем (i18nextLng, clean-сборка, как в main) → язык браузера.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

const h = vi.hoisted(() => ({ sdk: null as null | { environment?: { i18n?: { lang?: string } } } }))
vi.mock('../platform/sdk', () => ({ getSdk: () => h.sdk }))

import { determineLanguage } from './init'

describe('determineLanguage', () => {
  let langSpy: ReturnType<typeof vi.spyOn> | null = null
  beforeEach(() => {
    h.sdk = null
    localStorage.clear()
    langSpy = vi.spyOn(navigator, 'language', 'get').mockReturnValue('ru-RU')
    vi.spyOn(console, 'log').mockImplementation(() => { })
  })
  afterEach(() => { vi.restoreAllMocks(); langSpy = null })

  it('без SDK и без выбора — язык браузера', () => {
    expect(determineLanguage()).toBe('ru')
  })

  it('без SDK — выбор переключателем (i18nextLng) важнее языка браузера', () => {
    localStorage.setItem('i18nextLng', 'en')
    expect(determineLanguage()).toBe('en')
  })

  it('язык SDK важнее выбора и браузера (п. 2.14)', () => {
    localStorage.setItem('i18nextLng', 'en')
    h.sdk = { environment: { i18n: { lang: 'ru' } } }
    expect(determineLanguage()).toBe('ru')
  })

  it('неизвестное значение i18nextLng — игнорируется', () => {
    localStorage.setItem('i18nextLng', 'de')
    expect(determineLanguage()).toBe('ru')
  })
})
