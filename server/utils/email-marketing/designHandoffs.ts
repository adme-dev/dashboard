import { applyDesignerOperations, designerCapabilities, parseDesignerProposal, type DesignerRoundtripRequest } from '~~/shared/emailRendering/designDesigner'
import { designToRendererDocument } from '~~/shared/emailRendering/designAdapter'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { composerToDesignDraft, validateContentReturn } from '~~/shared/emailRendering/designComposer'
import { validateEmailDesign, type EmailDesignDocument } from '~~/shared/emailRendering/designContract'
import { FIGFLOW_EDM_EDITOR_URL, FIGFLOW_EDM_ORIGIN, type DesignHandoff, type RoundtripRequest } from '~~/shared/emailRendering/designRoundtrip'
import type { EmailRendererClient } from '~~/shared/emailRendering/contract'
import { initializeTemplateDesignDraft } from './designInitialization'
import { getTemplateDesignDraft } from './designReads'
import { saveTemplateDesignDraft, saveStaffTemplateDesignDraft, saveDesignerTemplateDesignDraft, type DesignDb, type DesignTransaction } from './designRevisions'

export class DesignHandoffError extends Error {
  constructor(public readonly code: 'NOT_FOUND' | 'REVISION_CONFLICT' | 'PROPOSAL_STATE_CONFLICT' | 'PROPOSAL_EXPIRED' | 'IDEMPOTENCY_CONFLICT' | 'DESIGNER_REQUIRED' | 'UNSUPPORTED_NATIVE_DESIGN' | 'NO_EDITABLE_CONTENT' | 'HANDOFF_MODE_MISMATCH' | 'RENDER_TIMEOUT') { super(code) }
}
interface Authority {
  actorId: string
  authorize(clientId: string | null, access: 'read' | 'write'): Promise<'staff' | 'designer'>
}
interface HandoffRow {
  id: string
  actor_id: string
  document_id: string
  template_id: string
  client_id: string | null
  base_revision_id: string
  open_revision_id: string
  state: 'open' | 'proposed' | 'applied' | 'cancelled'
  expires_at: string | Date
  expired: boolean
  proposal_revision_id: string | null
  proposal_action_text: string | null
  proposal_payload_text: string | null
  applied_revision_id: string | null
  apply_action_text: string | null
  cancel_action_text: string | null
  payload: unknown
  open_request_text?: string | null
}
function stable(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}`
}
function assertNativeScope(design: EmailDesignDocument) {
  if (design.dependencies.length || design.moduleInstances.length || design.assets.length
    || design.source.editor !== 'composer' || design.source.nativeArtifact !== null
    || design.rootChildrenIds.length !== 1 || design.rootChildrenIds[0] !== 'root')
    throw new DesignHandoffError('UNSUPPORTED_NATIVE_DESIGN')
}
function project(row: HandoffRow): DesignHandoff {
  return {
    id: row.id, draftId: row.document_id, templateId: row.template_id,
    baseRevisionId: row.base_revision_id,
    state: row.expired && (row.state === 'open' || row.state === 'proposed') ? 'expired' : row.state,
    expiresAt: new Date(row.expires_at).toISOString(),
    source: validateEmailDesign(row.payload),
    proposal: row.proposal_payload_text ? validateEmailDesign(JSON.parse(row.proposal_payload_text)) : null,
    proposalRevisionId: row.proposal_revision_id, appliedRevisionId: row.applied_revision_id,
    editorUrl: FIGFLOW_EDM_EDITOR_URL
  }
}
async function readHandoff(db: DesignDb, id: string, authority: Authority, designer = false, admitting = false): Promise<HandoffRow> {
  const row = (await db.query(`SELECT h.*, d.template_id, d.client_id, r.payload, hr.request_text AS open_request_text,
    clock_timestamp() >= h.expires_at AS expired
    FROM email_design_handoffs h JOIN email_design_documents d ON d.id=h.document_id
    JOIN email_design_revisions r ON r.document_id=h.document_id AND r.id=h.base_revision_id
    LEFT JOIN email_design_handoff_receipts hr ON hr.actor_id=h.actor_id AND hr.operation_id=h.id AND hr.handoff_id=h.id
    JOIN edm_templates t ON t.id=d.template_id AND t.client_id IS NOT DISTINCT FROM d.client_id
    WHERE h.id=$1 AND h.actor_id=$2 AND t.template_kind='draft'
      AND h.expires_at + interval '30 days' > clock_timestamp() FOR UPDATE OF h`, [id, authority.actorId])).rows[0] as HandoffRow | undefined
  if (!row) throw new DesignHandoffError('NOT_FOUND')
  await authority.authorize(row.client_id, 'read')
  if (!admitting && (row.open_request_text ? JSON.parse(row.open_request_text).authoringMode === 'designer' : false) !== designer)
    throw new DesignHandoffError('HANDOFF_MODE_MISMATCH')
  if (!designer) assertNativeScope(validateEmailDesign(row.payload))
  else {
    if (await authority.authorize(row.client_id, 'write') !== 'designer') throw new DesignHandoffError('DESIGNER_REQUIRED')
    applyDesignerOperations(row.payload, [], row.id)
  }
  return row
}

/** All proposal transitions and canonical projection share one transaction.
 * Original operation identities survive lost replies; a terminal receipt never
 * advances the document a second time. No retries are performed here. */
async function executeRoundtrip(
  request: RoundtripRequest | DesignerRoundtripRequest,
  authority: Authority,
  renderer: EmailRendererClient,
  runTransaction: DesignTransaction = callback => transactionWithoutRetry(db => callback(db)),
  designer = false
): Promise<{ handoff: DesignHandoff } | { draft: Awaited<ReturnType<typeof getTemplateDesignDraft>> | null }> {
  return runTransaction(async (db) => {
    const operationId = request.command === 'open' || request.command === 'start' ? request.operationId : 'action' in request ? request.action.operationId : null
    const encodedRequest = stable(designer ? { ...request, authoringMode: 'designer' } : request)
    if (operationId) {
      // Acquire operation before handoff/owner locks on every mutation path.
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`${authority.actorId}:${operationId}`])
      const receipt = (await db.query('SELECT request_text FROM email_design_handoff_receipts WHERE actor_id=$1 AND operation_id=$2', [authority.actorId, operationId])).rows[0] as { request_text: string } | undefined
      if (receipt && receipt.request_text !== encodedRequest) throw new DesignHandoffError('IDEMPOTENCY_CONFLICT')
    }
    const result = await (async () => {
      const authorizeWrite = async (clientId: string | null) => {
        const role = await authority.authorize(clientId, 'write')
        if (designer && role !== 'designer') throw new DesignHandoffError('DESIGNER_REQUIRED')
      }
      const dependencies = { authorizeModuleRead: async (_id: string, clientId: string | null) => {
        await authority.authorize(clientId, 'read')
      } }
      if (request.command === 'lookup') {
        const row = (await db.query('SELECT id, client_id FROM edm_templates WHERE id=$1', [request.templateId])).rows[0] as { id: string, client_id: string | null } | undefined
        if (!row) throw new DesignHandoffError('NOT_FOUND')
        await authority.authorize(row.client_id, 'read')
        const document = (await db.query('SELECT id FROM email_design_documents WHERE template_id=$1', [row.id])).rows[0] as { id: string } | undefined
        return { draft: document
          ? await getTemplateDesignDraft(document.id, async (id) => {
              await authority.authorize(id, 'read')
            }, db)
          : null }
      }
      if (request.command === 'open' || request.command === 'start') {
        const prior = (await db.query('SELECT id FROM email_design_handoffs WHERE id=$1', [request.operationId])).rows[0]
        if (prior) {
          const row = await readHandoff(db, request.operationId, authority, designer)
          if (request.command === 'start'
            ? row.template_id !== request.templateId || row.client_id !== request.clientId
            : row.document_id !== request.draftId || row.open_revision_id !== request.expectedRevisionId)
            throw new DesignHandoffError('IDEMPOTENCY_CONFLICT')
          await authorizeWrite(row.client_id)
          return { handoff: project(row) }
        }
        // Initialization, conversion and the handoff either all commit or all
        // roll back. A failed open must not strand a schema-0 snapshot.
        const initialized = request.command === 'start'
          ? await initializeTemplateDesignDraft({
              templateId: request.templateId, actorId: authority.actorId, expectedClientId: request.clientId
            }, async (id) => {
              if (await authority.authorize(id, 'write') !== 'designer') throw new DesignHandoffError('DESIGNER_REQUIRED')
            }, callback => callback(db))
          : null
        const draftId = request.command === 'open' ? request.draftId : initialized!.documentId
        const expectedRevisionId = request.command === 'open' ? request.expectedRevisionId : initialized!.revisionId
        const draft = await getTemplateDesignDraft(draftId, async (id) => {
          if (await authority.authorize(id, 'write') !== 'designer') throw new DesignHandoffError('DESIGNER_REQUIRED')
        }, db)
        if (draft.headRevisionId !== expectedRevisionId) throw new DesignHandoffError('REVISION_CONFLICT')
        let design: EmailDesignDocument
        let baseRevisionId = draft.headRevisionId
        if (draft.state === 'legacy') {
          const original = JSON.parse(draft.source)
          design = composerToDesignDraft(original.body_source, original.client_id)
          const saved = await saveTemplateDesignDraft({
            documentId: draftId, actorId: authority.actorId,
            operationId: request.operationId, expectedRevisionId: expectedRevisionId, design
          }, async (id) => {
            if (await authority.authorize(id, 'write') !== 'designer') throw new DesignHandoffError('DESIGNER_REQUIRED')
          }, renderer, callback => callback(db), dependencies)
          baseRevisionId = saved.revisionId
        } else {
          if (draft.projection.state !== 'current') throw new DesignHandoffError('REVISION_CONFLICT')
          design = draft.source
          // Serialize with ordinary saves and require this exact head on open.
          const owner = (await db.query('SELECT id FROM edm_templates WHERE id=$1 FOR UPDATE', [draft.templateId])).rows[0]
          const current = (await db.query('SELECT head_revision_id FROM email_design_documents WHERE id=$1 FOR UPDATE', [draft.documentId])).rows[0] as { head_revision_id: string } | undefined
          if (!owner || current?.head_revision_id !== baseRevisionId) throw new DesignHandoffError('REVISION_CONFLICT')
        }
        if (designer) applyDesignerOperations(design, [], request.operationId)
        else assertNativeScope(design)
        // Admission only: historical handoffs stay readable/cancellable. This
        // rejection rolls initialization/conversion back with the transaction.
        if (!designer && !design.policy.editableFields.length) throw new DesignHandoffError('NO_EDITABLE_CONTENT')
        if (await authority.authorize(design.scope.clientId, 'write') !== 'designer') throw new DesignHandoffError('DESIGNER_REQUIRED')
        await db.query(`INSERT INTO email_design_handoffs(id,actor_id,document_id,base_revision_id,open_revision_id,editor_origin)
          VALUES($1,$2,$3,$4,$5,$6)`, [request.operationId, authority.actorId, draftId, baseRevisionId, expectedRevisionId, FIGFLOW_EDM_ORIGIN])
        return { handoff: project(await readHandoff(db, request.operationId, authority, designer, true)) }
      }
      const row = await readHandoff(db, request.handoffId, authority, designer)
      if (request.command === 'resume') return { handoff: project(row) }
      await authorizeWrite(row.client_id)
      if (designer && await authority.authorize(row.client_id, 'write') !== 'designer') throw new DesignHandoffError('DESIGNER_REQUIRED')
      const action = request.action
      if (action.scope.clientId !== row.client_id) throw new DesignHandoffError('NOT_FOUND')
      const encoded = stable(action)
      if (request.command === 'propose') {
        if (action.action !== 'propose-return' && action.action !== 'propose-designer-return') throw new DesignHandoffError('PROPOSAL_STATE_CONFLICT')
        if ((designer ? action.action !== 'propose-designer-return' : action.action !== 'propose-return') || action.draftId !== row.document_id || action.baseRevisionId !== row.base_revision_id || ('sourceDraft' in action && action.sourceDraft))
          throw new DesignHandoffError('REVISION_CONFLICT')
        if (await authority.authorize(row.client_id, 'write') !== 'designer') throw new DesignHandoffError('DESIGNER_REQUIRED')
        if (row.proposal_action_text) {
          if (row.proposal_action_text !== encoded) throw new DesignHandoffError('IDEMPOTENCY_CONFLICT')
          return { handoff: project(row) }
        }
        if (row.expired) throw new DesignHandoffError('PROPOSAL_EXPIRED')
        if (row.state !== 'open') throw new DesignHandoffError('PROPOSAL_STATE_CONFLICT')
        const design = action.action === 'propose-designer-return'
          ? applyDesignerOperations(row.payload, action.operations, action.operationId)
          : validateContentReturn(validateEmailDesign(row.payload), action.design)
        if (designer) {
          // Reject a proposal whose source is already obsolete, but leave the
          // authoritative Apply CAS in the canonical writer as well.
          const current = await getTemplateDesignDraft(row.document_id, authorizeWrite, db)
          if (current.headRevisionId !== row.base_revision_id || current.state !== 'structured' || current.projection.state !== 'current') throw new DesignHandoffError('REVISION_CONFLICT')
          await renderDesignerPreview(design, renderer)
        }
        if (await authority.authorize(row.client_id, 'write') !== 'designer') throw new DesignHandoffError('DESIGNER_REQUIRED')
        const changed = (await db.query(`UPDATE email_design_handoffs SET state='proposed', proposal_revision_id=$2,
          proposal_operation_id=$3, proposal_action_text=$4, proposal_payload_text=$5
          WHERE id=$1 AND expires_at>clock_timestamp() RETURNING id`, [row.id, crypto.randomUUID(), action.operationId, encoded, JSON.stringify(design)])).rows[0]
        if (!changed) throw new DesignHandoffError('PROPOSAL_EXPIRED')
      } else {
        if (action.action !== 'apply-return' && action.action !== 'cancel-return') throw new DesignHandoffError('PROPOSAL_STATE_CONFLICT')
        if (action.proposalId !== row.id || action.expectedProposalRevisionId !== row.proposal_revision_id)
          throw new DesignHandoffError('REVISION_CONFLICT')
        const prior = request.command === 'apply' ? row.apply_action_text : row.cancel_action_text
        if (prior) {
          if (prior !== encoded) throw new DesignHandoffError('IDEMPOTENCY_CONFLICT')
          return { handoff: project(row) }
        }
        if (row.expired) throw new DesignHandoffError('PROPOSAL_EXPIRED')
        if (row.state !== 'proposed' || !row.proposal_payload_text) throw new DesignHandoffError('PROPOSAL_STATE_CONFLICT')
        if (action.action === 'apply-return') {
          const persisted = row.proposal_action_text ? JSON.parse(row.proposal_action_text) : null
          if ((persisted?.action === 'propose-designer-return') !== designer) throw new DesignHandoffError('HANDOFF_MODE_MISMATCH')
          if (action.expectedDraftRevisionId !== row.base_revision_id) throw new DesignHandoffError('REVISION_CONFLICT')
          const designerProposal = designer ? parseDesignerProposal(persisted) : null
          const save = designer ? saveDesignerTemplateDesignDraft : saveStaffTemplateDesignDraft
          const writeInput = {
            documentId: row.document_id, actorId: authority.actorId, operationId: action.operationId,
            expectedRevisionId: row.base_revision_id, design: JSON.parse(row.proposal_payload_text),
            operations: designerProposal?.operations ?? [], proposalOperationId: designerProposal?.operationId ?? action.operationId
          }
          const receipt = await save(writeInput, async (clientId) => {
            if (designer && await authority.authorize(clientId, 'write') !== 'designer') throw new DesignHandoffError('DESIGNER_REQUIRED')
            await authorizeWrite(clientId)
          }, renderer, callback => callback(db), dependencies)
          await authorizeWrite(row.client_id)
          const changed = (await db.query(`UPDATE email_design_handoffs SET state='applied', applied_revision_id=$2, apply_action_text=$3
            WHERE id=$1 AND expires_at>clock_timestamp() RETURNING id`, [row.id, receipt.revisionId, encoded])).rows[0]
          if (!changed) throw new DesignHandoffError('PROPOSAL_EXPIRED')
        } else {
          await authorizeWrite(row.client_id)
          const changed = (await db.query(`UPDATE email_design_handoffs SET state='cancelled', cancel_action_text=$2
            WHERE id=$1 AND expires_at>clock_timestamp() RETURNING id`, [row.id, encoded])).rows[0]
          if (!changed) throw new DesignHandoffError('PROPOSAL_EXPIRED')
        }
      }
      return { handoff: project(await readHandoff(db, request.handoffId, authority, designer)) }
    })()
    if (operationId && 'handoff' in result) {
      await db.query(`INSERT INTO email_design_handoff_receipts(actor_id,operation_id,handoff_id,request_text)
        VALUES($1,$2,$3,$4) ON CONFLICT(actor_id,operation_id) DO NOTHING`, [authority.actorId, operationId, result.handoff.id, encodedRequest])
    }
    return result
  })
}

async function renderDesignerPreview(design: EmailDesignDocument, renderer: EmailRendererClient): Promise<string> {
  let deadline: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      renderer.renderDocument(designToRendererDocument(design).document),
      new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new DesignHandoffError('RENDER_TIMEOUT')), 15_000) })
    ])
  } finally { clearTimeout(deadline) }
}

export function executeDesignRoundtrip(request: RoundtripRequest, authority: Authority, renderer: EmailRendererClient, runTransaction?: DesignTransaction) {
  return executeRoundtrip(request, authority, renderer, runTransaction)
}

/** Separate admission surface. Persisted open receipts bind mode even after
 * uncertain replies; it is never selected by an actor/policy field in JSON. */
export async function executeDesignerRoundtrip(request: DesignerRoundtripRequest, authority: Authority, renderer: EmailRendererClient, runTransaction?: DesignTransaction) {
  const result = await executeRoundtrip(request, authority, renderer, runTransaction, true)
  if (!('handoff' in result)) return result
  await authority.authorize(result.handoff.source.scope.clientId, 'read')
  const html = await renderDesignerPreview(result.handoff.proposal ?? result.handoff.source, renderer)
  await authority.authorize(result.handoff.source.scope.clientId, 'read')
  return { ...result, capabilities: designerCapabilities(result.handoff.source), preview: { html, source: 'canonical-renderer' as const } }
}
