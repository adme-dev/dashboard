// @vitest-environment happy-dom
import { createApp, h, nextTick } from 'vue'
import { expect, it, vi } from 'vitest'
import Gallery from '~/components/banner/ClientSizeGallery.client.vue'
import type { ArtboardState } from '~/types/banner-studio'

it('plays all sizes together with one audible track and opens a specific size', async () => {
  const docs = { custom_300x250: '<body></body>', custom_728x90: '<body></body>' }
  const board = { layers: [{ type: 'audio', src: '/music.mp3' }] } as ArtboardState
  const focus = vi.fn()
  const app = createApp(Gallery, { documents: docs, canvas: { custom_300x250: board, custom_728x90: board }, onFocus: focus })
  app.component('BannerSavedViewerFrame', { render: () => h('iframe') })
  app.component('UButton', { props: ['label'], setup: props => () => h('button', props.label) })
  const host = document.body.appendChild(document.createElement('div'))
  app.mount(host)
  try {
    const frames = [...host.querySelectorAll('iframe')]
    expect(frames).toHaveLength(2)
    const send = frames.map((frame, i) => {
      const source = frame.contentWindow!
      window.dispatchEvent(new MessageEvent('message', { source, data: { type: 'banner-preview-playback', frameId: i + 1, commandId: 0, state: 'paused', duration: 3, current: 0, iteration: 1, repeat: 0 } }))
      return vi.spyOn(source, 'postMessage')
    })
    await nextTick()
    const play = [...host.querySelectorAll('button')].find(b => b.textContent === 'Play all')!
    expect(play.disabled).toBe(false)
    play.click()
    for (const [i, post] of send.entries()) {
      expect(post).toHaveBeenCalledWith({ type: 'banner-preview-sound', muted: i !== 0 }, '*')
      expect(post).toHaveBeenCalledWith(expect.objectContaining({ action: 'play', commandId: 1, frameId: i + 1 }), '*')
    }
    host.querySelector<HTMLButtonElement>('[aria-label="View 728 × 90"]')!.click()
    expect(focus).toHaveBeenCalledWith('custom_728x90')
  } finally {
    app.unmount()
    host.remove()
    vi.restoreAllMocks()
  }
})
