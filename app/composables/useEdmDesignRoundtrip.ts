import { ref } from 'vue'
import type { EdmFlyhubDocument } from '~~/app/types/edm'
import { validateEmailDesign, type EmailDesignDocument } from '~~/shared/emailRendering/designContract'
import { applyDesignerOperations, type DesignerCapabilities, type DesignerOperation } from '~~/shared/emailRendering/designDesigner'
import type { DesignModuleRequest } from '~~/shared/emailRendering/designModules'
import type { DesignHandoff } from '~~/shared/emailRendering/designRoundtrip'
import type { TemplateDesignDraftRead } from '~~/server/utils/email-marketing/designReads'

interface RequestFailure { statusCode?: number, status?: number, statusMessage?: string, message?: string, data?: { statusMessage?: string } }

const contentEndpoint = '/api/email/design/roundtrip'
const designerEndpoint = '/api/email/design/designer'
type HandoffResult = { handoff: DesignHandoff, capabilities?: DesignerCapabilities }
interface DesignerAvailability { available: boolean, endpoint: string, capabilities: DesignerCapabilities | null }

/** Keeps operation payloads after uncertain replies. Retry uses the same action;
 * editing a pending write requires reconciliation before a new operation. */
export function useEdmDesignRoundtrip() {
  const libraryAuthoring = ref({ available: false, publisher: false })
  const mode = ref<'content' | 'designer'>('content')
  const designerAuthoring = ref<DesignerAvailability>({ available: false, endpoint: designerEndpoint, capabilities: null })
  const designerCapabilities = ref<DesignerCapabilities | null>(null)
  const designerOperationId = ref<string | null>(null)
  const endpoint = () => mode.value === 'designer' ? designerEndpoint : contentEndpoint
  const adoptHandoff = (result: HandoffResult) => {
    handoff.value = result.handoff
    designerCapabilities.value = result.capabilities ?? null
    if (mode.value === 'designer') designerOperationId.value ??= crypto.randomUUID()
    return result.handoff
  }
  const draft = ref<TemplateDesignDraftRead | null>(null)
  const handoff = ref<DesignHandoff | null>(null)
  const busy = ref(false)
  const error = ref('')
  const hasPending = ref(false)
  let pending: { url: string, method: 'POST' | 'PATCH', body: unknown } | null = null

  async function mutate<T>(url: string, method: 'POST' | 'PATCH', body: unknown, readback?: (result: T) => Promise<unknown>): Promise<T> {
    if (pending && (pending.url !== url || pending.method !== method || JSON.stringify(pending.body) !== JSON.stringify(body)))
      throw new Error('A previous save needs reconciliation. Retry that action before making another change.')
    pending ??= { url, method, body: JSON.parse(JSON.stringify(body)) }
    hasPending.value = true
    let result: T
    try {
      result = await $fetch<T>(url, { method, body: pending.body })
    } catch (failure: unknown) {
      const cause = failure as RequestFailure
      const status = cause?.statusCode ?? cause?.status
      // A definite rejected request did not commit. Transport/server errors are
      // unknown outcomes and retain the exact operation until reconciled.
      if (status !== undefined && status >= 400 && status < 500) {
        pending = null
        hasPending.value = false
      }
      throw cause
    }
    // A confirmed mutation still needs its exact revision readback before the
    // composer may issue another write. Read failures never erase that receipt.
    await readback?.(result)
    pending = null
    hasPending.value = false
    return result
  }
  async function lookup(templateId: string, expectedRevisionId?: string) {
    const result = await $fetch<{ draft: TemplateDesignDraftRead | null, designerAuthoring?: DesignerAvailability, libraryAuthoring?: { available: boolean, publisher: boolean } }>(contentEndpoint, { method: 'POST', body: { command: 'lookup', templateId } })
    if (expectedRevisionId && result.draft?.headRevisionId !== expectedRevisionId)
      throw new Error('The draft changed in another editor. Reload before continuing.')
    draft.value = result.draft
    libraryAuthoring.value = result.libraryAuthoring?.available === true
      ? { available: true, publisher: result.libraryAuthoring.publisher === true }
      : { available: false, publisher: false }
    designerAuthoring.value = result.designerAuthoring?.available === true && result.designerAuthoring.endpoint === designerEndpoint
      ? result.designerAuthoring
      : { available: false, endpoint: designerEndpoint, capabilities: null }
    return result.draft
  }
  function operation<T>(url: string, build: () => T): T {
    const candidate = build()
    if (!pending) return candidate
    const identity = (body: unknown) => {
      const copy = JSON.parse(JSON.stringify(body))
      delete copy.operationId
      if (copy.action && typeof copy.action === 'object') delete copy.action.operationId
      // Initialization after an unknown open can already see the conversion's
      // new head. Reconcile the original open, never create another conversion.
      if (copy.command === 'open') delete copy.expectedRevisionId
      return JSON.stringify(copy)
    }
    if (pending.url !== url || identity(pending.body) !== identity(candidate))
      throw new Error('A previous save needs reconciliation. Retry that action before making another change.')
    return pending.body as T
  }
  async function saveStructured(document: EdmFlyhubDocument) {
    if (pending?.url.endsWith('/metadata') && draft.value) {
      const retained = pending
      const templateId = draft.value.templateId
      await mutate<{ revisionId: string }>(retained.url, retained.method, retained.body, result => lookup(templateId, result.revisionId))
    }
    const current = draft.value
    if (!current || current.state !== 'structured') throw new Error('Reload the structured draft before saving.')
    const url = `/api/email/design/drafts/${current.documentId}`
    const design = validateEmailDesign({ ...current.source, blocks: document })
    const body = operation(url, () => ({
      version: 1, action: 'save-draft', operationId: crypto.randomUUID(),
      scope: current.source.scope, draftId: current.documentId,
      expectedRevisionId: current.headRevisionId, design
    }))
    return mutate<{ revisionId: string }>(url, 'PATCH', body, result => lookup(current.templateId, result.revisionId))
  }
  async function saveMetadata(subject: string | null, previewText: string | null) {
    const current = draft.value
    if (!current || current.state !== 'structured') throw new Error('Reload the structured draft before saving.')
    const url = `/api/email/design/drafts/${current.documentId}/metadata`
    const body = operation(url, () => ({
      version: 1, operationId: crypto.randomUUID(), scope: current.source.scope,
      expectedRevisionId: current.headRevisionId, subject, previewText
    }))
    await mutate<{ revisionId: string }>(url, 'PATCH', body, result => lookup(current.templateId, result.revisionId))
  }
  async function open(templateId: string, clientId: string | null, authoring = false) {
    // A pending write keeps its mode and exact endpoint until reconciled.
    if (!pending) {
      if (authoring && !designerAuthoring.value.available) throw new Error('Designer authoring is unavailable for this draft.')
      mode.value = authoring ? 'designer' : 'content'
      designerOperationId.value = null
    }
    // One transaction initializes, converts and opens the saved draft.
    const body = operation(endpoint(), () => ({ command: 'start', operationId: crypto.randomUUID(), templateId, clientId }))
    const result = await mutate<HandoffResult>(endpoint(), 'POST', body, result => lookup(templateId, result.handoff.appliedRevisionId ?? result.handoff.baseRevisionId))
    return adoptHandoff(result)
  }
  async function resume(id: string, authoring = mode.value === 'designer') {
    if (pending) throw new Error('A previous save needs reconciliation. Retry that action before making another change.')
    if (handoff.value?.id !== id || (mode.value === 'designer') !== authoring) designerOperationId.value = null
    mode.value = authoring ? 'designer' : 'content'
    const result = await $fetch<HandoffResult>(endpoint(), { method: 'POST', body: { command: 'resume', handoffId: id } })
    return adoptHandoff(result)
  }
  async function propose(design: EmailDesignDocument) {
    const current = handoff.value
    if (mode.value !== 'content') throw new Error('Return designer operations for this design.')
    if (!current) throw new Error('Open the design again.')
    const body = operation(endpoint(), () => ({ command: 'propose', handoffId: current.id, action: {
      version: 1, action: 'propose-return', operationId: crypto.randomUUID(), scope: current.source.scope,
      draftId: current.draftId, baseRevisionId: current.baseRevisionId, design
    } }))
    handoff.value = (await mutate<HandoffResult>(endpoint(), 'POST', body)).handoff
  }
  type LibraryCommand = DesignModuleRequest extends infer Request ? Request extends DesignModuleRequest ? Omit<Request, 'version' | 'operationId' | 'draftId' | 'expectedDraftRevisionId'> : never : never
  async function library(command: LibraryCommand) {
    const current = draft.value
    if (!current || current.state !== 'structured' || !libraryAuthoring.value.available) throw new Error('Open a saved design draft to use shared modules.')
    const url = '/api/email/design/modules'
    const body = operation(url, () => ({ ...command, version: 1, operationId: crypto.randomUUID(), draftId: current.documentId, expectedDraftRevisionId: current.headRevisionId }))
    return mutate<{ documentId: string, revisionId: string, moduleId?: string, published: boolean }>(url, 'POST', body,
      result => lookup(current.templateId, result.published ? current.headRevisionId : result.revisionId))
  }
  async function proposeDesigner(operations: DesignerOperation[], operationId: string) {
    const current = handoff.value
    if (mode.value !== 'designer' || !current || operationId !== designerOperationId.value)
      throw new Error('Open the designer again before returning changes.')
    // This is bounded local feedback only; the server repeats the operation
    // derivation against its persisted baseline and fresh authority.
    applyDesignerOperations(current.source, operations, operationId)
    const body = operation(endpoint(), () => ({ command: 'propose', handoffId: current.id, action: {
      version: 1, action: 'propose-designer-return', operationId, scope: current.source.scope,
      draftId: current.draftId, baseRevisionId: current.baseRevisionId, operations
    } }))
    return adoptHandoff(await mutate<HandoffResult>(endpoint(), 'POST', body))
  }
  async function finish(command: 'apply' | 'cancel') {
    const current = handoff.value
    if (!current?.proposalRevisionId) throw new Error('Return a proposal before applying it.')
    const body = operation(endpoint(), () => ({ command, handoffId: current.id, action: {
      version: 1, action: command === 'apply' ? 'apply-return' : 'cancel-return', operationId: crypto.randomUUID(),
      scope: current.source.scope, proposalId: current.id, expectedProposalRevisionId: current.proposalRevisionId,
      ...(command === 'apply' ? { expectedDraftRevisionId: current.baseRevisionId } : {})
    } }))
    const result = await mutate<HandoffResult>(endpoint(), 'POST', body, command === 'apply'
      ? result => lookup(result.handoff.templateId, result.handoff.appliedRevisionId!)
      : undefined)
    return adoptHandoff(result)
  }
  async function reconcile() {
    if (!pending) return null
    const retained = pending
    const result = await mutate<{ handoff?: DesignHandoff, capabilities?: DesignerCapabilities, revisionId?: string }>(retained.url, retained.method, retained.body, async (receipt) => {
      if (receipt.handoff) await lookup(receipt.handoff.templateId, receipt.handoff.appliedRevisionId ?? receipt.handoff.baseRevisionId)
      else if (draft.value) await lookup(draft.value.templateId, receipt.revisionId)
    })
    if (result.handoff) {
      return adoptHandoff({ ...result, handoff: result.handoff })
    }
    return null
  }
  async function run<T>(action: () => Promise<T>) {
    if (busy.value) return
    busy.value = true
    error.value = ''
    try {
      return await action()
    } catch (failure: unknown) {
      const cause = failure as RequestFailure
      const code = cause?.data?.statusMessage ?? cause?.statusMessage
      error.value = code === 'REVISION_CONFLICT' || code === 'LEGACY_CONTENT_CHANGED'
        ? 'The draft changed after this design was opened. Keep the current draft and reopen FigFlow from it.'
        : code === 'NO_EDITABLE_CONTENT'
          ? 'This template has no content FigFlow can edit yet. Continue editing in the composer; your saved draft is unchanged.'
          : code === 'UNSUPPORTED_NATIVE_DESIGN'
            ? 'This design uses linked modules or a native source this content handoff cannot edit yet. Continue editing in the composer.'
            : code === 'DESIGNER_REQUIRED' || cause?.statusCode === 403
              ? 'You need design access for this client to open or return a FigFlow design.'
              : cause?.statusCode === 413
                ? 'This draft exceeds the FigFlow handoff limit. Reduce its content before opening FigFlow.'
                : code === 'invalid_design_request'
                  ? 'This draft contains content the FigFlow handoff cannot preserve yet. Continue editing in the composer.'
                  : code === 'PROPOSAL_EXPIRED'
                    ? 'This proposal expired. Your saved draft is unchanged; reopen FigFlow to continue.'
                    : cause?.message?.startsWith('A previous save') || cause?.message?.startsWith('The composer changed while saving') || cause?.message?.startsWith('The draft changed in another editor')
                      ? cause.message
                      : 'The action could not be confirmed. Retry the same action to reconcile it; your current composer content is kept.'
      throw cause
    } finally { busy.value = false }
  }
  return { libraryAuthoring, library, mode, designerAuthoring, designerCapabilities, designerOperationId, proposeDesigner, draft, handoff, busy, error, hasPending, reconcile, lookup, saveStructured, saveMetadata, open, resume, propose, finish, run }
}
