import { ref } from 'vue'
import type { DesignBrandRequest, DesignLockChange } from '~~/shared/emailRendering/designBrand'
import type { readDesignBrandOptions } from '~~/server/utils/email-marketing/designBrand'
import type { TemplateDesignDraftRead } from '~~/server/utils/email-marketing/designReads'

export type EdmBrandOptions = Awaited<ReturnType<typeof readDesignBrandOptions>>
/** Keeps the exact request after unknown commit/readback outcomes. Options
 * refresh never rewrites a pending expected revision or selects a new kit. */
export function useEdmDesignBrand() {
  const options = ref<EdmBrandOptions | null>(null)
  const busy = ref(false)
  const error = ref('')
  const hasPending = ref(false)
  let pending: DesignBrandRequest | null = null
  let pendingUncertain = false
  let loadSequence = 0
  async function load(draftId: string) {
    const sequence = ++loadSequence
    error.value = ''
    options.value = null
    try {
      const result = await $fetch<EdmBrandOptions>(`/api/email/design/drafts/${draftId}/brand`)
      if (sequence === loadSequence && result.draftId === draftId) options.value = result
    } catch {
      if (sequence === loadSequence) error.value = 'Brand controls are unavailable for this saved draft or your current permissions.'
    }
  }
  async function execute(request: DesignBrandRequest): Promise<Extract<TemplateDesignDraftRead, { state: 'structured' }> | null> {
    if (busy.value) return null
    if (pending && JSON.stringify(pending) !== JSON.stringify(request)) throw new Error('Reconcile the previous brand or lock action first.')
    if (!pending) pendingUncertain = false
    pending ??= JSON.parse(JSON.stringify(request)) as DesignBrandRequest
    busy.value = true
    hasPending.value = true
    error.value = ''
    let acknowledged = false
    try {
      const retained = pending
      const receipt = await $fetch<{ documentId: string, revisionId: string }>(`/api/email/design/drafts/${retained.draftId}/${retained.command === 'apply-brand' ? 'brand' : 'locks'}`, { method: 'POST', body: retained })
      acknowledged = true
      if (receipt.documentId !== retained.draftId) throw new Error('Receipt target conflict')
      const result = await $fetch<{ draft: TemplateDesignDraftRead }>(`/api/email/design/drafts/${receipt.documentId}`)
      if (result.draft.state !== 'structured' || result.draft.headRevisionId !== receipt.revisionId || result.draft.projection.state !== 'current') throw new Error('Readback conflict')
      pending = null
      hasPending.value = false
      await load(receipt.documentId)
      return result.draft
    } catch (failure) {
      const status = (failure as { statusCode?: number, status?: number }).statusCode ?? (failure as { status?: number }).status
      if (!pendingUncertain && !acknowledged && status !== undefined && status >= 400 && status < 500) {
        pending = null
        hasPending.value = false
      } else pendingUncertain = true
      error.value = hasPending.value ? 'This action is unconfirmed. Reconcile it before saving or applying another change.' : 'This action was rejected. Reload the draft and brand options before trying again.'
      return null
    } finally { busy.value = false }
  }
  function applyBrand(kitId: string) {
    const current = options.value, kit = current?.kits.find(k => k.id === kitId)
    if (!current || !kit || pending) return Promise.resolve(null)
    return execute({ version: 1, command: 'apply-brand', operationId: crypto.randomUUID(), draftId: current.draftId, expectedRevisionId: current.revisionId, kitId, kitDigest: kit.digest })
  }
  function setLock(lock: DesignLockChange) {
    const current = options.value
    if (!current?.canManageLocks || pending) return Promise.resolve(null)
    return execute({ version: 1, command: 'set-design-lock', operationId: crypto.randomUUID(), draftId: current.draftId, expectedRevisionId: current.revisionId, lock })
  }
  return { options, busy, error, hasPending, load, applyBrand, setLock, reconcile: () => pending ? execute(pending) : Promise.resolve(null) }
}
