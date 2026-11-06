// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from 'vitest'

const fetch = vi.fn()
vi.stubGlobal('fetch', fetch)
vi.stubGlobal('defineNuxtPlugin', (value: unknown) => value)
vi.stubGlobal('useNuxtApp', () => ({ payload: { config: { app: { buildId: 'current' } } } }))
vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
const { default: plugin } = await import('../../app/plugins/build-freshness.client')

beforeEach(() => {
  fetch.mockReset().mockResolvedValue({ ok: true, text: async () => '{"buildId":"current"}' })
  vi.restoreAllMocks()
})

describe('workspace build checks', () => {
  it('does not add background document fetches to a client banner presentation', () => {
    window.history.replaceState({}, '', `/share/banner/p_${'a'.repeat(32)}`)
    const listen = vi.spyOn(window, 'addEventListener').mockImplementation(() => {})
    plugin()
    expect(listen).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
  it('retains build freshness checks for the signed-in workspace', async () => {
    window.history.replaceState({}, '', '/agency/banner-studio')
    const listen = vi.spyOn(window, 'addEventListener').mockImplementation(() => {})
    vi.spyOn(document, 'addEventListener').mockImplementation(() => {})
    plugin()
    const focus = listen.mock.calls.find(([event]) => event === 'focus')![1] as () => Promise<void>
    await focus()
    expect(fetch).toHaveBeenCalledWith('/agency/banner-studio', expect.objectContaining({ cache: 'no-store' }))
  })
  it('stops workspace document checks after navigation to a client preview', async () => {
    window.history.replaceState({}, '', '/agency/banner-studio')
    const listen = vi.spyOn(window, 'addEventListener').mockImplementation(() => {})
    vi.spyOn(document, 'addEventListener').mockImplementation(() => {})
    plugin()
    window.history.replaceState({}, '', `/share/banner/p_${'a'.repeat(32)}`)
    const focus = listen.mock.calls.find(([event]) => event === 'focus')![1] as () => Promise<void>
    await focus()
    expect(fetch).not.toHaveBeenCalled()
  })
})
