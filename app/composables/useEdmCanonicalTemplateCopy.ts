import { ref } from 'vue'
import type { DesignLibraryReceipt, DesignTemplateRequest } from '~~/shared/emailRendering/designTemplates'

export interface CanonicalTemplateSelection {
  id: string
  design_document_id?: string | null
  head_revision_id?: string | null
  revision_schema_version?: number | null
  folder_name?: string | null
}
type CopyRequest = Extract<DesignTemplateRequest, { command: 'copy-template-draft' }>
/** Existing library copy owner. Retains exact source/head/destination/action
 * across an unknown reply; a list refresh never becomes retry authority. */
export function useEdmCanonicalTemplateCopy() {
  const hasPending = ref(false)
  const receipt = ref<DesignLibraryReceipt | null>(null)
  let pending: CopyRequest | null = null
  let uncertain = false
  async function execute() {
    if (!pending) return null
    let result: DesignLibraryReceipt
    try {
      result = await $fetch<DesignLibraryReceipt>('/api/email/design/templates', { method: 'POST', body: pending })
    } catch (error) {
      const cause = error as { statusCode?: number, status?: number }
      const status = cause.statusCode ?? cause.status
      if (!uncertain && status && status >= 400 && status < 500) {
        pending = null
        hasPending.value = false
      } else uncertain = true
      throw error
    }
    uncertain = true
    if (!result.templateId) throw new Error('The saved draft receipt is incomplete.')
    const selected = await $fetch<{ draft: { documentId: string, headRevisionId: string } }>(
      '/api/email/design/roundtrip',
      { method: 'POST', body: { command: 'lookup', templateId: result.templateId } }
    )
    if (selected.draft?.documentId !== result.documentId || selected.draft.headRevisionId !== result.revisionId)
      throw new Error('The saved draft changed after the copy. Keep this action for exact reconciliation.')
    receipt.value = result
    pending = null
    uncertain = false
    hasPending.value = false
    return result
  }
  async function copy(source: CanonicalTemplateSelection, name: string, clientId: string | null) {
    if (!source.design_document_id || source.revision_schema_version !== 1 || !source.head_revision_id)
      throw new Error('A structured saved template is required for this copy.')
    const request: CopyRequest = {
      version: 1,
      command: 'copy-template-draft',
      operationId: pending?.operationId ?? crypto.randomUUID(),
      templateId: source.id,
      revisionId: source.head_revision_id,
      expectedSourceHeadRevisionId: source.head_revision_id,
      clientId,
      name,
      category: source.folder_name || null
    }
    if (pending && JSON.stringify(pending) !== JSON.stringify(request))
      throw new Error('Reconcile the previous template copy before changing it.')
    pending ??= request
    hasPending.value = true
    return execute()
  }
  return { copy, reconcile: execute, hasPending, receipt }
}
