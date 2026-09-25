// src/platform/debug-mode.test.ts — UB3-3: детекция debug-режима для выдачи токенов
import { describe, it, expect } from 'vitest'
import {
  DEBUG_DEFAULT_TOKENS,
  DEBUG_MAX_TOKENS,
  parseDebugTokensSearch,
  parseDebugPayload,
  getDebugTokensGrant,
} from './debug-mode'

describe('parseDebugTokensSearch', () => {
  it('без параметров → null (в релизе ничего не выдаём)', () => {
    expect(parseDebugTokensSearch('')).toBeNull()
    expect(parseDebugTokensSearch('?draft=true&lang=ru')).toBeNull()
  })

  it('debug-mode (значение любое, в т.ч. 16) → стартовый счёт 3000', () => {
    expect(parseDebugTokensSearch('?debug-mode=16&draft=true&lang=ru')).toBe(DEBUG_DEFAULT_TOKENS)
    expect(parseDebugTokensSearch('debug-mode')).toBe(DEBUG_DEFAULT_TOKENS)
  })

  it('debug-tokens=N → точное число (приоритет над debug-mode)', () => {
    expect(parseDebugTokensSearch('?debug-mode=16&debug-tokens=500')).toBe(500)
  })

  it('debug-tokens капится DEBUG_MAX_TOKENS, мусор/ноль/отрицательные → fallback на debug-mode', () => {
    expect(parseDebugTokensSearch('?debug-tokens=999999999')).toBe(DEBUG_MAX_TOKENS)
    expect(parseDebugTokensSearch('?debug-mode=16&debug-tokens=abc')).toBe(DEBUG_DEFAULT_TOKENS)
    expect(parseDebugTokensSearch('?debug-tokens=0')).toBeNull()
    expect(parseDebugTokensSearch('?debug-tokens=-5')).toBeNull()
  })
})

describe('parseDebugPayload', () => {
  it('payload с debug-tokens=N → N', () => {
    expect(parseDebugPayload('debug-tokens=1234')).toBe(1234)
    expect(parseDebugPayload('{"x":1} debug-tokens:42')).toBe(42)
  })

  it('payload с маркером debug → 3000', () => {
    expect(parseDebugPayload('debug')).toBe(DEBUG_DEFAULT_TOKENS)
    expect(parseDebugPayload('debug-mode=16')).toBe(DEBUG_DEFAULT_TOKENS)
  })

  it('обычный payload / не-строка → null', () => {
    expect(parseDebugPayload('promoId=abc')).toBeNull()
    expect(parseDebugPayload(undefined)).toBeNull()
    expect(parseDebugPayload({})).toBeNull()
  })
})

describe('getDebugTokensGrant (мультиканальный детектор)', () => {
  it('обычный черновик: ни один канал не содержит параметров → null', () => {
    expect(
      getDebugTokensGrant({
        search: '?draft=true&lang=ru',
        referrer: 'https://yandex.ru/games/app/572445/',
        payload: undefined,
      }),
    ).toBeNull()
  })

  it('собственный URL iframe приоритетнее referrer/payload', () => {
    expect(
      getDebugTokensGrant({
        search: '?debug-tokens=100',
        referrer: 'https://yandex.ru/games/app/1/?debug-mode=16',
        payload: 'debug-tokens=999',
      }),
    ).toBe(100)
  })

  it('канал document.referrer: debug-mode на странице Яндекс Игр', () => {
    expect(
      getDebugTokensGrant({
        search: '',
        referrer: 'https://yandex.ru/games/app/572445/?debug-mode=16&draft=true&lang=ru',
        payload: undefined,
      }),
    ).toBe(DEBUG_DEFAULT_TOKENS)
  })

  it('канал payload: маркер debug-tokens в ysdk.environment.payload', () => {
    expect(
      getDebugTokensGrant({
        search: '',
        referrer: '',
        payload: 'debug-tokens=3000',
      }),
    ).toBe(3000)
  })
})
