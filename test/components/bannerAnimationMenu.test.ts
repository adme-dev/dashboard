// @vitest-environment happy-dom
import { createApp, h, nextTick, ref, computed, reactive, watch } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import LayerContextMenu from '../../app/components/banner/LayerContextMenu.vue'
import MotionPath from '../../app/components/banner/inspector/MotionPath.vue'
import type { BannerProject, Layer } from '../../app/types/banner-studio'
import { useBannerInspector } from '../../app/composables/useBannerInspector'
import { useBannerAnimationActions } from '../../app/composables/useBannerAnimationActions'

vi.stubGlobal('ref', ref)
vi.stubGlobal('computed', computed)
vi.stubGlobal('reactive', reactive)
vi.stubGlobal('watch', watch)
const { useBannerStudio } = await import('../../app/composables/useBannerStudio')
vi.stubGlobal('useBannerStudio', useBannerStudio)
vi.stubGlobal('useBannerInspector', useBannerInspector)
vi.stubGlobal('useBannerAnimationActions', useBannerAnimationActions)
const cleanup: (() => void)[] = []
afterEach(() => cleanup.splice(0).forEach(fn => fn()))

async function mount() {
  const studio = useBannerStudio()
  studio.loadProject({ id: 'menus', canvasData: { mrec: { layers: [{ id: 1, type: 'text', text: 'Original words', startTime: 0, endTime: 4 }] } } } as BannerProject)
  const layer = studio.activeLayers.value[0]!
  const host = document.createElement('div')
  const app = createApp({ render: () => h(LayerContextMenu, { layer, x: 10, y: 20, isDecomposing: false, animationTarget: studio.captureAnimationTarget(layer) }) })
  app.component('UDropdownMenu', { props: ['items'], template: '<div><template v-for="group in items"><button v-for="item in group" :disabled="item.disabled" @click="item.onSelect">{{ item.label }}</button></template></div>' })
  app.mount(host)
  cleanup.push(() => app.unmount())
  await nextTick()
  return { studio, layer, host, buttons: () => [...host.querySelectorAll('button')] }
}

describe('animation context menu contract', () => {
  it.each(['unpathed', 'mask', 'masked target'])('labels native motion controls and keeps Add Tween functional for %s', async (kind) => {
    const { studio } = await mount()
    studio.selectLayer(1)
    if (kind !== 'unpathed') {
      studio.activeLayers.value[0]!.motionPath = [{ x: 0, y: 0 }, { x: 100, y: 0 }]
      if (kind === 'mask') studio.activeLayers.value[0]!.isMask = true
      else studio.activeLayers.value.push({ id: 2, type: 'rect', isMask: true, maskTargetIds: [1] } as Layer)
    }
    const host = document.createElement('div')
    const app = createApp({ render: () => h(MotionPath) })
    app.component('UButton', { props: ['label', 'disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}<slot/></button>' })
    app.component('UFormField', { props: ['label'], template: '<label>{{ label }}<slot/></label>' })
    app.component('UInput', { props: ['modelValue'], emits: ['update:modelValue'], template: '<input :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"/>' })
    app.component('USelect', { template: '<select/>' })
    app.component('USlider', { template: '<span/>' })
    app.component('UCheckbox', { template: '<span/>' })
    app.component('UIcon', { template: '<span/>' })
    app.component('BannerEasingCurveEditor', { template: '<span/>' })
    app.mount(host)
    cleanup.push(() => app.unmount())
    const add = [...host.querySelectorAll('button')].find(el => el.textContent?.trim() === 'Add Tween')
    expect(add).toBeDefined()
    add!.click()
    await nextTick()
    expect(studio.activeLayers.value[0]!.motionPathTweens).toHaveLength(kind === 'unpathed' ? 1 : 2)
    const waypoint = host.querySelector<HTMLInputElement>('input[aria-label="Waypoint 1 X"]')
    expect(waypoint).not.toBeNull()
    waypoint!.value = '75'
    waypoint!.dispatchEvent(new Event('change'))
    expect(studio.activeLayers.value[0]!.motionPath![1]!.x).toBe(75)
    expect(host.querySelector('input[aria-label="Tween 1 start time"]')).not.toBeNull()
  })
  it('offers both native actions and Animate leaves document/history untouched', async () => {
    const { studio, buttons } = await mount()
    const before = studio.getCanvasData()
    expect(buttons().map(el => el.textContent)).toContain('Animate')
    expect(buttons().map(el => el.textContent)).toContain('Add Tween')
    buttons().find(el => el.textContent === 'Animate')!.click()
    expect(studio.state.selectedLayerId).toBe(1)
    expect(useBannerInspector().inspectorTab.value).toBe('animation')
    expect(studio.getCanvasData()).toEqual(before)
    expect(studio.canUndo.value).toBe(false)
  })

  it('Add Tween selects the new editable tween and has one reversible persisted edit', async () => {
    const { studio, buttons } = await mount()
    const before = studio.getCanvasData()
    const add = buttons().find(el => el.textContent === 'Add Tween')
    expect(add).toBeDefined()
    add!.click()
    expect(studio.activeLayers.value[0]!.motionPathTweens).toHaveLength(1)
    expect(studio.state.selectedTween).toEqual({ layerId: 1, tweenIndex: 0 })
    expect(useBannerInspector().inspectorTab.value).toBe('animation')
    studio.undo()
    expect(studio.getCanvasData()).toEqual(before)
    expect(studio.canUndo.value).toBe(false)
  })

  it('a queued old action cannot edit a different format with the same layer ID', async () => {
    const { studio, layer } = await mount()
    const actions = useBannerAnimationActions().menuItems(studio.captureAnimationTarget(layer), () => {})
    studio.state.sets.leaderboard = { layers: [{ ...layer, text: 'Other format' } as Layer] }
    studio.setActiveArtboard('leaderboard')
    const before = studio.getCanvasData()
    actions[0]!.onSelect()
    actions[1]!.onSelect()
    expect(studio.getCanvasData()).toEqual(before)
    expect(studio.state.selectedLayerId).toBeNull()
    expect(studio.canUndo.value).toBe(false)
  })
})
