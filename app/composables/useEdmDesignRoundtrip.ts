import { designReadOwner } from '~~/shared/emailRendering/designRoundtrip'
import { ref } from 'vue'
import { useEdmNativeLibrary } from './useEdmNativeLibrary'
import type { EdmFlyhubDocument } from '~~/app/types/edm'
import { validateEmailDesign, type EmailDesignDocument } from '~~/shared/emailRendering/designContract'
import { applyDesignerOperations, type DesignerCapabilities, type DesignerOperation } from '~~/shared/emailRendering/designDesigner'
import type { DesignTemplateRequest, DesignLibraryReceipt } from '~~/shared/emailRendering/designTemplates'
import { stableDesignJson, type DesignModuleRequest } from '~~/shared/emailRendering/designModules'
import type { DesignHandoff, DesignOwner } from '~~/shared/emailRendering/designRoundtrip'
import type { HandoffDraftRead, TemplateDesignDraftRead } from '~~/server/utils/email-marketing/designReads'

interface RequestFailure { statusCode?: number, status?: number, statusMessage?: string, message?: string, data?: { statusMessage?: string } }

const contentEndpoint = '/api/email/design/roundtrip'
const designerEndpoint = '/api/email/design/designer'
type HandoffResult = { handoff: DesignHandoff, capabilities?: DesignerCapabilities }
interface DesignerAvailability { available: boolean, endpoint: string, capabilities: DesignerCapabilities | null }

/** Keeps operation payloads after uncertain replies. Retry uses the same action;
 * editing a pending write requires reconciliation before a new operation. */
export function useEdmDesignRoundtrip() {
  const nativeLibrary = useEdmNativeLibrary()
  const libraryAuthoring = ref({ available: false, publisher: false })
  const campaignAuthoring = ref({ available: false, contentImagesAvailable: false })
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
  const draft = ref<HandoffDraftRead | null>(null)
  const handoff = ref<DesignHandoff | null>(null)
  const localBaseline = ref<string | null>(null)
  const setLocalBaseline = (snapshot: string) => {
    localBaseline.value = snapshot
  }
  const busy = ref(false)
  const error = ref('')
  const hasPending = ref(false)
  const lastCampaignPatch = ref<Record<string, unknown> | null>(null)
  const lastRecovery = ref<{ campaignId: string, documentId: string, revisionId: string } | null>(null)
  const lastLibraryReceipt = ref<DesignLibraryReceipt | null>(null)
  let pending: { url: string, method: 'POST' | 'PATCH', body: Record<string, unknown>, uncertain: boolean, readback?: (result: unknown) => Promise<unknown> } | null = null

  async function mutate<T>(url: string, method: 'POST' | 'PATCH', body: Record<string, unknown>, readback?: (result: T) => Promise<unknown>): Promise<T> {
    if (pending && (pending.url !== url || pending.method !== method || JSON.stringify(pending.body) !== JSON.stringify(body)))
      throw new Error('A previous save needs reconciliation. Retry that action before making another change.')
    pending ??= { url, method, body: JSON.parse(JSON.stringify(body)), uncertain: false, readback: readback as ((result: unknown) => Promise<unknown>) | undefined }
    hasPending.value = true
    let result: T
    try {
      result = await $fetch<T>(url, { method, body: pending.body })
    } catch (failure: unknown) {
      const cause = failure as RequestFailure
      const status = cause?.statusCode ?? cause?.status
      // A definite rejected request did not commit. Transport/server errors are
      // unknown outcomes and retain the exact operation until reconciled.
      if (!pending.uncertain && status !== undefined && status >= 400 && status < 500) {
        pending = null
        hasPending.value = false
      } else pending.uncertain = true
      throw cause
    }
    // A confirmed mutation still needs its exact revision readback before the
    // composer may issue another write. Read failures never erase that receipt.
    pending.uncertain = true
    await (pending.readback ?? readback)?.(result)
    pending = null
    hasPending.value = false
    return result
  }
  function sameOwner(a: string | DesignOwner, b: string | DesignOwner) {
    return stableDesignJson(typeof a === 'string' ? { kind: 'template', id: a } : a) === stableDesignJson(typeof b === 'string' ? { kind: 'template', id: b } : b)
  }
  async function lookup(templateId: string | DesignOwner, expectedRevisionId?: string) {
    const result = await $fetch<{ draft: HandoffDraftRead | null, campaignAuthoring?: { available: boolean, contentImagesAvailable?: boolean }, designerAuthoring?: DesignerAvailability, libraryAuthoring?: { available: boolean, publisher: boolean } }>(contentEndpoint, { method: 'POST', body: { command: 'lookup', ...(typeof templateId === 'string' ? { templateId } : { owner: templateId }) } })
    if (expectedRevisionId && result.draft?.headRevisionId !== expectedRevisionId)
      throw new Error('The draft changed in another editor. Reload before continuing.')
    draft.value = result.draft
    campaignAuthoring.value = { available: result.campaignAuthoring?.available === true, contentImagesAvailable: result.campaignAuthoring?.contentImagesAvailable === true }
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
      delete copy.operation_id
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
  async function saveCampaign(patch: Record<string, unknown>) {
    const current = draft.value
    if (current?.state !== 'structured' || designReadOwner(current).kind !== 'campaign') throw new Error('Reload the saved campaign before saving.')
    const target = designReadOwner(current)
    const url = `/api/email/campaigns/${target.id}`
    const body = operation(url, () => ({ ...patch, operation_id: crypto.randomUUID(), expected_design_revision_id: current.headRevisionId }))
    const { operation_id: _operation, expected_design_revision_id: _head, ...exactPatch } = JSON.parse(JSON.stringify(body))
    return mutate<{ campaign: { email_design_revision_id: string, design_receipt?: { revisionId: string } } }>(url, 'PATCH', body,
      async (result) => {
        await lookup(target, result.campaign.design_receipt?.revisionId ?? result.campaign.email_design_revision_id)
        lastCampaignPatch.value = exactPatch
      })
  }
  async function replaceCampaignImage(blockId: string, assetId: string) {
    const current = draft.value
    if (current?.state !== 'structured' || designReadOwner(current).kind !== 'campaign' || !campaignAuthoring.value.contentImagesAvailable)
      throw new Error('Registered image replacement is unavailable for this campaign.')
    const url = '/api/email/design/modules'
    const body = operation(url, () => ({ version: 1, command: 'replace-published-image', operationId: crypto.randomUUID(), draftId: current.documentId,
      expectedDraftRevisionId: current.headRevisionId, blockId, assetId }))
    return mutate<DesignLibraryReceipt>(url, 'POST', body, async (result) => {
      await lookup(designReadOwner(current), result.revisionId)
      lastLibraryReceipt.value = result
    })
  }
  async function recoverCampaign(name: string) {
    const current = handoff.value
    if (!current?.proposalRevisionId || current.owner?.kind !== 'campaign') throw new Error('Return a campaign proposal before creating a new campaign.')
    const body = operation(endpoint(), () => ({ command: 'save-proposal-as-new-draft', handoffId: current.id, action: {
      version: 1, action: 'save-proposal-as-new-draft', operationId: crypto.randomUUID(), scope: current.source.scope,
      proposalId: current.id, expectedProposalRevisionId: current.proposalRevisionId, name
    } }))
    return mutate<{ handoff: DesignHandoff, recovery: { campaignId: string, documentId: string, revisionId: string } }>(endpoint(), 'POST', body, async (result) => {
      const selected = await $fetch<{ draft: HandoffDraftRead }>(contentEndpoint, { method: 'POST', body: { command: 'lookup', owner: { kind: 'campaign', id: result.recovery.campaignId } } })
      const owner = selected.draft ? designReadOwner(selected.draft) : null
      // The receipt names the committed copy, whose current head may already
      // have advanced. Reconcile identity without rewinding or writing it.
      if (selected.draft?.documentId !== result.recovery.documentId || owner?.kind !== 'campaign' || owner.id !== result.recovery.campaignId) throw new Error('The recovered campaign could not be verified. Reload before continuing.')
      lastRecovery.value = result.recovery
    })
  }
  async function saveStructured(document: EdmFlyhubDocument) {
    if (pending?.url.endsWith('/metadata') && draft.value) {
      const retained = pending
      const templateId = designReadOwner(draft.value)
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
    return mutate<{ revisionId: string }>(url, 'PATCH', body, result => lookup(designReadOwner(current), result.revisionId))
  }
  async function saveMetadata(subject: string | null, previewText: string | null) {
    const current = draft.value
    if (!current || current.state !== 'structured') throw new Error('Reload the structured draft before saving.')
    const url = `/api/email/design/drafts/${current.documentId}/metadata`
    const body = operation(url, () => ({
      version: 1, operationId: crypto.randomUUID(), scope: current.source.scope,
      expectedRevisionId: current.headRevisionId, subject, previewText
    }))
    await mutate<{ revisionId: string }>(url, 'PATCH', body, result => lookup(designReadOwner(current), result.revisionId))
  }
  async function open(templateId: string | DesignOwner, clientId: string | null, authoring = false, saved?: { draftId: string, expectedRevisionId: string }) {
    if (saved) {
      const current = draft.value
      if (current?.state !== 'structured' || !sameOwner(designReadOwner(current), templateId) || current.documentId !== saved.draftId || current.source.scope.clientId !== clientId)
        throw new Error('Reopen the same saved design owner and client before continuing.')
      if (!pending && (current.headRevisionId !== saved.expectedRevisionId || current.projectionRevisionId !== saved.expectedRevisionId || current.projection.state !== 'current'))
        throw new Error('The saved design head or projection changed. Reload before reopening.')
    }
    // A pending write keeps its mode, exact payload and readback closure.
    if (!pending) {
      if (typeof templateId !== 'string' && templateId.kind === 'campaign' && !campaignAuthoring.value.available) throw new Error('Campaign authoring is unavailable for this draft.')
      if (authoring && !designerAuthoring.value.available && !(typeof templateId !== 'string' && templateId.kind === 'campaign' && campaignAuthoring.value.available)) throw new Error('Designer authoring is unavailable for this draft.')
      mode.value = authoring ? 'designer' : 'content'
      designerOperationId.value = null
    }
    // Confirmed structured drafts open by exact head. Legacy/new-copy starts
    // retain the existing atomic initialization/conversion boundary.
    const body = operation(endpoint(), () => saved
      ? { command: 'open', operationId: crypto.randomUUID(), draftId: saved.draftId, expectedRevisionId: saved.expectedRevisionId }
      : { command: 'start', operationId: crypto.randomUUID(), ...(typeof templateId === 'string' ? { templateId } : { owner: templateId }), clientId })
    const result = await mutate<HandoffResult>(endpoint(), 'POST', body, async (result) => {
      if (saved && (result.handoff.draftId !== saved.draftId || !sameOwner(result.handoff.owner ?? result.handoff.templateId!, templateId) || result.handoff.baseRevisionId !== saved.expectedRevisionId))
        throw new Error('The saved design reopen receipt does not match its owner and head.')
      await lookup(templateId, saved?.expectedRevisionId ?? result.handoff.appliedRevisionId ?? result.handoff.baseRevisionId)
    })
    return adoptHandoff(result)
  }
  async function resume(id: string, authoring = mode.value === 'designer') {
    if (pending) throw new Error('A previous save needs reconciliation. Retry that action before making another change.')
    if (handoff.value?.id !== id || (mode.value === 'designer') !== authoring) designerOperationId.value = null
    mode.value = authoring ? 'designer' : 'content'
    const result = await $fetch<HandoffResult>(endpoint(), { method: 'POST', body: { command: 'resume', handoffId: id } })
    return adoptHandoff(result)
  }
  async function reopenLibraryDraft(templateId: string | DesignOwner, documentId: string, expectedRevisionId: string) {
    if (!pending) {
      if (!designerAuthoring.value.available || draft.value?.documentId !== documentId || !sameOwner(designReadOwner(draft.value), templateId)) throw new Error('Reopen the same saved design draft before continuing.')
      mode.value = 'designer'
      designerOperationId.value = null
    }
    const body = operation(endpoint(), () => ({ command: 'open', operationId: crypto.randomUUID(), draftId: documentId, expectedRevisionId }))
    return adoptHandoff(await mutate<HandoffResult>(endpoint(), 'POST', body, result => lookup(templateId, result.handoff.baseRevisionId)))
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
    return mutate<DesignLibraryReceipt>(url, 'POST', body, async (result) => {
      if (result.published) {
        if (!result.moduleId) throw new Error('Module receipt is incomplete.')
        const selected = await $fetch<{ moduleId: string, revisionId: string }>(`/api/email/design/modules/${result.moduleId}/${result.revisionId}`)
        if (selected.moduleId !== result.moduleId || selected.revisionId !== result.revisionId) throw new Error('Module receipt readback mismatch.')
      } else await lookup(designReadOwner(current), result.revisionId)
      lastLibraryReceipt.value = result
    })
  }

  type TemplateCommand = DesignTemplateRequest extends infer Request ? Request extends DesignTemplateRequest ? Omit<Request, 'version' | 'operationId'> : never : never
  async function template(command: TemplateCommand) {
    if (!libraryAuthoring.value.available) throw new Error('The design library is unavailable.')
    const url = '/api/email/design/templates'
    const body = operation(url, () => ({ ...command, version: 1, operationId: crypto.randomUUID() }))
    return mutate<DesignLibraryReceipt>(url, 'POST', body, async (result) => {
      if (!result.templateId) throw new Error('Template receipt is incomplete.')
      if (result.published) {
        const selected = await $fetch<{ templateId: string, revisionId: string }>(`/api/email/design/templates/${result.templateId}/${result.revisionId}`)
        if (selected.templateId !== result.templateId || selected.revisionId !== result.revisionId) throw new Error('Template receipt readback mismatch.')
      } else {
        // A copy creates a different owner. Validate its exact head without
        // replacing the composer's current source before explicit navigation.
        const selected = await $fetch<{ draft: TemplateDesignDraftRead }>(contentEndpoint, { method: 'POST', body: { command: 'lookup', templateId: result.templateId } })
        if (selected.draft?.documentId !== result.documentId || selected.draft.headRevisionId !== result.revisionId) throw new Error('The draft changed in another editor. Reload before continuing.')
      }
      lastLibraryReceipt.value = result
    })
  }
  async function restoreRevision(revisionId: string) {
    const current = draft.value
    if (current?.state !== 'structured' || !libraryAuthoring.value.available) throw new Error('Open a saved design draft before restoring a revision.')
    const url = '/api/email/design/history'
    const body = operation(url, () => ({ version: 1, command: 'restore-revision', draftId: current.documentId, expectedRevisionId: current.headRevisionId, revisionId, operationId: crypto.randomUUID() }))
    return mutate<DesignLibraryReceipt & { subject?: string | null, previewText?: string | null }>(url, 'POST', body, async (result) => {
      await lookup(designReadOwner(current), result.revisionId)
      lastLibraryReceipt.value = result
    })
  }
  async function publishImage(assetId: string) {
    if (!libraryAuthoring.value.available || !libraryAuthoring.value.publisher) throw new Error('Agency publishing access is required.')
    const url = '/api/email/design/assets/publish'
    const body = operation(url, () => ({ version: 1, operationId: crypto.randomUUID(), assetId }))
    return mutate<{ asset: { id: string } }>(url, 'POST', body, async (result) => {
      if (result.asset.id !== assetId) throw new Error('Image receipt readback mismatch.')
      const library = await $fetch<{ assets: Array<{ id: string, emailPublication?: unknown }> }>('/api/agency/email/assets')
      if (!library.assets.some(asset => asset.id === assetId && stableDesignJson(asset.emailPublication) === stableDesignJson(result.asset))) throw new Error('Image receipt readback mismatch.')
    })
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
      ? result => lookup(result.handoff.owner ?? result.handoff.templateId!, result.handoff.appliedRevisionId!)
      : undefined)
    return adoptHandoff(result)
  }
  async function reconcile() {
    if (!pending) return null
    const retained = pending
    const result = await mutate<{ handoff?: DesignHandoff, capabilities?: DesignerCapabilities, revisionId?: string }>(retained.url, retained.method, retained.body, async (receipt) => {
      if (receipt.handoff) await lookup(receipt.handoff.owner ?? receipt.handoff.templateId!, receipt.handoff.appliedRevisionId ?? receipt.handoff.baseRevisionId)
      else if (draft.value) await lookup(designReadOwner(draft.value), receipt.revisionId)
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
      const libraryErrors: Record<string, string> = {
        LOCAL_OVERRIDE_REVIEW_REQUIRED: 'Review every local override before publishing this saved design.',
        CLOSED_SELECTION_REQUIRED: 'Choose a complete section or linked instance before publishing a module.',
        OVERRIDE_CONFLICT: 'The selected module version cannot preserve these local changes. Review them and choose whether to discard them.',
        ASSET_NOT_READY: 'Use a published registered image whose scope and bytes can be verified.',
        PUBLISHER_REQUIRED: 'Agency publishing access is required to publish library content.',
        SAVED_DRAFT_REQUIRED: 'Save the current draft before using the design library.'
      }
      error.value = code && libraryErrors[code]
        ? libraryErrors[code]
        : code === 'REVISION_CONFLICT' || code === 'LEGACY_CONTENT_CHANGED'
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
    } finally {
      busy.value = false
    }
  }
  return { lastCampaignPatch, replaceCampaignImage, lastRecovery, localBaseline, setLocalBaseline, campaignAuthoring, saveCampaign, recoverCampaign, nativeLibrary, reopenLibraryDraft, libraryAuthoring, library, template, restoreRevision, publishImage, lastLibraryReceipt, mode, designerAuthoring, designerCapabilities, designerOperationId, proposeDesigner, draft, handoff, busy, error, hasPending, reconcile, lookup, saveStructured, saveMetadata, open, resume, propose, finish, run }
}
