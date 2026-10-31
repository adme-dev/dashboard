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
  vi.stubGlobal('useBannerInspector', () => ({ inspectorTab: Vue.ref('background') }))
  vi.stubGlobal('useBannerTimeline', () => ({ pauseTimeline: vi.fn(), seekTo: vi.fn(), playTimeline: vi.fn() }))
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
  return { studio, host, click, change }
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
