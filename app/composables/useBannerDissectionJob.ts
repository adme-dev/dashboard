import { computed, ref } from 'vue'
import type { DissectionJob, DissectorManifest } from '~/types/banner-studio'
import { canImportDissection } from '../../shared/bannerDissectionReadiness'

type FetchJob = (url: string, options?: { method?: string, body?: unknown }) => Promise<unknown>
const base = '/api/agency/banner-studio/dissect'
const running = (job: DissectionJob | null) => !!job && ['queued', 'analyzing', 'segmenting'].includes(job.status)

export function dissectionFailureMessage(error: unknown, fallback: string): string {
  const message = (error as { data?: { statusMessage?: unknown } })?.data?.statusMessage
  return typeof message === 'string' ? message : fallback
}

/** A modal lifetime owns one selection; every asynchronous operation is fenced. */
export function useBannerDissectionJob(fetcher: FetchJob) {
  const current = ref<DissectionJob | null>(null)
  const history = ref<DissectionJob[]>([])
  const error = ref('')
  const busy = ref<'upload' | 'cancel' | 'retry' | ''>('')
  const loadingHistory = ref(false)
  const loadingCurrent = ref(false)
  const verified = ref(false)
  const cancellationRequested = ref(false)
  const cancelledJobs = new Set<string>()
  let visible = false
  let epoch = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  const valid = (token: number, id?: string) => visible && epoch === token && (!id || current.value?.jobId === id)
  const invalidate = () => {
    epoch++
    clearTimeout(timer)
    timer = undefined
    busy.value = ''
    loadingHistory.value = false
    loadingCurrent.value = false
    verified.value = false
  }
  const resultId = computed(() => current.value?.resultId || current.value?.execution?.resultId || '')
  const importReady = computed(() => !cancellationRequested.value && !busy.value && !loadingHistory.value
    && !loadingCurrent.value && verified.value && /^[a-f0-9]{64}$/i.test(resultId.value) && canImportDissection(current.value))
  const manifest = computed(() => {
    const job = current.value
    return job && Array.isArray(job.layers) && job.tokens && ['complete', 'review_ready'].includes(job.status)
      ? job as DissectorManifest
      : null
  })
  const canCancel = computed(() => !!current.value && !['failed', 'cancelled', 'imported'].includes(current.value.status))
  const canRetry = computed(() => !!current.value?.execution?.attemptId && ['failed', 'cancelled', 'review_ready'].includes(current.value.status)
    && (current.value.execution?.attempt ?? 0) < (current.value.execution?.maxAttempts ?? 3))

  function accept(job: DissectionJob) {
    if (cancelledJobs.has(job.jobId) && !['cancelled', 'failed', 'imported'].includes(job.status)) return
    verified.value = true
    current.value = job
    history.value = [job, ...history.value.filter(item => item.jobId !== job.jobId)].slice(0, 50)
  }
  function schedule(token: number, id: string) {
    if (!valid(token, id)) return
    clearTimeout(timer)
    if (running(current.value) && !cancellationRequested.value) {
      timer = setTimeout(() => {
        void poll(token, id)
      }, 2000)
    }
  }
  async function poll(token: number, id: string) {
    try {
      const result = await fetcher(`${base}/${encodeURIComponent(id)}`) as DissectionJob
      if (!valid(token, id)) return
      if (result.jobId !== id) throw new Error('Mismatched job')
      accept(result)
      error.value = ''
    } catch (cause) {
      if (valid(token, id)) error.value = dissectionFailureMessage(cause, 'Could not refresh this job. Reopen it to try again.')
    } finally { schedule(token, id) }
  }
  async function select(id: string) {
    invalidate()
    const token = epoch
    error.value = ''
    cancellationRequested.value = cancelledJobs.has(id)
    const summary: DissectionJob = history.value.find(job => job.jobId === id) ?? { jobId: id, status: 'queued' }
    current.value = {
      ...(current.value?.jobId === id ? current.value : {}),
      ...summary
    }
    loadingCurrent.value = true
    try {
      await poll(token, id)
    } finally { if (valid(token, id)) loadingCurrent.value = false }
  }
  async function resume() {
    invalidate()
    visible = true
    const token = epoch
    loadingHistory.value = true
    try {
      const result = await fetcher(`${base}/history`) as { dissections: DissectionJob[] }
      if (!valid(token)) return
      history.value = result.dissections.map(job => ({
        ...history.value.find(previous => previous.jobId === job.jobId), ...job
      }))
      const id = current.value?.jobId || history.value[0]?.jobId
      if (id) await select(id)
    } catch (cause) {
      if (valid(token)) error.value = dissectionFailureMessage(cause, 'Could not load saved jobs. Reopen to try again.')
    } finally { if (valid(token)) loadingHistory.value = false }
  }
  function suspend() {
    visible = false
    invalidate()
  }
  function newUpload() {
    invalidate()
    current.value = null
    cancellationRequested.value = false
    error.value = ''
  }
  async function upload(body: FormData) {
    if (busy.value || !visible) return
    invalidate()
    const token = epoch
    busy.value = 'upload'
    error.value = ''
    try {
      const result = await fetcher(`${base}/upload`, { method: 'POST', body }) as DissectionJob
      if (!valid(token)) return
      cancellationRequested.value = false
      accept(result)
      schedule(token, result.jobId)
    } catch (cause) {
      if (valid(token)) error.value = dissectionFailureMessage(cause, 'Could not upload image.')
    } finally { if (valid(token)) busy.value = '' }
  }
  async function cancel() {
    if (!current.value || busy.value || !visible) return
    const id = current.value.jobId
    invalidate()
    const token = epoch
    cancellationRequested.value = true
    cancelledJobs.add(id)
    busy.value = 'cancel'
    error.value = ''
    try {
      const result = await fetcher(`${base}/${encodeURIComponent(id)}/cancel`, { method: 'POST' }) as DissectionJob
      if (!valid(token, id)) return
      if (result.jobId !== id || !['cancelled', 'failed', 'imported'].includes(result.status)) throw new Error('Cancellation not confirmed')
      accept({ ...current.value, ...result })
    } catch (cause) {
      if (valid(token, id)) error.value = dissectionFailureMessage(cause, 'Cancellation was not confirmed. Try Cancel job again; import remains blocked.')
    } finally { if (valid(token, id)) busy.value = '' }
  }
  async function retry() {
    if (!current.value || !canRetry.value || busy.value || !visible) return
    const id = current.value.jobId
    const previousAttempt = current.value.execution!
    invalidate()
    const token = epoch
    busy.value = 'retry'
    error.value = ''
    try {
      const result = await fetcher(`${base}/process`, { method: 'POST', body: { jobId: id, retry: true, expectedAttemptId: previousAttempt.attemptId } }) as DissectionJob
      if (!valid(token, id)) return
      if (result.jobId !== id) throw new Error('Mismatched retry')
      cancelledJobs.delete(id)
      cancellationRequested.value = false
      accept(result)
      schedule(token, id)
    } catch (cause) {
      if (!valid(token, id)) return
      // A lost response does not prove submission failed. Read once; never replay POST.
      let recovered = false
      try {
        const saved = await fetcher(`${base}/${encodeURIComponent(id)}`) as DissectionJob
        if (!valid(token, id)) return
        if (saved.jobId !== id) throw new Error('Mismatched saved job', { cause })
        const newer = !!saved.execution?.attemptId && saved.execution.attemptId !== previousAttempt.attemptId
          && saved.execution.attempt > previousAttempt.attempt
        if (newer) {
          cancelledJobs.delete(id)
          cancellationRequested.value = false
        }
        accept(saved)
        recovered = newer
        schedule(token, id)
      } catch { /* Keep the reviewed findings and cancellation latch on failed recovery. */ }
      if (valid(token, id)) error.value = recovered
        ? 'The retry response was interrupted. Showing the saved job status.'
        : dissectionFailureMessage(cause, 'Could not confirm the retry. Reopen to check saved progress before trying again.')
    } finally { if (valid(token, id)) busy.value = '' }
  }
  return { current, history, error, busy, loadingHistory, loadingCurrent, manifest, importReady, resultId, cancellationRequested, canCancel, canRetry, resume, suspend, select, upload, cancel, retry, newUpload }
}
