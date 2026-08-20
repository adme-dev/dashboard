// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, h, nextTick, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue'

import MarketingPlatformMarquee from '~~/app/components/MarketingPlatformMarquee.vue'
import MorphBlob from '~~/app/components/MorphBlob.vue'

Object.assign(globalThis, { nextTick, onBeforeUnmount, onMounted, ref, useId, watch })

const rows = [
  [
    { title: 'Boards', subtitle: 'Plan the work', to: '/platform/boards', bg: 'bg-pink-300', image: '/boards.jpg' },
    { title: 'Financials', subtitle: 'Track the money', to: '/platform/financials', bg: 'bg-emerald-300', image: '/financials.jpg' }
  ],
  [
    { title: 'Reporting', subtitle: 'See the results', to: '/platform/ai', bg: 'bg-sky-300', image: '/reporting.jpg' }
  ]
]

function mountMarquee() {
  const host = document.createElement('div')
  const app = createApp({ render: () => h(MarketingPlatformMarquee, { rows }) })

  app.component('NuxtLink', {
    inheritAttrs: false,
    props: ['to'],
    template: '<a :href="to" v-bind="$attrs"><slot /></a>'
  })
  app.component('UButton', {
    inheritAttrs: false,
    emits: ['click'],
    template: '<button type="button" v-bind="$attrs" @click="$emit(\'click\', $event)"><slot /></button>'
  })
  app.component('MorphBlob', {
    inheritAttrs: false,
    props: ['animate'],
    template: '<div data-morph-blob :data-animate="String(animate)" v-bind="$attrs"><slot /></div>'
  })

  app.mount(host)
  return { app, host }
}

describe('MarketingPlatformMarquee', () => {
  it('renders one accessible card per destination without duplicated content', () => {
    const { app, host } = mountMarquee()

    try {
      expect(host.querySelectorAll('.marquee-track')).toHaveLength(2)
      expect(host.querySelectorAll('.marquee-item')).toHaveLength(3)
      expect(host.querySelector('.marquee-motion-control')).not.toBeNull()

      const links = host.querySelectorAll('.marquee-item a')
      expect(links).toHaveLength(3)
      expect([...links].every(link => !link.hasAttribute('tabindex'))).toBe(true)

      expect(host.querySelectorAll('[data-morph-blob][data-animate="true"]')).toHaveLength(3)
      expect([...host.querySelectorAll('img')].every(image => image.getAttribute('decoding') === 'async')).toBe(true)
    } finally {
      app.unmount()
    }
  })

  it('lets visitors pause and resume both rows from one control', async () => {
    const { app, host } = mountMarquee()

    try {
      const button = host.querySelector('button') as HTMLButtonElement
      expect(button.getAttribute('aria-label')).toBe('Pause scrolling cards')
      expect(host.querySelectorAll('.marquee-track[data-paused="true"]')).toHaveLength(0)

      button.click()
      await nextTick()

      expect(button.getAttribute('aria-label')).toBe('Resume scrolling cards')
      expect(host.querySelectorAll('.marquee-track[data-paused="true"]')).toHaveLength(2)

      button.click()
      await nextTick()

      expect(button.getAttribute('aria-label')).toBe('Pause scrolling cards')
      expect(host.querySelectorAll('.marquee-track[data-paused="true"]')).toHaveLength(0)
    } finally {
      app.unmount()
    }
  })

  it('keeps hover feedback off transform layers used by the carousel and blob animation', () => {
    const { app, host } = mountMarquee()

    try {
      const card = host.querySelector('.marquee-item a') as HTMLAnchorElement
      const blob = host.querySelector('[data-morph-blob]') as HTMLElement

      expect(card.className).toContain('hover:shadow-2xl')
      expect(card.className).not.toContain('hover:-translate-y-1')
      expect(blob.className).not.toContain('group-hover:scale-[1.06]')
    } finally {
      app.unmount()
    }
  })
})

describe('MorphBlob animation control', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('does not start a frame loop when animation is disabled', () => {
    const requestAnimationFrame = vi.fn(() => 1)
    const cancelAnimationFrame = vi.fn()
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)

    const host = document.createElement('div')
    const app = createApp({ render: () => h(MorphBlob, { animate: false }) })
    app.mount(host)

    try {
      expect(requestAnimationFrame).not.toHaveBeenCalled()
    } finally {
      app.unmount()
    }
  })

  it('keeps animated blobs as the default outside the marquee', () => {
    const requestAnimationFrame = vi.fn(() => 1)
    const cancelAnimationFrame = vi.fn()
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', cancelAnimationFrame)

    const host = document.createElement('div')
    const app = createApp({ render: () => h(MorphBlob) })
    app.mount(host)

    try {
      expect(requestAnimationFrame).toHaveBeenCalledOnce()
    } finally {
      app.unmount()
    }

    expect(cancelAnimationFrame).toHaveBeenCalledWith(1)
  })

  it('keeps the blob moving after the initial spring motion has settled', async () => {
    let scheduledFrame: FrameRequestCallback | undefined
    const requestAnimationFrame = vi.fn((callback: FrameRequestCallback) => {
      scheduledFrame = callback
      return 1
    })
    vi.stubGlobal('requestAnimationFrame', requestAnimationFrame)
    vi.stubGlobal('cancelAnimationFrame', vi.fn())

    const host = document.createElement('div')
    const app = createApp({ render: () => h(MorphBlob, { seed: 7 }) })
    app.mount(host)

    try {
      for (let frame = 0; frame < 3600; frame++) {
        const callback = scheduledFrame
        expect(callback).toBeDefined()
        callback?.(frame * (1000 / 60))
      }
      await nextTick()
      const settledPath = host.querySelector('path')?.getAttribute('d')

      for (let frame = 3600; frame < 3720; frame++) {
        const callback = scheduledFrame
        expect(callback).toBeDefined()
        callback?.(frame * (1000 / 60))
      }
      await nextTick()

      expect(host.querySelector('path')?.getAttribute('d')).not.toBe(settledPath)
    } finally {
      app.unmount()
    }
  })
})
