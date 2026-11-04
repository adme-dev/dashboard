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
async function mount(layer: Partial<Layer>, phase?: TimelinePhase, addAtEnd = false) {
  const studio = useBannerStudio()
  studio.loadProject({ id: 'picker-test', canvasData: { mrec: { layers: [{ id: 1, name: 'Imported heading', type: 'text', text: 'Hello', x: 0, y: 0, w: 100, h: 30, opacity: 1, zIndex: 1, startTime: 0, endTime: 3, animIn: 'fadeIn', animInDur: 0.5, ...layer }] } } } as any)
  vi.stubGlobal('useBannerStudio', () => studio)
  vi.stubGlobal('useBannerRealtime', () => ({ isLayerLockedByOther: () => false }))
  vi.stubGlobal('useBannerInspector', () => ({ inspectorTab: Vue.ref('background') }))
  const previewAnimation = vi.fn()
  const stopAnimationPreview = vi.fn()
  const animationPreview = Vue.ref<{ layerId: number, start: number, end: number } | null>(null)
  vi.stubGlobal('useBannerTimeline', () => ({ pauseTimeline: vi.fn(), seekTo: vi.fn(), playTimeline: vi.fn(), currentLayerValue: (_layer: Layer, property: string) => property === 'opacity' || property.startsWith('scale') ? 1 : 0, previewAnimation, animationPreview, stopAnimationPreview }))
  const host = document.createElement('div'); document.body.append(host)
  let picker: any
  const app = Vue.createApp({ setup: () => () => Vue.h(Picker, {
    ref: (value: unknown) => { picker = value },
    layer: studio.activeLayers.value[0],
    direction: addAtEnd ? 'out' : phase?.direction ?? 'in',
    addAtEnd,
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
  const click = async (name: string) => { const b = [...host.querySelectorAll('button')].find(b => b.textContent?.trim() === name); expect(b, name).toBeTruthy(); if (b!.getAttribute('role') === 'tab') b!.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); b!.click(); await Vue.nextTick(); if (b!.getAttribute('role') === 'tab') await new Promise(resolve => setTimeout(resolve, 25)) }
  const change = async (label: string, value: string) => { const control = [...host.querySelectorAll('label')].find(l => l.textContent?.startsWith(label))!.querySelector('input,select') as HTMLInputElement; control.value = value; control.dispatchEvent(new Event(control.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); await Vue.nextTick() }
  return { studio, host, click, change, previewAnimation, animationPreview, stopAnimationPreview }
}

it('opens the clicked imported phase at its changing property without replacing any frames', async () => {
  const keyframes = {
    opacity: [{ time: 0, value: 0.15 }, { time: 10, value: 0.15 }],
    scaleX: [{ time: 5, value: 8 }, { time: 6, value: 1 }, { time: 10, value: 1 }]
  }
  const { studio, host } = await mount({ startTime: 5, endTime: 10, keyframes }, { kind: 'entry', start: 5, end: 6, label: 'Entry · Fade in + Scale down', direction: 'in' })
  await Vue.nextTick()
  expect(host.textContent).toContain('Entry · Fade in + Scale down · 5.00–6.00s')
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
  await click('Presets'); await click('Ken Burns')
  expect(studio.activeLayers.value[0].keyframes).toEqual(keyframes)
  expect(host.textContent).toContain('Replace custom motion with Ken Burns?')
  await click('Keep current motion')
  expect(studio.activeLayers.value[0].keyframes).toEqual(keyframes)
  await click('Ken Burns'); await click('Replace with Ken Burns')
  expect(studio.activeLayers.value[0]).toMatchObject({ animIn: 'kenBurns', animOut: 'none' })
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

it('shows the actual imported motion in a block without a supplied phase', async () => {
  const { host } = await mount({ keyframes: { opacity: [{ time: 0, value: 0 }, { time: 3, value: 1 }], rotation: [{ time: 0, value: 0 }, { time: 3, value: 90 }] } })
  const button = host.querySelector('button[aria-label^="Edit "]')!
  expect(button.getAttribute('aria-label')).toBe('Edit Fade in + Rotate for Imported heading')
  expect(button.textContent).toContain('Fade in + Rotate')
})

it('opens all existing exit options and adds the chosen preset at the end', async () => {
  const { studio, host, click } = await mount({ animOut: 'none', endTime: 4.2 }, undefined, true)
  expect(host.textContent).toContain('Exit animation')
  expect(host.textContent).toContain('Zoom Out')
  expect(host.textContent).toContain('Spin')
  expect(host.textContent).not.toContain('Blink')
  await click('Fade')
  expect(studio.activeLayers.value[0]).toMatchObject({ animIn: 'fadeIn', animOut: 'fadeOut', animOutStart: 3.7, outDur: 0.5 })
  studio.undo()
  expect(studio.activeLayers.value[0]!.animOut).toBe('none')
})

it('adds a zoom exit using existing keyframes without resetting imported entrance or motion', async () => {
  const keyframes = { opacity: [{ time: 0, value: 0 }, { time: 1, value: 1 }, { time: 4, value: 1 }], x: [{ time: 0, value: -50 }, { time: 1, value: 0 }] }
  const { studio, host, click } = await mount({ endTime: 4, keyframes }, undefined, true)
  expect(host.textContent).not.toContain('Replace custom motion')
  await click('Zoom Out')
  const result = studio.activeLayers.value[0]!
  expect(result.keyframes?.x).toEqual(keyframes.x)
  expect(result.keyframes?.opacity?.slice(0, 2)).toEqual(keyframes.opacity.slice(0, 2))
  expect(result.keyframes?.scaleX?.at(-1)).toEqual({ time: 4, value: 0.6 })
  expect(result.keyframes?.opacity?.at(-1)).toEqual({ time: 4, value: 0 })
  studio.undo()
  expect(studio.activeLayers.value[0]!.keyframes).toEqual(keyframes)
})

it('applies Bounce easing and preserves the existing exit and unrelated keyframes', async () => {
  const keyframes = { opacity: [{ time: 0, value: 0 }, { time: 0.5, value: 1 }, { time: 2.5, value: 1 }, { time: 3, value: 0 }], x: [{ time: 1, value: 0 }, { time: 2, value: 10 }] }
  const { studio, click } = await mount({ keyframes, animOut: 'fadeOut' }, { kind: 'entry', start: 0, end: 0.5, label: 'Entry', direction: 'in' })
  await click('Presets'); await click('Bounce')
  const layer = studio.activeLayers.value[0]!
  expect(layer.ease).toBe('bounce.out')
  expect(layer.keyframes!.y).toEqual([{ time: 0, value: 50, easing: 'bounce.out' }, { time: 0.5, value: 0, easing: 'none' }])
  expect(layer.keyframes!.x).toEqual(keyframes.x)
  expect(layer.keyframes!.opacity!.slice(-2)).toEqual(keyframes.opacity.slice(-2))
  studio.undo()
  expect(studio.activeLayers.value[0]!.keyframes).toEqual(keyframes)
})

it('offers Bounce in the middle without replacing the entrance', async () => {
  const { studio, click } = await mount({ endTime: 5 }, { kind: 'hold', start: 1, end: 4, label: 'Hold', direction: 'in' })
  await click('Bounce')
  const layer = studio.activeLayers.value[0]!
  expect(layer.animationClips!.map(clip => clip.label)).toContain('Bounce')
  expect(layer.animationClips!.map(clip => clip.label)).toContain('Entry · Fade')
  expect(layer.keyframes!.y!.some(frame => frame.easing === 'bounce.out')).toBe(true)
  expect(layer.animIn).toBe('fadeIn')
})


it('switches preview to the chosen exit while keeping the original block label', async () => {
  const { click, host, previewAnimation } = await mount({ endTime: 4, animOut: 'fadeOut', outDur: 0.5 }, { kind: 'hold', start: 0.5, end: 3.5, label: 'Hold', direction: 'in' })
  await click('Exit'); await click('Preview')
  expect(previewAnimation).toHaveBeenCalledWith(1, { start: 3.5, end: 4 })
  expect(host.querySelector('button[aria-label^="Edit Hold"]')).toBeTruthy()
})

it('reopens an authored middle Bounce with middle presets', async () => {
  const { host } = await mount({ endTime: 5, keyframes: { y: [{ time: 1, value: 0 }, { time: 1.6, value: -24 }, { time: 2.2, value: 0 }] } }, { kind: 'motion', start: 1, end: 2.2, label: 'Bounce', direction: 'in' })
  expect(host.querySelector('button[aria-label="Bounce middle animation"]')).toBeTruthy()
  expect(host.querySelector('button[aria-label="Elastic middle animation"]')).toBeTruthy()
})

it('removes a middle Pulse through the popup, keeps the layer, and supports Undo', async () => {
  const keyframes = { opacity: [{ time: 0, value: 0 }, { time: 0.5, value: 1 }, { time: 2.5, value: 1 }, { time: 3, value: 0 }], scaleX: [{ time: 1, value: 1 }, { time: 1.6, value: 1.08 }, { time: 2.2, value: 1 }], scaleY: [{ time: 1, value: 1 }, { time: 1.6, value: 1.08 }, { time: 2.2, value: 1 }] }
  const { studio, click } = await mount({ keyframes, animationClips: [{ start: 1, end: 2.2, label: 'Pulse' }] }, { kind: 'motion', start: 1, end: 2.2, label: 'Pulse', direction: 'in' })
  await click('Remove animation')
  expect(studio.activeLayers.value).toHaveLength(1)
  expect(studio.activeLayers.value[0]!.keyframes!.scaleX!.every(frame => frame.value === 1)).toBe(true)
  expect(studio.activeLayers.value[0]!.keyframes!.opacity).toEqual(keyframes.opacity)
  studio.undo()
  expect(studio.activeLayers.value[0]!.keyframes).toEqual(keyframes)
  expect(studio.activeLayers.value[0]!.animationClips![0]!.label).toBe('Pulse')
})
