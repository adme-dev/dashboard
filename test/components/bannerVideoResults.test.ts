// @vitest-environment happy-dom
import { createApp, h, nextTick, computed, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import VideoResults from '~~/app/components/banner/VideoResults.client.vue'
import { bannerRenderSuggestions } from '~~/app/utils/bannerRenderSuggestions'
import type { ExportJob } from '~~/app/utils/bannerExportPoll'

const fetchMock = vi.fn()
const toast = vi.fn()
const cleanups: Array<() => void> = []
const job = (values: Partial<ExportJob> = {}): ExportJob => ({ jobId: 'job-1', formatKey: 'mrec', status: 'failed', url: null, fileSize: null, error: 'Render failed', canRetry: true, ...values })
async function settle() {
  for (let i = 0; i < 8; i++) await nextTick()
}
async function mount(extra: Record<string, unknown> = {}) {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const blocked = vi.fn()
  const pendingFormats = vi.fn()
  const app = createApp({ render: () => h(VideoResults, { projectId: 'project-video', clientId: 'client-video', completed: [], open: true, onBlocked: blocked, onPendingFormats: pendingFormats, ...extra }) })
  app.component('UButton', { props: ['label', 'disabled'], emits: ['click'], template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>' })
  app.component('UAlert', { props: ['title', 'description'], template: '<p role="alert">{{ title }} {{ description }}</p>' })
  app.component('UBadge', { template: '<span><slot/></span>' })
  app.mount(host)
  let stopped = false
  const stop = () => {
    if (stopped) return
    stopped = true
    app.unmount()
    host.remove()
  }
  cleanups.push(stop)
  await settle()
  const button = (label: string) => [...host.querySelectorAll('button')].find(b => b.textContent === label)
  return { host, blocked, pendingFormats, button, stop }
}
beforeEach(() => {
  fetchMock.mockReset()
  toast.mockReset()
  for (const [name, value] of Object.entries({ computed, onBeforeUnmount, reactive, ref, watch })) vi.stubGlobal(name, value)
  vi.stubGlobal('$fetch', fetchMock)
  vi.stubGlobal('useToast', () => ({ add: toast }))
  vi.stubGlobal('navigateTo', vi.fn().mockResolvedValue(undefined))
})
afterEach(() => {
  cleanups.splice(0).forEach(stop => stop())
  vi.unstubAllGlobals()
})

describe('saved banner video results', () => {
  it('retries the same saved job once and refreshes after acceptance', async () => {
    let finish!: () => void
    fetchMock.mockImplementation((url: string) => url.endsWith('/retry')
      ? new Promise<void>((resolve) => { finish = resolve })
      : Promise.resolve({ jobs: [job()] }))
    const view = await mount()
    const retry = view.button('Retry render')!
    retry.click()
    retry.click()
    await settle()
    expect(retry.disabled).toBe(true)
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/retry'))).toHaveLength(1)
    expect(fetchMock).toHaveBeenCalledWith('/api/agency/banner-studio/export-video/jobs/job-1/retry', { method: 'POST' })
    finish()
    await settle()
    expect(fetchMock.mock.calls.filter(([url]) => url.endsWith('/jobs'))).toHaveLength(2)
    expect(view.button('Retry render')?.disabled).toBe(false)
  })

  it('preserves the known job status on retry error until history refresh resolves', async () => {
    let finishRefresh!: (value: unknown) => void
    let reads = 0
    fetchMock.mockImplementation((url: string) => {
      if (url.endsWith('/retry')) return Promise.reject(new Error('Queue response lost'))
      if (++reads === 1) return Promise.resolve({ jobs: [job()] })
      return new Promise((resolve) => {
        finishRefresh = resolve
      })
    })
    const view = await mount()
    view.button('Retry render')!.click()
    await settle()
    expect(view.host.textContent).toContain('failed')
    expect(view.button('Retry render')?.disabled).toBe(true)
    finishRefresh({ jobs: [job({ status: 'queued', canRetry: false, error: 'Submission unconfirmed' })] })
    await settle()
    expect(view.host.textContent).toContain('queued')
    expect(view.button('Retry render')).toBeUndefined()
    expect(view.pendingFormats).toHaveBeenLastCalledWith(['mrec'])
    expect(toast.mock.calls[0][0].title).toBe('Could not confirm render retry')
  })

  it('reports pending format keys separately without blocking unrelated formats', async () => {
    fetchMock.mockResolvedValue({ jobs: [job({ status: 'rendering', canRetry: true }), job({ jobId: 'done', formatKey: 'ig_port', status: 'done', canRetry: true, url: '/video.mp4' })] })
    const view = await mount()
    expect(view.blocked).toHaveBeenLastCalledWith(false)
    expect(view.pendingFormats).toHaveBeenLastCalledWith(['mrec'])
    expect(view.button('Retry render')).toBeUndefined()
  })

  it('uses stored copy for the actual video after reopening instead of a newer modal suggestion', async () => {
    const ready = job({ status: 'done', url: '/video.mp4', canRetry: false })
    bannerRenderSuggestions.remember('project-video', 'client-video', [ready.jobId], { caption: 'Original video caption', suggestedSchedule: 'Friday' })
    fetchMock.mockImplementation((url: string) => Promise.resolve(url.endsWith('/social-draft') ? { postId: 'post-1', clientId: 'client-video' } : { jobs: [ready] }))
    const first = await mount()
    first.stop()
    const reopened = await mount({ socialSuggestion: { caption: 'New unrelated design' } })
    reopened.button('Create social draft')!.click()
    await settle()
    const draft = fetchMock.mock.calls.find(([url]) => url.endsWith('/social-draft'))!
    expect(draft[1].body).toEqual({ renderJobId: 'job-1', socialSuggestion: { caption: 'Original video caption', suggestedSchedule: 'Friday' } })
  })

  it('does not recover another client’s stored copy after project reassignment', async () => {
    const ready = job({ status: 'done', url: '/video.mp4', canRetry: false })
    bannerRenderSuggestions.remember('project-video', 'client-video', [ready.jobId], { caption: 'Client A copy' })
    fetchMock.mockImplementation((url: string) => Promise.resolve(url.endsWith('/social-draft') ? { postId: 'post-2', clientId: 'client-b' } : { jobs: [ready] }))
    const view = await mount({ clientId: 'client-b', socialSuggestion: { caption: 'Stale prop' } })
    view.button('Create social draft')!.click()
    await settle()
    const draft = fetchMock.mock.calls.find(([url]) => url.endsWith('/social-draft'))!
    expect(draft[1].body.socialSuggestion).toBeUndefined()
  })
})
