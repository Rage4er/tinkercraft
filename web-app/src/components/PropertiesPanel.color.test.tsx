// src/components/PropertiesPanel.color.test.tsx — U6: простая палитра доступна всегда,
// расширенный native picker — только при аренде extendedPalette/подписке.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import React from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { act } from 'react-dom/test-utils'

// ─── Моки платформы (до импортов) ────────────────────────────────────
const h = vi.hoisted(() => {
    const serverTime = 1_700_000_000_000
    return {
        serverTime,
        platform: {
            ysdk: {},
            init: vi.fn(async () => true),
            loadingReady: vi.fn(),
            showFullscreenAd: vi.fn(async () => false),
            showRewardedVideo: vi.fn(async () => false),
            getPlayer: () => null,
            isAuthorized: () => false,
            isYandexSdkReady: () => true,
            getPlatformType: () => 'yandex',
            saveData: vi.fn(async () => { }),
            loadData: vi.fn(async () => ({})),
            submitScore: vi.fn(async () => { }),
            getLeaderboardEntries: vi.fn(async () => []),
            startGameplay: vi.fn(),
            stopGameplay: vi.fn(),
            getServerTime: vi.fn(async () => serverTime),
            showBannerAdv: vi.fn(async () => ({ stickyAdvIsShowing: false })),
            hideBannerAdv: vi.fn(async () => ({ stickyAdvIsShowing: false })),
            getBannerAdvStatus: vi.fn(async () => ({ stickyAdvIsShowing: false })),
            dispose: vi.fn(),
        },
    }
})

vi.mock('../platform', () => ({
    getPlatform: () => h.platform,
    isEconomyAvailable: () => true,
    getPlatformType: () => 'yandex',
    initPlatform: async () => true,
}))

vi.mock('../platform/server-time', () => ({
    getServerTime: async () => h.serverTime,
    getCachedServerTime: () => h.serverTime,
    resetServerTimeCache: () => { },
    getServerTimeOffset: () => 0,
}))

// Кулдауны рекламы — заглушка (никаких таймеров в тесте)
vi.mock('../platform/ad-timers', () => ({
    useAdCooldown: () => ({ remainingMs: 0, formatted: null, active: false }),
}))

// ─── Импорты после моков ─────────────────────────────────────────────
import { useEconomyStore } from '../store/economy-store'
import { emptyAdRewards } from '../store/economy-store'
import PropertiesPanel from './PropertiesPanel'
import ColorPalette from './ColorPalette'
import type { SceneObject } from '../csg/types'

/** SceneObject-заглушка (куб) */
function makeCube(): SceneObject {
    return {
        id: 'obj-1',
        shapeType: 'cube',
        params: { width: 10, height: 10, depth: 10 },
        color: '#89b4fa',
        transform: { x: 0, y: 0, z: 0, rotX: 0, rotY: 0, rotZ: 0, scaleX: 1, scaleY: 1, scaleZ: 1 },
        visible: true,
        locked: false,
        vertices: new Float32Array(24),
        indices: new Uint32Array(36),
    }
}

function renderPanel(obj: SceneObject) {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
        root.render(
            <PropertiesPanel
                firstSelected={obj}
                busy={false}
                selectedIds={[obj.id]}
                canResize
                canFillet
                canCsg
                canAlign
                filletRadius={0}
                objectList={[obj]}
                operationsLength={0}
                fileName={null}
                currentProjectId={null}
                currentProjectName={null}
                modified={false}
                onSetFilletRadius={() => { }}
                onMoveAxis={() => { }}
                onRotAxis={() => { }}
                onScaleAxis={() => { }}
                onResizeDim={() => { }}
                onResizeObject={() => { }}
                onApplyFillet={() => { }}
                onCsg={() => { }}
                onAlign={() => { }}
                onSetColor={() => { }}
                onToggleVisible={() => { }}
                onShowProjects={() => { }}
                onSaveToProject={() => { }}
            />
        )
    })
    return { container, root }
}

describe('PropertiesPanel (U6: палитра доступна всегда)', () => {
    beforeEach(() => {
        localStorage.clear()
        useEconomyStore.setState({
            tokens: 100,
            lastDailyBonus: null,
            totalModelsCreated: 0,
            activeSubscription: null,
            subscriptionExpiresAt: null,
            rentals: { text3d: null, extendedPalette: null, disableBanner: null },
            adRewards: emptyAdRewards(),
            todayActions: 0,
            lastActionTimestamp: null,
            todayCashbacks: 0,
            todayExportHashes: [],
            todayQuestsCompleted: [],
            todayQuests: [],
            questTriggers: {} as never,
            lastExportHash: null,
            lastQuestResetDate: null,
            lastSavedData: '',
            pendingSync: false,
            syncTailPending: false,
            bannerVisible: false,
        })
    })

    it('рендерит простую палитру (Wad\'s Optimum 16) БЕЗ аренды', () => {
        const { container, root } = renderPanel(makeCube())
        // ColorPalette рендерит 16 swatch-кнопок
        const swatches = container.querySelectorAll('.color-palette-swatch')
        expect(swatches.length).toBe(16)
        act(() => { root.unmount() })
    })

    it('НЕ рендерит native color input без аренды', () => {
        const { container, root } = renderPanel(makeCube())
        expect(container.querySelector('input[type="color"]')).toBeNull()
        act(() => { root.unmount() })
    })

    it('рендерит расширенный native input ТОЛЬКО при аренде extendedPalette + toggle', () => {
        // Аренда extendedPalette активна
        useEconomyStore.setState({
            rentals: { text3d: null, extendedPalette: h.serverTime + 60_000, disableBanner: null },
        })
        const { container, root } = renderPanel(makeCube())
        // До клика native input скрыт, но палитра видна
        expect(container.querySelector('input[type="color"]')).toBeNull()
        // Клик по кнопке «Расширенный выбор» (advancedPicker)
        const advancedBtn = Array.from(container.querySelectorAll('button'))
            .find((b) => b.textContent?.includes('Advanced picker'))
        expect(advancedBtn).toBeTruthy()
        act(() => {
            advancedBtn?.dispatchEvent(new MouseEvent('click', { bubbles: true }))
        })
        // Теперь native input виден
        expect(container.querySelector('input[type="color"]')).toBeTruthy()
        act(() => { root.unmount() })
    })

    it('ColorPalette — отдельный компонент с 16 цветами', () => {
        const { container, root } = renderToContainerPalette()
        expect(container.querySelectorAll('.color-palette-swatch').length).toBe(16)
        act(() => { root.unmount() })
    })
})

function renderToContainerPalette() {
    const container = document.createElement('div')
    document.body.appendChild(container)
    const root = createRoot(container)
    act(() => {
        root.render(<ColorPalette selectedColor="#89b4fa" onChange={() => { }} />)
    })
    return { container, root }
}
