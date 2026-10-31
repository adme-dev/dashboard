// @vitest-environment happy-dom
import * as Vue from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import Picker from '~/components/banner/TimelineAnimationPicker.vue'
import type { TimelinePhase } from '~/utils/banner-timeline-phases'
import type { Layer } from '~/types/banner-studio'

for (const [name, value] of Object.entries(Vue)) vi.stubGlobal(name, value)
const { useBannerStudio } = await import('~/composables/useBannerStudio')
let cleanup: (() => void) | undefined
afterEach(() => { cleanup?.(); vi.restoreAllMocks() })
async function mount(layer: Partial<Layer>, phase?: TimelinePhase) {
  const studio = useBannerStudio()
  studio.loadProject({ id: 'picker-test', canvasData: { mrec: { layers: [{ id: 1, name: 'Imported heading', type: 'text', text: 'Hello', x: 0, y: 0, w: 100, h: 30, opacity: 1, zIndex: 1, startTime: 0, endTime: 3, animIn: 'fadeIn', animInDur: 0.5, ...layer }] } } } as any)
  vi.stubGlobal('useBannerStudio', () => studio)
  vi.stubGlobal('useBannerRealtime', () => ({ isLayerLockedByOther: () => false }))
  vi.stubGlobal('useBannerInspector', () => ({ inspectorTab: Vue.ref('background') }))
  const previewAnimation = vi.fn()
  const stopAnimationPreview = vi.fn()
  const animationPreview = Vue.ref<{ layerId: number, start: number, end: number } | null>(null)
  vi.stubGlobal('useBannerTimeline', () => ({ pauseTimeline: vi.fn(), seekTo: vi.fn(), playTimeline: vi.fn(), previewAnimation, animationPreview, stopAnimationPreview }))
  const host = document.createElement('div'); document.body.append(host)
  let picker: any
  const app = Vue.createApp({ setup: () => () => Vue.h(Picker, {
    ref: (value: unknown) => { picker = value },
    layer: studio.activeLayers.value[0],
    direction: phase?.direction ?? 'in',
    phase
  }) })
  app.component('UButton', { props: ['label'], setup: (p, { attrs, slots }) => () => Vue.h('button', attrs, p.label || slots.default?.()) })
  app.component('UPopover', { props: ['open'], setup: (p, { slots }) => () => Vue.h('div', [slots.default?.(), p.open ? slots.content?.() : null]) })
  app.component('UFormField', { props: ['label'], setup: (p, { slots }) => () => Vue.h('label', [p.label, slots.default?.()]) })
  app.component('UInput', { props: ['modelValue'], emits: ['update:modelValue'], setup: (p, { attrs, emit }) => () => Vue.h('input', { ...attrs, value: p.modelValue, onInput: (e: any) => emit('update:modelValue', e.target.value) }) })
  app.component('USelect', { props: ['modelValue', 'items'], emits: ['update:modelValue'], setup: (p, { emit }) => () => Vue.h('select', { value: p.modelValue, onChange: (e: any) => emit('update:modelValue', e.target.value) }, p.items.map((i: any) => Vue.h('option', { value: i.value }, i.label))) })
  app.component('UTabs', { props: ['modelValue', 'items'], emits: ['update:modelValue'], setup: (p, { emit }) => () => Vue.h('div', p.items.map((i: any) => Vue.h('button', { onClick: () => emit('update:modelValue', i.value) }, i.label))) })
  app.component('UIcon', { render: () => null })
  app.component('UAlert', { props: ['title', 'description'], setup: p => () => Vue.h('p', `${p.title} ${p.description}`) })
  app.component('UCheckbox', { props: ['label', 'modelValue'], emits: ['update:modelValue'], setup: (p, { emit }) => () => Vue.h('label', [p.label, Vue.h('input', { type: 'checkbox', checked: p.modelValue, onChange: (e: any) => emit('update:modelValue', e.target.checked) })]) })
  app.mount(host); picker.openPicker(); await Vue.nextTick()
  cleanup = () => { app.unmount(); host.remove() }
  const click = async (name: string) => { const b = [...host.querySelectorAll('button')].find(b => b.textContent === name); expect(b, name).toBeTruthy(); b!.click(); await Vue.nextTick() }
  const change = async (label: string, value: string) => { const control = [...host.querySelectorAll('label')].find(l => l.textContent?.startsWith(label))!.querySelector('input,select') as HTMLInputElement; control.value = value; control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); await Vue.nextTick() }
  return { studio, host, click, change, previewAnimation, animationPreview, stopAnimationPreview }
}

it('opens the clicked imported phase at its changing property without replacing any frames', async () => {
  const keyframes = {
    opacity: [{ time: 0, value: 0.15 }, { time: 10, value: 0.15 }],
    scaleX: [{ time: 5, value: 8 }, { time: 6, value: 1 }, { time: 10, value: 1 }]
  }
  const { studio, host } = await mount({ startTime: 5, endTime: 10, keyframes }, { kind: 'entry', start: 5, end: 6, label: 'Entry · Keyframes', direction: 'in' })
  await Vue.nextTick()
  expect(host.textContent).toContain('Entry · Keyframes · 5.00–6.00s')
  expect(host.querySelector('select')!.value).toBe('scaleX')
  expect(studio.state.selectedLayerId).toBe(1)
  expect(studio.activeLayers.value[0]!.keyframes).toEqual(keyframes)
})

it('uses the theme foreground for transparent hold blocks', async () => {
  const { host } = await mount({}, { kind: 'hold', start: 1, end: 2, label: 'Hold', direction: 'in' })
  const trigger = host.querySelector<HTMLButtonElement>('button[aria-label^="Edit Hold"]')!
  expect(trigger.style.color).toBe('var(--ui-text)')
})

it('edits imported keyframes in the pop-up without replacing the rest of the motion, and undo restores them', async () => {
  const keyframes = { opacity: [{ time: 0, value: 0 }, { time: 1, value: 1 }], x: [{ time: 0, value: -50 }, { time: 2, value: 0 }] }
  const { studio, host, change } = await mount({ keyframes })
  expect(host.textContent).toContain('Animated property')
  await change('Keyframe', '1'); await change('Time (seconds)', '1.5')
  expect(studio.activeLayers.value[0].keyframes?.opacity?.[1].time).toBe(1.5)
  expect(studio.activeLayers.value[0].keyframes?.x).toEqual(keyframes.x)
  studio.undo(); await Vue.nextTick()
  expect(studio.activeLayers.value[0].keyframes?.opacity?.[1].time).toBe(1)
})

it('requires an explicit choice before replacing imported motion, including motion paths', async () => {
  const keyframes = { opacity: [{ time: 0, value: 0 }, { time: 1, value: 1 }] }
  const { studio, host, click } = await mount({ keyframes, motionPath: [{ x: 0, y: 0 }, { x: 10, y: 10 }] })
  await click('Presets'); await click('Zoom In')
  expect(studio.activeLayers.value[0].keyframes).toEqual(keyframes)
  expect(host.textContent).toContain('Replace custom motion with Zoom In?')
  await click('Keep current motion')
  expect(studio.activeLayers.value[0].keyframes).toEqual(keyframes)
  await click('Zoom In'); await click('Replace with Zoom In')
  expect(studio.activeLayers.value[0]).toMatchObject({ animIn: 'zoomIn', animOut: 'none' })
  expect(studio.activeLayers.value[0].keyframes).toBeUndefined()
  expect(studio.activeLayers.value[0].motionPath).toBeUndefined()
  studio.undo(); await Vue.nextTick()
  expect(studio.activeLayers.value[0].keyframes).toEqual(keyframes)
})

it('filters native presets, keeps the pop-up open and adjusts duration', async () => {
  const { studio, host, click, change } = await mount({})
  await change('Search animations', 'nothing-matches')
  expect(host.textContent).toContain('No matching animations')
  await change('Search animations', 'zoom'); await click('Zoom In')
  expect(studio.activeLayers.value[0].animIn).toBe('zoomIn')
  await click('Build'); await change('Duration (seconds)', '0.8')
  expect(studio.activeLayers.value[0].animInDur).toBe(0.8)
})

it('opens audio controls instead of visual animation presets and clamps volume', async () => {
  const { studio, host, change } = await mount({ type: 'audio', volume: 1, src: 'https://example.com/audio.mp3' })
  expect(host.textContent).toContain('Loop within this clip')
  expect(host.textContent).not.toContain('Search animations')
  await change('Volume (%)', '50')
  expect(studio.activeLayers.value[0].volume).toBe(0.5)
  await change('Volume (%)', '150')
  expect(studio.activeLayers.value[0].volume).toBe(1)
})

it('inserts a boundary keyframe in a native preset instead of leaving a non-playing single frame', async () => {
  const { studio, click } = await mount({})
  await click('Build')
  await click('Add keyframe at 0.00s')
  expect(studio.activeLayers.value[0]!.keyframes?.opacity?.length).toBeGreaterThanOrEqual(2)
  expect(studio.state.selectedKeyframe).toMatchObject({ layerId: 1, property: 'opacity', index: 0 })
})

it('adds a middle Blink without replacing entrance, exit or other property tracks', async () => {
  const keyframes = { opacity: [{ time: 0, value: 0 }, { time: 1, value: 1 }, { time: 4, value: 1 }, { time: 5, value: 0 }], x: [{ time: 0, value: -50 }, { time: 1, value: 0 }] }
  const { studio, click, host } = await mount({ endTime: 5, keyframes }, { kind: 'hold', start: 1, end: 4, label: 'Hold', direction: 'in' })
  expect(host.textContent).toContain('Middle')
  expect(host.textContent).not.toContain('Replace custom motion')
  await click('Blink')
  const result = studio.activeLayers.value[0]!
  expect(result.keyframes?.x).toEqual(keyframes.x)
  expect(result.keyframes?.opacity?.at(-1)).toEqual({ time: 5, value: 0 })
  expect(result.keyframes?.opacity?.some(frame => frame.time > 1 && frame.time < 2.2 && frame.value < 1)).toBe(true)
  expect(result.animationClips).toEqual([{ start: 1, end: 2.2, label: 'Blink' }])
  studio.undo()
  expect(studio.activeLayers.value[0]!.keyframes).toEqual(keyframes)
})

it('previews exactly the clicked block through the isolated animation transport', async () => {
  const { studio, click, previewAnimation } = await mount({ endTime: 10 }, { kind: 'entry', start: 0, end: 0.8, label: 'Entry · Keyframes', direction: 'in' })
  studio.state.currentTime = 5
  await click('Preview')
  expect(previewAnimation).toHaveBeenCalledWith(1, { start: 0, end: 0.8 })
  expect(studio.state.currentTime).toBe(5)
})

it('offers Stop preview for a running isolated animation', async () => {
  const { click, animationPreview, stopAnimationPreview, previewAnimation } = await mount({})
  animationPreview.value = { layerId: 1, start: 0, end: 0.5 }
  await Vue.nextTick()
  await click('Stop preview')
  expect(stopAnimationPreview).toHaveBeenCalledOnce()
  expect(previewAnimation).not.toHaveBeenCalled()
})
