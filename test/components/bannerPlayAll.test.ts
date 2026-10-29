// @vitest-environment happy-dom
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import PlayAll from '~/components/banner/PlayAll.client.vue'
import { useBannerTimeline } from '~/composables/useBannerTimeline'
import type { Layer } from '~/types/banner-studio'

let stop: (() => void) | undefined
afterEach(() => { stop?.(); stop = undefined; vi.unstubAllGlobals() })

it('mounts initially open without implicit Vue globals and plays only the selected layout soundtrack', async () => {
  const layer = { id: 1, type: 'audio', startTime: 0, endTime: 8 } as Layer
  const keys = ['mrec', 'leader', 'halfpage']
  const state = { activeKey: 'mrec', setKeys: keys, sets: Object.fromEntries(keys.map(key => [key, { layers: [layer], playback: { duration: 8, loopCount: 0 } }])), isPlaying: false, currentTime: 0 }
  vi.stubGlobal('useBannerStudio', () => ({ state, activeLayers: { value: [layer] } }))
  const transport = useBannerTimeline()
  const pause = vi.fn(transport.pauseTimeline)
  vi.stubGlobal('useBannerTimeline', () => ({ ...transport, pauseTimeline: pause }))
  const playing = new WeakSet<HTMLAudioElement>()
  const play = vi.fn(function(this: HTMLAudioElement) { playing.add(this); return Promise.resolve() })
  const fixtureArtboard = defineComponent({
    setup(_, { expose }) {
      const artboardEl = ref<HTMLElement>()
      expose({ artboardEl })
      return () => h('div', { ref: artboardEl }, [h('div', { id: 'lyr-1' }, [h('audio', { ref: (element: any) => {
        if (!element) return
        Object.defineProperties(element, {
          duration: { configurable: true, value: 8 },
          paused: { configurable: true, get: () => !playing.has(element) },
        })
        element.play = play
        element.pause = () => playing.delete(element)
      } })])])
    },
  })
  const host = document.createElement('div')
  document.body.append(host)
  const app = createApp(PlayAll, { open: true })
  app.component('UModal', { setup: (_, { slots }) => () => h('div', { role: 'dialog' }, slots.content?.()) })
  app.component('UButton', { props: ['icon'], setup: (props, { attrs, slots }) => () => h('button', { ...attrs, 'data-icon': props.icon }, slots.default?.()) })
  app.component('UIcon', { render: () => h('span') })
  app.component('UBadge', { setup: (_, { slots }) => () => h('span', slots.default?.()) })
  app.component('BannerArtboard', fixtureArtboard)
  app.mount(host)
  stop = () => { app.unmount(); transport.destroyTimeline(); host.remove() }
  for (let n = 0; n < 6; n++) await nextTick()
  expect(pause).toHaveBeenCalledOnce()
  expect(host.querySelectorAll('audio')).toHaveLength(3)
  expect(host.textContent).toContain('8.0s')
  ;(host.querySelector('[aria-label="Play all formats"]') as HTMLButtonElement).click()
  await nextTick()
  expect(play).toHaveBeenCalledOnce()
  expect([...host.querySelectorAll('audio')].filter(a => !a.paused)).toHaveLength(1)
  ;(host.querySelector('[aria-label="Pause all formats"]') as HTMLButtonElement).click()
  await nextTick()
  expect([...host.querySelectorAll('audio')].every(a => a.paused)).toBe(true)
  ;(host.querySelector('[aria-label="Play all formats"]') as HTMLButtonElement).click()
  await nextTick()
  const audio = [...host.querySelectorAll('audio')]
  stop(); stop = undefined
  expect(audio.every(a => a.paused)).toBe(true)
})
