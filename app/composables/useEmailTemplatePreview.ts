import { onScopeDispose, ref, watch } from 'vue'
import type { EmailTemplate } from '~~/shared/pageStudio/emailTemplates'

export interface EmailPreviewInput { template: EmailTemplate, pageId: string, formId: string }
export interface EmailPreviewResult { html: string, subject: string, preheader: string, warnings?: string[] }

/** Preview only: latest input wins, even if the transport ignores cancellation. */
export function useEmailTemplatePreview(input: () => EmailPreviewInput | null, request: (input: EmailPreviewInput, signal: AbortSignal) => Promise<EmailPreviewResult>) {
  const preview = ref<EmailPreviewResult | null>(null)
  const status = ref<'idle' | 'waiting' | 'loading' | 'ready' | 'error'>('idle')
  const error = ref('')
  let timer: ReturnType<typeof setTimeout> | undefined
  let controller: AbortController | undefined
  let sequence = 0
  let disposed = false
  function cancel() {
    sequence++
    clearTimeout(timer)
    timer = undefined
    controller?.abort()
    controller = undefined
  }
  async function refresh() {
    cancel()
    preview.value = null
    error.value = ''
    const value = input()
    if (disposed || !value) {
      status.value = 'idle'
      return
    }
    const ticket = sequence
    const snapshot: EmailPreviewInput = JSON.parse(JSON.stringify(value))
    controller = new AbortController()
    status.value = 'loading'
    try {
      const result = await request(snapshot, controller.signal)
      if (disposed || ticket !== sequence) return
      preview.value = result
      status.value = 'ready'
    } catch {
      if (disposed || ticket !== sequence) return
      error.value = 'Preview is unavailable. Refresh to try again. Your draft has not changed.'
      status.value = 'error'
    }
  }
  watch(input, (value) => {
    cancel()
    preview.value = null
    error.value = ''
    status.value = value ? 'waiting' : 'idle'
    if (value) timer = setTimeout(() => {
      void refresh()
    }, 400)
  }, { immediate: true, deep: true, flush: 'sync' })
  onScopeDispose(() => {
    disposed = true
    cancel()
  })
  return { preview, status, error, refresh }
}
