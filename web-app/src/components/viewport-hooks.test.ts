// src/components/viewport-hooks.test.ts — UB2-4: цвет рёбер фигур
// (edgeColorFor — базовый цвет объекта ×0.7, «на пару тонов темнее»)
import { describe, it, expect } from 'vitest'
import { edgeColorFor } from './viewport-hooks'

describe('edgeColorFor (UB2-4: рёбра на пару тонов темнее)', () => {
    it('затемняет каждый канал ×0.7', () => {
        // 255 × 0.7 = 178.5 → 179 = 0xb3
        expect(edgeColorFor('#ff0000')).toBe('#b30000')
        expect(edgeColorFor('#00ff00')).toBe('#00b300')
        expect(edgeColorFor('#ffffff')).toBe('#b3b3b3')
    })

    it('чёрный остаётся чёрным (темнее некуда)', () => {
        expect(edgeColorFor('#000000')).toBe('#000000')
    })

    it('принимает hex без решётки', () => {
        expect(edgeColorFor('89b4fa')).toBe('#607eaf')
    })

    it('невалидный цвет возвращает как есть (fallback)', () => {
        expect(edgeColorFor('not-a-color')).toBe('not-a-color')
        expect(edgeColorFor('')).toBe('')
    })

    it('сохраняет пропорции каналов (тот же оттенок, темнее)', () => {
        const base = '#89b4fa'
        const edge = edgeColorFor(base)
        // Красный канал заметно меньше зелёного и в базе, и в рёбрах
        const parse = (h: string) => [
            parseInt(h.slice(1, 3), 16),
            parseInt(h.slice(3, 5), 16),
            parseInt(h.slice(5, 7), 16),
        ]
        const [br, bg] = parse(base)
        const [er, eg] = parse(edge)
        expect(er / eg).toBeCloseTo(br / bg, 1)
    })
})
