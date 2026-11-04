// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { withBannerPreviewAudio } from '~/utils/banner-preview-audio'

afterEach(() => {
  document.body.innerHTML = ''
  vi.restoreAllMocks()
})

describe('sandboxed preview sound control', () => {
  it('accepts mute changes only from its host and reports blocked audio without silencing other tracks', async () => {
    document.body.innerHTML = '<audio></audio><audio></audio>'
    const [blocked, healthy] = [...document.querySelectorAll('audio')]
    const denied = vi.spyOn(blocked!, 'play').mockRejectedValue(new DOMException('Denied', 'NotAllowedError'))
    const playing = vi.spyOn(healthy!, 'play').mockResolvedValue()
    const parent = { postMessage: vi.fn() }
    const receive = vi.fn()
    const fakeWindow = { parent, addEventListener: receive }
    const script = new DOMParser().parseFromString(withBannerPreviewAudio('<body></body>'), 'text/html').querySelector('script')!.textContent!
    new Function('window', 'document', script)(fakeWindow, document)
    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'banner-preview-audio', status: 'ready' }, '*')
    expect(blocked!.muted).toBe(true)
    const listener = receive.mock.calls[0]![1]
    listener({ source: {}, data: { type: 'banner-preview-sound', muted: false } })
    expect(blocked!.muted).toBe(true)
    listener({ source: parent, data: { type: 'banner-preview-sound', muted: false } })
    expect(blocked!.muted).toBe(false)
    await blocked!.play()
    await blocked!.play()
    await healthy!.play()
    expect(denied).toHaveBeenCalledTimes(1)
    expect(playing).toHaveBeenCalledTimes(1)
    expect(parent.postMessage).toHaveBeenCalledWith({ type: 'banner-preview-audio', status: 'blocked' }, '*')
    listener({ source: parent, data: { type: 'banner-preview-sound', muted: true } })
    expect(healthy!.muted).toBe(true)
    await blocked!.play()
    expect(denied).toHaveBeenCalledTimes(2)
  })
})
