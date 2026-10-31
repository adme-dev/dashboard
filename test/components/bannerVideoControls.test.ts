// @vitest-environment happy-dom
import * as Vue from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import VideoInspector from '~/components/banner/inspector/Video.client.vue'
import TrimModal from '~/components/banner/VideoTrimModal.client.vue'
import type { BannerAsset, BannerProject, Layer } from '~/types/banner-studio'

for (const [name, value] of Object.entries(Vue)) vi.stubGlobal(name, value)
const { useBannerStudio } = await import('~/composables/useBannerStudio')
const cleanup: (() => void)[] = []
afterEach(() => {
  cleanup.splice(0).forEach(fn => fn())
  vi.restoreAllMocks()
})
const layer = (src = '/original.mp4'): Layer => ({
  id: 2,
  name: 'Video',
  type: 'video',
  src,
  linkId: 'video-source',
  x: 10,
  y: 20,
  w: 300,
  h: 200,
  opacity: 1,
  zIndex: 1,
  startTime: 2,
  endTime: 6,
  animIn: 'none',
  animInDur: 0,
  mediaStart: 1,
  mediaEnd: 5,
  mediaLoop: true,
  keyframes: {
    opacity: [
      { time: 2, value: 0 },
      { time: 3, value: 1 }
    ]
  }
})

async function mount(trim = false) {
  const studio = useBannerStudio()
  studio.loadProject({
    id: 'video-controls',
    canvasData: {
      mrec: { layers: [layer()] },
      leader: { layers: [layer('/other.mp4')] }
    }
  } as unknown as BannerProject)
  studio.selectLayer(2)
  const locked = Vue.ref(false)
  vi.stubGlobal('useBannerStudio', () => studio)
  vi.stubGlobal('useBannerTimeline', () => ({ pauseTimeline: vi.fn() }))
  vi.stubGlobal('useBannerRealtime', () => ({
    isLayerLockedByOther: () => locked.value
  }))
  vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
  vi.stubGlobal('safeMediaUrl', (url: string) => url)
  const applied = vi.fn()
  const open = Vue.ref(true)
  const host = document.createElement('div')
  document.body.append(host)
  let choose: (asset: BannerAsset) => void = () => {}
  const app = Vue.createApp({
    setup: () => () =>
      trim
        ? Vue.h(TrimModal, {
            'layer': studio.selectedLayer.value!,
            'open': open.value,
            'onUpdate:open': (value) => {
              open.value = value
            },
            'onApply': applied
          })
        : Vue.h(VideoInspector)
  })
  app.component('UButton', {
    props: ['label'],
    setup:
      (p, { attrs, slots }) =>
        () =>
          Vue.h('button', attrs, p.label || slots.default?.())
  })
  app.component('UModal', {
    props: ['open'],
    setup:
      (p, { slots }) =>
        () =>
          p.open ? Vue.h('div', [slots.body?.(), slots.footer?.()]) : null
  })
  app.component('UFormField', {
    props: ['label'],
    setup:
      (p, { slots }) =>
        () =>
          Vue.h('label', [p.label, slots.default?.()])
  })
  app.component('UInput', {
    props: ['modelValue'],
    emits: ['update:modelValue'],
    setup:
      (p, { attrs, emit }) =>
        () =>
          Vue.h('input', {
            ...attrs,
            value: p.modelValue,
            onInput: (e: Event) => emit('update:modelValue', (e.target as HTMLInputElement).value)
          })
  })
  app.component('USelect', { render: () => null })
  app.component('USlider', { render: () => null })
  app.component('UCheckbox', { render: () => null })
  app.component('UIcon', { render: () => null })
  app.component('UAlert', {
    props: ['title'],
    setup: p => () => Vue.h('p', p.title)
  })
  app.component('BannerVideoFilmstrip', { render: () => null })
  app.component('BannerVideoTrimModal', { render: () => null })
  app.component('BannerAssetsPanel', {
    emits: ['select'],
    setup: (_, { emit }) => {
      choose = asset => emit('select', asset)
      return () => null
    }
  })
  app.mount(host)
  await Vue.nextTick()
  cleanup.push(() => {
    app.unmount()
    host.remove()
  })
  const video = host.querySelector('video')!
  Object.defineProperty(video, 'duration', { value: 8, configurable: true })
  video.dispatchEvent(new Event('loadedmetadata'))
  await Vue.nextTick()
  const button = (label: string) =>
    [...host.querySelectorAll('button')].find(b => b.textContent === label)!
  const click = async (label: string) => {
    expect(button(label)).toBeTruthy()
    button(label).click()
    await Vue.nextTick()
  }
  const change = async (label: string, value: string) => {
    const input = [...host.querySelectorAll('label')]
      .find(l => l.textContent?.startsWith(label))!
      .querySelector('input')!
    input.value = value
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await Vue.nextTick()
  }
  return {
    studio,
    locked,
    host,
    button,
    click,
    change,
    applied,
    open,
    video,
    choose: (asset: Partial<BannerAsset>) => choose(asset as BannerAsset)
  }
}

it('replaces linked video sources, resets every old trim and preserves animation, placement and undo', async () => {
  const { studio, click, choose } = await mount()
  studio.state.layoutView = 'all'
  await click('Replace video')
  choose({
    url: '/replacement.mp4',
    name: 'Replacement',
    mimeType: 'video/mp4'
  })
  await Vue.nextTick()
  for (const key of ['mrec', 'leader'])
    expect(studio.state.sets[key].layers[0]).toMatchObject({
      src: '/replacement.mp4',
      mediaStart: 0,
      x: 10,
      y: 20,
      startTime: 2,
      endTime: 6,
      keyframes: layer().keyframes
    })
  expect(studio.state.sets.leader.layers[0].mediaEnd).toBeUndefined()
  studio.undo()
  await Vue.nextTick()
  expect(studio.state.sets.mrec.layers[0]).toMatchObject({
    src: '/original.mp4',
    mediaStart: 1,
    mediaEnd: 5
  })
  expect(studio.state.sets.leader.layers[0]).toMatchObject({
    src: '/other.mp4',
    mediaStart: 1,
    mediaEnd: 5
  })
})

it('keeps replacement scoped to Single edit and rejects non-video selections', async () => {
  const { studio, click, choose } = await mount()
  studio.state.layoutView = 'single'
  await Vue.nextTick()
  await click('Replace video')
  choose({ url: '/image.png', mimeType: 'image/png' })
  await Vue.nextTick()
  expect(studio.selectedLayer.value!.src).toBe('/original.mp4')
  choose({ url: '/new.mp4', mimeType: 'video/mp4' })
  await Vue.nextTick()
  expect(studio.state.sets.mrec.layers[0].src).toBe('/new.mp4')
  expect(studio.state.sets.leader.layers[0].src).toBe('/other.mp4')
})

it('rejects an in-flight replacement after selection or remote lock changes', async () => {
  const { studio, click, choose, locked, button } = await mount()
  await click('Replace video')
  locked.value = true
  await Vue.nextTick()
  choose({ url: '/new.mp4', mimeType: 'video/mp4' })
  expect(studio.selectedLayer.value!.src).toBe('/original.mp4')
  expect(button('Trim video').disabled).toBe(true)
  locked.value = false
  await Vue.nextTick()
  await click('Replace video')
  studio.state.activeKey = 'leader'
  await Vue.nextTick()
  choose({ url: '/new.mp4', mimeType: 'video/mp4' })
  expect(studio.state.sets.leader.layers[0].src).toBe('/other.mp4')
})

it('protects locked linked layouts during replacement while keeping local trim available', async () => {
  const { studio, button } = await mount()
  studio.state.sets.leader.layers[0].locked = true
  await Vue.nextTick()
  expect(button('Replace video').disabled).toBe(true)
  expect(button('Trim video').disabled).toBe(false)
  studio.state.layoutView = 'single'
  await Vue.nextTick()
  expect(button('Replace video').disabled).toBe(false)
})

it('previews trim edits locally, cancels without mutation, and applies only validated source times', async () => {
  const { studio, change, click, applied, open, button } = await mount(true)
  await change('Start (seconds)', '3')
  await change('End (seconds)', '4.5')
  expect(studio.selectedLayer.value!.mediaStart).toBe(1)
  await click('Cancel')
  expect(applied).not.toHaveBeenCalled()
  open.value = true
  await Vue.nextTick()
  const video = document.querySelector('video')!
  Object.defineProperty(video, 'duration', { value: 8, configurable: true })
  video.dispatchEvent(new Event('loadedmetadata'))
  await Vue.nextTick()
  await change('Start (seconds)', '7')
  await change('End (seconds)', '6')
  expect(button('Apply trim').disabled).toBe(true)
  await change('End (seconds)', '10')
  expect(button('Apply trim').disabled).toBe(true)
  await change('Start (seconds)', '2')
  await change('End (seconds)', '4.5')
  await click('Apply trim')
  expect(applied).toHaveBeenCalledExactlyOnceWith({
    mediaStart: 2,
    mediaEnd: 4.5
  })
})

it('stops trim preview at its out point and disables saving on media failure', async () => {
  const { video, click, button, applied } = await mount(true)
  vi.spyOn(video, 'play').mockResolvedValue()
  const pause = vi.spyOn(video, 'pause')
  await click('Preview clip')
  video.currentTime = 5.3
  video.dispatchEvent(new Event('timeupdate'))
  await Vue.nextTick()
  expect(pause).toHaveBeenCalled()
  expect(video.currentTime).toBe(5)
  video.dispatchEvent(new Event('error'))
  await Vue.nextTick()
  expect(button('Apply trim').disabled).toBe(true)
  expect(applied).not.toHaveBeenCalled()
})
