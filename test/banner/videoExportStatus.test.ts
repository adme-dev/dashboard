// @vitest-environment happy-dom
import { computed, createApp, defineComponent, h, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import VideoExportStatus from '~~/app/components/banner/VideoExportStatus.client.vue'

const timestamp = '2026-11-05T01:00:00Z'
function job(status: string) {
  return {
    jobId: 'job-1', formatKey: 'ig_port', status,
    url: status === 'done' ? '/download' : null,
    fileSize: null, error: null,
    createdAt: timestamp, startedAt: status === 'queued' ? null : timestamp,
    updatedAt: timestamp
  }
}
async function flush() {
  for (let i = 0; i < 5; i++) await nextTick()
}

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('persistent Banner Studio MP4 status', () => {
  it('stays visible through queue, render and completion, then opens the export dialog', async () => {
    vi.useFakeTimers()
    vi.setSystemTime('2026-11-05T01:01:00Z')
    for (const [key, value] of Object.entries({ computed, ref, onMounted, onBeforeUnmount })) vi.stubGlobal(key, value)
    const fetch = vi.fn().mockResolvedValueOnce({ jobs: [job('queued')] })
      .mockResolvedValueOnce({ jobs: [job('rendering')] })
      .mockResolvedValue({ jobs: [job('done')] })
    vi.stubGlobal('$fetch', fetch)
    const open = vi.fn()
    const root = document.createElement('div')
    const app = createApp({ render: () => h(VideoExportStatus, { projectId: 'project-1', onOpen: open }) })
    app.component('UButton', defineComponent({ props: ['label'], emits: ['click'], setup: (p, { emit }) => () => h('button', { onClick: () => emit('click') }, p.label) }))
    app.component('UIcon', defineComponent({ setup: () => () => h('span') }))
    app.component('UProgress', defineComponent({ setup: () => () => h('div', { role: 'progressbar' }) }))
    app.mount(root)
    await flush()
    expect(root.textContent).toContain('1 queued')
    expect(root.textContent).toContain('Waiting 1m 00s')
    await vi.advanceTimersByTimeAsync(3000)
    expect(root.textContent).toContain('1 rendering')
    await vi.advanceTimersByTimeAsync(3000)
    expect(root.textContent).toContain('1 ready to download')
    expect(root.querySelector('[role="progressbar"]')).toBeNull()
    root.querySelectorAll('button')[1]?.click()
    expect(open).toHaveBeenCalledOnce()
    app.unmount()
  })
})
