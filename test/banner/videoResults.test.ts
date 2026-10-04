// @vitest-environment happy-dom
import { computed, createApp, defineComponent, h, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import VideoResults from '~~/app/components/banner/VideoResults.client.vue'

const job = (status: string) => ({ jobId: 'job', formatKey: 'ig_port', status, url: status === 'done' ? '/video' : null, error: null, fileSize: null })
const flush = async () => {
  for (let i = 0; i < 5; i++) await nextTick()
}
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})
describe('video export recovery UI', () => {
  it('shows pending stages, preserves jobs through failed reads, and recovers completion after reopening', async () => {
    vi.useFakeTimers()
    for (const [key, value] of Object.entries({ computed, ref, reactive, watch, onBeforeUnmount })) vi.stubGlobal(key, value)
    vi.stubGlobal('useToast', () => ({ add: vi.fn() }))
    const fetch = vi.fn().mockResolvedValue({ jobs: [job('queued')] })
    vi.stubGlobal('$fetch', fetch)
    const blocked = vi.fn()
    const props = reactive({ projectId: 'project', clientId: 'client', completed: [], open: true, onBlocked: blocked })
    const root = document.createElement('div')
    const app = createApp({ render: () => h(VideoResults, props) })
    app.component('UButton', defineComponent({ props: ['label'], setup: p => () => h('button', p.label) }))
    app.component('UBadge', defineComponent({ setup: (_, { slots }) => () => h('span', slots.default?.()) }))
    app.component('UAlert', defineComponent({ props: ['title', 'description'], setup: p => () => h('p', `${p.title} ${p.description}`) }))
    app.mount(root)
    await flush()
    expect(root.textContent).toContain('1 queued')
    expect(root.textContent).toContain('Portrait feed')
    expect(root.textContent).not.toContain('%')
    expect(blocked).toHaveBeenLastCalledWith(true)
    fetch.mockRejectedValueOnce(new Error('offline'))
    await vi.advanceTimersByTimeAsync(3000)
    expect(root.textContent).toContain('temporarily unavailable')
    expect(root.textContent).toContain('1 queued')
    expect(blocked).toHaveBeenLastCalledWith(true)
    fetch.mockResolvedValue({ jobs: [job('rendering')] })
    await vi.advanceTimersByTimeAsync(3000)
    expect(root.textContent).toContain('1 rendering')
    props.open = false
    await flush()
    const count = fetch.mock.calls.length
    await vi.advanceTimersByTimeAsync(10 * 60 * 1000)
    expect(fetch).toHaveBeenCalledTimes(count)
    fetch.mockResolvedValue({ jobs: [job('done')] })
    props.open = true
    await flush()
    expect(root.textContent).toContain('1 ready')
    expect(root.querySelector('video')?.getAttribute('src')).toBe('/video')
    expect(blocked).toHaveBeenLastCalledWith(false)
    expect(fetch.mock.calls.every(([url, options]) => url.endsWith('/jobs') && !options.method)).toBe(true)
    app.unmount()
  })
})
