import { afterEach, describe, expect, it, vi } from 'vitest'
import { effectScope, ref } from 'vue'
import { useEmailTemplatePreview, type EmailPreviewInput, type EmailPreviewResult } from '../../app/composables/useEmailTemplatePreview'
import { starterEmailTemplate } from '../../shared/pageStudio/emailTemplates'

function fixture() {
  return { pageId: 'page_one', formId: 'form_one', template: starterEmailTemplate('team') }
}
function deferred() {
  let resolve!: (value: EmailPreviewResult) => void
  let reject!: (error: Error) => void
  const promise = new Promise<EmailPreviewResult>((yes, no) => {
    resolve = yes
    reject = no
  })
  return { promise, resolve, reject }
}
const result = (subject: string) => ({ subject, preheader: '', html: `<p>${subject}</p>` })
const scopes: ReturnType<typeof effectScope>[] = []
function setup(request = vi.fn<(input: EmailPreviewInput, signal: AbortSignal) => Promise<EmailPreviewResult>>().mockResolvedValue(result('Preview'))) {
  vi.useFakeTimers()
  const input = ref<EmailPreviewInput | null>(fixture())
  const scope = effectScope()
  scopes.push(scope)
  const preview = scope.run(() => useEmailTemplatePreview(() => input.value, request))!
  return { input, request, preview, scope }
}
afterEach(() => {
  scopes.splice(0).forEach(scope => scope.stop())
  vi.useRealTimers()
})

describe('live email template preview', () => {
  it('debounces edits, renders only the latest snapshot and never saves', async () => {
    const s = setup()
    await vi.advanceTimersByTimeAsync(200)
    s.input.value!.template.subject = 'Latest subject'
    await vi.advanceTimersByTimeAsync(399)
    expect(s.request).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(s.request).toHaveBeenCalledTimes(1)
    expect(s.request.mock.calls[0]![0].template.subject).toBe('Latest subject')
    expect(s.preview.status.value).toBe('ready')
  })
  it('ignores stale successes and failures, even when transport ignores abort', async () => {
    const old = deferred()
    const current = deferred()
    const request = vi.fn().mockReturnValueOnce(old.promise).mockReturnValueOnce(current.promise)
    const s = setup(request)
    await vi.advanceTimersByTimeAsync(400)
    s.input.value!.formId = 'form_two'
    expect(request.mock.calls[0]![1].aborted).toBe(true)
    await vi.advanceTimersByTimeAsync(400)
    current.resolve(result('Current form'))
    await Promise.resolve()
    old.reject(new Error('Old failure'))
    await Promise.resolve()
    expect(s.preview.preview.value?.subject).toBe('Current form')
    expect(s.preview.error.value).toBe('')
    const stale = deferred()
    request.mockReturnValueOnce(stale.promise)
    s.preview.refresh()
    s.input.value = null
    stale.resolve(result('Stale result'))
    await Promise.resolve()
    expect(s.preview.preview.value).toBeNull()
    expect(s.preview.status.value).toBe('idle')
  })
  it('pauses invalid input and cancels requests and timers on disposal', async () => {
    const s = setup()
    s.input.value = null
    await vi.advanceTimersByTimeAsync(400)
    expect(s.request).not.toHaveBeenCalled()
    s.input.value = fixture()
    s.scope.stop()
    await vi.advanceTimersByTimeAsync(400)
    expect(s.request).not.toHaveBeenCalled()
    const pending = deferred()
    const request = vi.fn().mockReturnValue(pending.promise)
    const t = setup(request)
    await vi.advanceTimersByTimeAsync(400)
    t.scope.stop()
    expect(request.mock.calls[0]![1].aborted).toBe(true)
    pending.resolve(result('After leaving'))
    await Promise.resolve()
    expect(t.preview.preview.value).toBeNull()
  })
  it('offers explicit refresh after failure without an automatic retry loop', async () => {
    const request = vi.fn().mockRejectedValueOnce(new Error('Unavailable')).mockResolvedValue(result('Recovered'))
    const s = setup(request)
    await vi.advanceTimersByTimeAsync(400)
    expect(s.preview.status.value).toBe('error')
    await vi.advanceTimersByTimeAsync(2000)
    expect(request).toHaveBeenCalledTimes(1)
    await s.preview.refresh()
    expect(s.preview.preview.value?.subject).toBe('Recovered')
    expect(s.preview.error.value).toBe('')
  })
})
