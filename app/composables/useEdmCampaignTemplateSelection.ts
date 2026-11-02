import { ref } from 'vue'

export interface CampaignTemplateSelection {
  templateId: string
  revisionId: string
  clientId: string
  name: string
  subject?: string
}
/** Local request retention only. The existing server canonical/receipt owners
 * authorize and create the campaign; no mutable head lookup occurs at submit. */
export function useEdmCampaignTemplateSelection() {
  const busy = ref(false)
  const pending = ref(false)
  const error = ref('')
  let uncertain = false
  let request: Record<string, unknown> | null = null
  async function create(selection: CampaignTemplateSelection) {
    if (busy.value) return null
    busy.value = true
    error.value = ''
    request ??= { version: 1, command: 'create-from-template', operationId: crypto.randomUUID(), templateId: selection.templateId,
      revisionId: selection.revisionId, clientId: selection.clientId,
      campaign: { name: selection.name.trim(), ...(selection.subject?.trim() ? { subject: selection.subject.trim() } : {}) } }
    pending.value = true
    try {
      const receipt = await $fetch<{ campaignId: string, documentId: string, revisionId: string }>('/api/email/design/campaigns', { method: 'POST', body: JSON.parse(JSON.stringify(request)) })
      request = null
      uncertain = false
      pending.value = false
      return receipt
    } catch (failure) {
      const cause = failure as { statusCode?: number, status?: number }
      const status = cause.statusCode ?? cause.status
      // A server/transport failure may have committed. Keep the original exact
      // request, including name/client and selected immutable revision, for retry.
      if (!uncertain && status && status >= 400 && status < 500) {
        request = null
        pending.value = false
      } else uncertain = true
      error.value = pending.value ? 'The result is unconfirmed. Retry to find the campaign created by this action.' : 'The campaign could not be created. Refresh the selection and check client access.'
      throw failure
    } finally {
      busy.value = false
    }
  }
  return { busy, pending, error, create }
}
