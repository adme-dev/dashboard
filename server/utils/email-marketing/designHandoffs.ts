import { dependencyRecords } from './designModules'
import { assertLibraryOperationNamespace } from './designLibraryOperations'
import { initializeCampaignOwnedDraft } from './designCampaigns'
import { createCampaign } from './campaigns'
import { lockDesignDraftOwner, assertDesignDraftMutable } from './designDraftOwners'
import { verifyExactDesignAssets } from './designTemplates'
import { verifyDesignModuleAssets, type DesignAssetStorage } from './designAssets'
import { stableDesignJson, DesignModuleError } from '../../../shared/emailRendering/designModules'
import { applyDesignerOperations, designerCapabilities, parseDesignerProposal, type DesignerRoundtripRequest } from '~~/shared/emailRendering/designDesigner'
import { designToRendererDocument } from '~~/shared/emailRendering/designAdapter'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { composerToDesignDraft, validateContentReturn } from '~~/shared/emailRendering/designComposer'
import { validateEmailDesign, type EmailDesignDocument } from '~~/shared/emailRendering/designContract'
import { FIGFLOW_EDM_EDITOR_URL, FIGFLOW_EDM_ORIGIN, designTargetOwner, type DesignHandoff, type DesignOwner, type RoundtripRequest } from '~~/shared/emailRendering/designRoundtrip'
import type { EmailRendererClient } from '~~/shared/emailRendering/contract'
import { initializeTemplateDesignDraft } from './designInitialization'
import { getTemplateDesignDraft, getDesignDraft, type HandoffDraftRead } from './designReads'
import { saveTemplateDesignDraft, saveStaffTemplateDesignDraft, saveDesignerTemplateDesignDraft, saveDesignerCampaignDesignDraft, saveStaffCampaignDesignDraft, saveCampaignDesignDraft, ensureLegacyDesignDocument, digestDesignRequest, type DesignDb, type DesignTransaction } from './designRevisions'

export class DesignHandoffError extends Error {
  constructor(public readonly code: 'NOT_FOUND' | 'REVISION_CONFLICT' | 'PROPOSAL_STATE_CONFLICT' | 'PROPOSAL_EXPIRED' | 'IDEMPOTENCY_CONFLICT' | 'DESIGNER_REQUIRED' | 'UNSUPPORTED_NATIVE_DESIGN' | 'NO_EDITABLE_CONTENT' | 'HANDOFF_MODE_MISMATCH' | 'RENDER_TIMEOUT') {
    super(code)
  }
}
export interface Authority {
  actorId: string
  authorize(clientId: string | null, access: 'read' | 'write'): Promise<'staff' | 'designer'>
  /** Route-owned release policy, evaluated against parsed/persisted ownership. */
  assertCampaignNativeEnabled?(): void
}
interface HandoffRow {
  id: string
  actor_id: string
  document_id: string
  template_id: string | null
  campaign_id: string | null
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
  const base: Omit<DesignHandoff, 'owner' | 'templateId'> = {
    id: row.id, draftId: row.document_id,
    baseRevisionId: row.base_revision_id,
    state: row.expired && (row.state === 'open' || row.state === 'proposed') ? 'expired' : row.state,
    expiresAt: new Date(row.expires_at).toISOString(),
    source: validateEmailDesign(row.payload),
    proposal: row.proposal_payload_text ? validateEmailDesign(JSON.parse(row.proposal_payload_text)) : null,
    proposalRevisionId: row.proposal_revision_id, appliedRevisionId: row.applied_revision_id,
    editorUrl: FIGFLOW_EDM_EDITOR_URL
  }
  return row.template_id
    ? { ...base, owner: { kind: 'template', id: row.template_id }, templateId: row.template_id }
    : { ...base, owner: { kind: 'campaign', id: row.campaign_id! } }
}
async function readHandoff(db: DesignDb, id: string, authority: Authority, designer = false, admitting = false): Promise<HandoffRow> {
  const row = (await db.query(`SELECT h.*, d.template_id, d.campaign_id, d.client_id, r.payload, hr.request_text AS open_request_text,
    clock_timestamp() >= h.expires_at AS expired
    FROM email_design_handoffs h JOIN email_design_documents d ON d.id=h.document_id
    JOIN email_design_revisions r ON r.document_id=h.document_id AND r.id=h.base_revision_id
    LEFT JOIN email_design_handoff_receipts hr ON hr.actor_id=h.actor_id AND hr.operation_id=h.id AND hr.handoff_id=h.id
    LEFT JOIN edm_templates t ON t.id=d.template_id AND t.client_id IS NOT DISTINCT FROM d.client_id
    LEFT JOIN campaigns c ON c.id=d.campaign_id AND c.client_id IS NOT DISTINCT FROM d.client_id
    WHERE h.id=$1 AND h.actor_id=$2 AND (t.template_kind='draft' OR c.id IS NOT NULL)
      AND h.expires_at + interval '30 days' > clock_timestamp() FOR UPDATE OF h`, [id, authority.actorId])).rows[0] as HandoffRow | undefined
  if (!row) throw new DesignHandoffError('NOT_FOUND')
  if (row.campaign_id) authority.assertCampaignNativeEnabled?.()
  await authority.authorize(row.client_id, 'read')
  if (validateEmailDesign(row.payload).kind !== (row.template_id ? 'template' : 'campaign-draft')) throw new DesignHandoffError('NOT_FOUND')
  if (!admitting && (row.open_request_text ? JSON.parse(row.open_request_text).authoringMode === 'designer' : false) !== designer)
    throw new DesignHandoffError('HANDOFF_MODE_MISMATCH')
  if (!designer) assertNativeScope(validateEmailDesign(row.payload))
  else {
    if (!(row.campaign_id && ['applied', 'cancelled'].includes(row.state))) {
      if (await authority.authorize(row.client_id, 'write') !== 'designer') throw new DesignHandoffError('DESIGNER_REQUIRED')
    }
    applyDesignerOperations(row.payload, [], row.id)
  }
  return row
}

/** Campaign handoffs share the existing actor-operation namespace. Only the
 * same committed handoff receipt, or its in-transaction first conversion pair,
 * may coexist with a canonical revision receipt under that operation ID. */
async function assertCampaignOperation(db: DesignDb, actorId: string, operationId: string, knownReceipt: boolean) {
  await assertLibraryOperationNamespace(db, actorId, operationId, 'revision')
  if (!knownReceipt) {
    const foreign = (await db.query('SELECT operation_id FROM email_design_revision_receipts WHERE actor_id=$1 AND operation_id=$2', [actorId, operationId])).rows[0]
    if (foreign) throw new DesignHandoffError('IDEMPOTENCY_CONFLICT')
  }
}

async function verifyCampaignDesign(design: EmailDesignDocument, authority: Authority, db: DesignDb, storage?: DesignAssetStorage) {
  const read = async (scope: string | null) => {
    await authority.authorize(scope, 'read')
  }
  const write = async (scope: string | null) => {
    await authority.authorize(scope, 'write')
  }
  const assetAuthority = { actorId: authority.actorId, read, designer: write, publisher: write }
  await dependencyRecords(design, db, assetAuthority)
  await verifyExactDesignAssets(design, assetAuthority, db, storage)
  const verified = await verifyDesignModuleAssets(design, db, read, storage)
  if (verified.some(asset => !design.assets.some(saved => stableDesignJson(asset) === stableDesignJson(saved)))) throw new DesignModuleError('ASSET_NOT_READY')
}

async function getHandoffDraft(db: DesignDb, documentId: string, authorize: (scope: string | null) => Promise<void>, assertCampaignNativeEnabled?: () => void): Promise<HandoffDraftRead> {
  const identity = (await db.query('SELECT * FROM email_design_documents WHERE id=$1', [documentId])).rows[0] as { campaign_id: string | null } | undefined
  if (identity?.campaign_id) assertCampaignNativeEnabled?.()
  return identity?.campaign_id ? getDesignDraft(documentId, authorize, db) : getTemplateDesignDraft(documentId, authorize, db)
}

/** Confirmed recovery is an immutable receipt read, not a new proposal action.
 * Resolve both real owners and the recorded revision before touching current
 * creative/retention/readiness paths; a partial receipt must never create again. */
async function readCommittedCampaignRecovery(db: DesignDb,
  request: Extract<RoundtripRequest, { command: 'save-proposal-as-new-draft' }>, authority: Authority,
  designer: boolean, encodedRequest: string) {
  await assertLibraryOperationNamespace(db, authority.actorId, request.action.operationId, 'revision')
  const row = (await db.query(`SELECT h.*,sd.template_id,sd.campaign_id,sd.client_id,base.payload,
    opening.request_text AS open_request_text,clock_timestamp()>=h.expires_at AS expired,
    base.subject AS source_subject,base.preview_text AS source_preview_text,base.base_template_revision_id AS source_pin,
    receipt.document_id AS recovery_document_id,receipt.revision_id AS recovery_revision_id,receipt.payload_sha256,
    destination.campaign_id AS recovery_campaign_id,destination.client_id AS recovery_client_id,
    revision.parent_revision_id AS recovery_parent_id,revision.payload AS recovery_payload,
    revision.subject AS recovery_subject,revision.preview_text AS recovery_preview_text,revision.base_template_revision_id AS recovery_pin
    FROM email_design_handoffs h
    JOIN email_design_documents sd ON sd.id=h.document_id AND sd.campaign_id IS NOT NULL
    JOIN campaigns source ON source.id=sd.campaign_id AND source.client_id=sd.client_id
    JOIN email_design_revisions base ON base.document_id=sd.id AND base.id=h.base_revision_id
    JOIN email_design_handoff_receipts global ON global.actor_id=h.actor_id AND global.operation_id=$2 AND global.handoff_id=h.id AND global.request_text=$3
    JOIN email_design_handoff_receipts opening ON opening.actor_id=h.actor_id AND opening.operation_id=h.id AND opening.handoff_id=h.id
    JOIN email_design_revision_receipts receipt ON receipt.actor_id=h.actor_id AND receipt.operation_id=global.operation_id
    JOIN email_design_documents destination ON destination.id=receipt.document_id AND destination.campaign_id IS NOT NULL
    JOIN campaigns copy ON copy.id=destination.campaign_id AND copy.client_id=destination.client_id
    JOIN email_design_revisions revision ON revision.document_id=destination.id AND revision.id=receipt.revision_id AND revision.schema_version=1 AND revision.created_by=receipt.actor_id
    JOIN email_design_revisions parent ON parent.document_id=destination.id AND parent.id=revision.parent_revision_id AND parent.schema_version=0
    WHERE h.id=$1 AND h.actor_id=$4`, [request.handoffId, request.action.operationId, encodedRequest, authority.actorId])).rows[0] as (HandoffRow & {
    source_subject: string | null
    source_preview_text: string | null
    source_pin: string | null
    recovery_document_id: string
    recovery_revision_id: string
    payload_sha256: string
    recovery_campaign_id: string
    recovery_client_id: string
    recovery_parent_id: string
    recovery_payload: unknown
    recovery_subject: string | null
    recovery_preview_text: string | null
    recovery_pin: string | null
  }) | undefined
  if (!row) throw new DesignHandoffError('IDEMPOTENCY_CONFLICT')
  authority.assertCampaignNativeEnabled?.()
  const action = request.action
  if (action.scope.clientId !== row.client_id || row.recovery_client_id !== row.client_id
    || action.proposalId !== row.id || action.expectedProposalRevisionId !== row.proposal_revision_id
    || (JSON.parse(row.open_request_text!).authoringMode === 'designer') !== designer)
    throw new DesignHandoffError('IDEMPOTENCY_CONFLICT')
  await authority.authorize(row.client_id, 'read')
  await authority.authorize(row.recovery_client_id, 'read')
  const source = validateEmailDesign(row.payload)
  const proposal = validateEmailDesign(JSON.parse(row.proposal_payload_text ?? 'null'))
  if (source.kind !== 'campaign-draft' || source.scope.clientId !== row.client_id || row.recovery_campaign_id === row.campaign_id
    || proposal.kind !== 'campaign-draft' || proposal.scope.clientId !== row.client_id
    || stable(proposal) !== stable(validateEmailDesign(row.recovery_payload))
    || row.recovery_subject !== row.source_subject || row.recovery_preview_text !== row.source_preview_text || row.recovery_pin !== row.source_pin)
    throw new DesignHandoffError('IDEMPOTENCY_CONFLICT')
  const digest = await digestDesignRequest({ owner: { kind: 'campaign', id: row.recovery_campaign_id }, command: 'campaign-designer',
    documentId: row.recovery_document_id, expectedRevisionId: row.recovery_parent_id, design: proposal,
    metadata: { subject: row.source_subject, previewText: row.source_preview_text }, baseTemplateRevisionId: row.source_pin,
    action: null, requestContext: { recovery: request } })
  if (digest !== row.payload_sha256) throw new DesignHandoffError('IDEMPOTENCY_CONFLICT')
  await authority.authorize(row.client_id, 'read')
  await authority.authorize(row.recovery_client_id, 'read')
  return { handoff: project(row), recovery: { campaignId: row.recovery_campaign_id, documentId: row.recovery_document_id, revisionId: row.recovery_revision_id } }
}

/** A recovery creates only a new draft owner; the original divergent proposal
 * remains durable. Existing canonical + handoff receipts bind the original op. */
async function recoverCampaignProposal(db: DesignDb, row: HandoffRow,
  request: Extract<RoundtripRequest, { command: 'save-proposal-as-new-draft' }>, authority: Authority,
  renderer: EmailRendererClient, storage?: DesignAssetStorage) {
  const action = request.action
  await assertLibraryOperationNamespace(db, authority.actorId, action.operationId, 'revision')
  if (!row.campaign_id || action.scope.clientId !== row.client_id || action.proposalId !== row.id || action.expectedProposalRevisionId !== row.proposal_revision_id)
    throw new DesignHandoffError('REVISION_CONFLICT')
  const sourceOwner = await lockDesignDraftOwner(db, row.document_id)
  assertDesignDraftMutable(sourceOwner)
  const authorize = async (scope: string | null) => {
    if (await authority.authorize(scope, 'write') !== 'designer') throw new DesignHandoffError('DESIGNER_REQUIRED')
  }
  const read = async (scope: string | null) => {
    await authority.authorize(scope, 'read')
  }
  const design = validateEmailDesign(JSON.parse(row.proposal_payload_text ?? 'null'))
  const verify = async () => {
    const retained = (await db.query('SELECT id FROM email_design_handoffs WHERE id=$1 AND expires_at + interval \'30 days\' > clock_timestamp()', [row.id])).rows[0]
    if (!retained) throw new DesignHandoffError('PROPOSAL_EXPIRED')
    await verifyCampaignDesign(design, authority, db, storage)
    await authorize(row.client_id)
  }
  await verify()
  if (row.state !== 'proposed') throw new DesignHandoffError('PROPOSAL_STATE_CONFLICT')
  const metadata = (await db.query('SELECT subject,preview_text,base_template_revision_id FROM email_design_revisions WHERE document_id=$1 AND id=$2', [row.document_id, row.base_revision_id])).rows[0] as { subject: string | null, preview_text: string | null, base_template_revision_id: string | null }
  const campaign = await createCampaign({ name: action.name, subject: metadata.subject, preview_text: metadata.preview_text,
    body_source: design.blocks, client_id: row.client_id, created_by: authority.actorId }, renderer, db)
  const baseline = await ensureLegacyDesignDocument({ kind: 'campaign-draft', ownerId: campaign.id, actorId: authority.actorId }, authorize, cb => cb(db))
  const checkedRenderer = { ...renderer, renderDocument: async (...args: Parameters<EmailRendererClient['renderDocument']>) => {
    const html = await renderer.renderDocument(...args)
    await verify()
    return html
  } }
  const saved = await saveCampaignDesignDraft({ documentId: baseline.documentId, actorId: authority.actorId, operationId: action.operationId,
    expectedRevisionId: baseline.revisionId, design, subject: metadata.subject, previewText: metadata.preview_text }, authorize,
  checkedRenderer, cb => cb(db), { baseTemplateRevisionId: metadata.base_template_revision_id, requestContext: { recovery: request }, authorizeModuleRead: async (_id, scope) => read(scope), authorizeTemplateRead: async (_id, scope) => read(scope) })
  await verify()
  return { handoff: project(row), recovery: { campaignId: campaign.id, documentId: saved.documentId, revisionId: saved.revisionId } }
}

/** All proposal transitions and canonical projection share one transaction.
 * Original operation identities survive lost replies; a terminal receipt never
 * advances the document a second time. No retries are performed here. */
async function executeRoundtrip(
  request: RoundtripRequest | DesignerRoundtripRequest,
  authority: Authority,
  renderer: EmailRendererClient,
  runTransaction: DesignTransaction = callback => transactionWithoutRetry(db => callback(db)),
  designer = false,
  storage?: DesignAssetStorage
): Promise<{ handoff: DesignHandoff, recovery?: { campaignId: string, documentId: string, revisionId: string } } | { draft: HandoffDraftRead | null, owner?: DesignOwner, mutable?: boolean, clientId?: string | null }> {
  return runTransaction(async (db) => {
    const operationId = request.command === 'open' || request.command === 'start' ? request.operationId : 'action' in request ? request.action.operationId : null
    const encodedRequest = stable(designer ? { ...request, authoringMode: 'designer' } : request)
    let knownReceipt = false
    let historicalReplay = false
    if (operationId) {
      // Acquire operation before handoff/owner locks on every mutation path.
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))', [`${authority.actorId}:${operationId}`])
      const receipt = (await db.query('SELECT request_text FROM email_design_handoff_receipts WHERE actor_id=$1 AND operation_id=$2', [authority.actorId, operationId])).rows[0] as { request_text: string } | undefined
      knownReceipt = !!receipt
      if (receipt && receipt.request_text !== encodedRequest) throw new DesignHandoffError('IDEMPOTENCY_CONFLICT')
    }
    if (knownReceipt && request.command === 'save-proposal-as-new-draft')
      return readCommittedCampaignRecovery(db, request, authority, designer, encodedRequest)
    const result = await (async () => {
      const authorizeWrite = async (clientId: string | null) => {
        const role = await authority.authorize(clientId, 'write')
        if (designer && role !== 'designer') throw new DesignHandoffError('DESIGNER_REQUIRED')
      }
      const dependencies = { authorizeModuleRead: async (_id: string, clientId: string | null) => {
        await authority.authorize(clientId, 'read')
      } }
      if (request.command === 'lookup') {
        const target = designTargetOwner(request)
        if (target.kind === 'campaign') {
          const owner = (await db.query('SELECT id,client_id,status FROM campaigns WHERE id=$1', [target.id])).rows[0] as { id: string, client_id: string, status: string } | undefined
          if (!owner) throw new DesignHandoffError('NOT_FOUND')
          await authority.authorize(owner.client_id, 'read')
          const document = (await db.query('SELECT id FROM email_design_documents WHERE campaign_id=$1', [owner.id])).rows[0] as { id: string } | undefined
          return { owner: target, mutable: owner.status === 'draft', clientId: owner.client_id, draft: document
            ? await getDesignDraft(document.id, async (id) => {
                await authority.authorize(id, 'read')
              }, db)
            : null }
        }
        const row = (await db.query('SELECT id, client_id FROM edm_templates WHERE id=$1', [target.id])).rows[0] as { id: string, client_id: string | null } | undefined
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
            ? (designTargetOwner(request).kind === 'template' ? row.template_id : row.campaign_id) !== designTargetOwner(request).id || row.client_id !== request.clientId
            : row.document_id !== request.draftId || row.open_revision_id !== request.expectedRevisionId)
            throw new DesignHandoffError('IDEMPOTENCY_CONFLICT')
          historicalReplay = !!(knownReceipt && row.campaign_id && ['applied', 'cancelled'].includes(row.state))
          if (!historicalReplay) await authorizeWrite(row.client_id)
          return { handoff: project(row) }
        }
        // Initialization, conversion and the handoff either all commit or all
        // roll back. A failed open must not strand a schema-0 snapshot.
        const target = request.command === 'start' ? designTargetOwner(request) : null
        const campaignStart = target?.kind === 'campaign'
        let campaignInitialized: { documentId: string, revisionId: string } | null = null
        if (campaignStart) {
          authority.assertCampaignNativeEnabled?.()
          await assertCampaignOperation(db, authority.actorId, request.operationId, knownReceipt)
          const owner = (await db.query('SELECT client_id FROM campaigns WHERE id=$1 FOR UPDATE', [target.id])).rows[0] as { client_id: string } | undefined
          if (!owner || owner.client_id !== (request.command === 'start' ? request.clientId : null)) throw new DesignHandoffError('NOT_FOUND')
          campaignInitialized = await initializeCampaignOwnedDraft({ campaignId: target.id, operationId: request.operationId }, {
            actorId: authority.actorId, read: async (id) => {
              await authority.authorize(id, 'read')
            },
            designer: async (id) => {
              if (await authority.authorize(id, 'write') !== 'designer') throw new DesignHandoffError('DESIGNER_REQUIRED')
            },
            publisher: async () => {
              throw new DesignHandoffError('DESIGNER_REQUIRED')
            }
          }, renderer, storage, cb => cb(db))
        }
        const initialized = campaignInitialized ?? (request.command === 'start'
          ? await initializeTemplateDesignDraft({
              templateId: target!.id, actorId: authority.actorId, expectedClientId: request.clientId
            }, async (id) => {
              if (await authority.authorize(id, 'write') !== 'designer') throw new DesignHandoffError('DESIGNER_REQUIRED')
            }, callback => callback(db))
          : null)
        const draftId = request.command === 'open' ? request.draftId : initialized!.documentId
        const expectedRevisionId = request.command === 'open' ? request.expectedRevisionId : initialized!.revisionId
        const draft = await getHandoffDraft(db, draftId, async (id) => {
          if (await authority.authorize(id, 'write') !== 'designer') throw new DesignHandoffError('DESIGNER_REQUIRED')
        }, authority.assertCampaignNativeEnabled)
        if (request.command === 'open' && 'owner' in draft && draft.owner.kind === 'campaign') await assertCampaignOperation(db, authority.actorId, request.operationId, knownReceipt)
        if (draft.headRevisionId !== expectedRevisionId) throw new DesignHandoffError('REVISION_CONFLICT')
        let design: EmailDesignDocument
        let baseRevisionId = draft.headRevisionId
        if (draft.state === 'legacy') {
          if ('owner' in draft && draft.owner.kind === 'campaign') {
            const locked = await lockDesignDraftOwner(db, draft.documentId)
            assertDesignDraftMutable(locked)
            if (locked.document.head_revision_id !== expectedRevisionId) throw new DesignHandoffError('REVISION_CONFLICT')
            const converted = await initializeCampaignOwnedDraft({ campaignId: draft.owner.id, operationId: request.operationId }, {
              actorId: authority.actorId, read: async (scope) => { await authority.authorize(scope, 'read') },
              designer: async (scope) => { if (await authority.authorize(scope, 'write') !== 'designer') throw new DesignHandoffError('DESIGNER_REQUIRED') },
              publisher: async () => { throw new DesignHandoffError('DESIGNER_REQUIRED') }
            }, renderer, storage, cb => cb(db))
            const current = await getDesignDraft(draft.documentId, authorizeWrite, db)
            if (current.state !== 'structured' || current.projection.state !== 'current') throw new DesignHandoffError('REVISION_CONFLICT')
            design = current.source
            baseRevisionId = converted.revisionId
          } else {
            const original = JSON.parse(draft.source)
            design = composerToDesignDraft(original.body_source, original.client_id)
            const saved = await saveTemplateDesignDraft({
              documentId: draftId, actorId: authority.actorId,
              operationId: request.operationId, expectedRevisionId: expectedRevisionId, design
            }, async (id) => {
              if (await authority.authorize(id, 'write') !== 'designer') throw new DesignHandoffError('DESIGNER_REQUIRED')
            }, renderer, callback => callback(db), dependencies)
            baseRevisionId = saved.revisionId
          }
        } else {
          if (draft.projection.state !== 'current') throw new DesignHandoffError('REVISION_CONFLICT')
          design = draft.source
          // Serialize with ordinary saves and require this exact head on open.
          const lockedOwner = await lockDesignDraftOwner(db, draft.documentId)
          assertDesignDraftMutable(lockedOwner)
          const owner = lockedOwner
          const current = (await db.query('SELECT head_revision_id FROM email_design_documents WHERE id=$1 FOR UPDATE', [draft.documentId])).rows[0] as { head_revision_id: string } | undefined
          if (!owner || current?.head_revision_id !== baseRevisionId) throw new DesignHandoffError('REVISION_CONFLICT')
        }
        if (campaignStart || ('owner' in draft && draft.owner.kind === 'campaign')) {
          await verifyCampaignDesign(design, authority, db, storage)
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
      // A confirmed historical campaign result needs current read authority,
      // not a new creative write grant. Exact global and transition receipts
      // must both match; every new action still takes the write checks below.
      if (row.campaign_id && knownReceipt && ((request.command === 'apply' && row.state === 'applied') || (request.command === 'cancel' && row.state === 'cancelled'))) {
        const committed = request.command === 'apply' ? row.apply_action_text : row.cancel_action_text
        if (committed && committed === stable(request.action)) {
          historicalReplay = true
          return { handoff: project(row) }
        }
      }
      if (row.campaign_id && operationId) await assertCampaignOperation(db, authority.actorId, operationId, knownReceipt)
      if (request.command === 'save-proposal-as-new-draft') return recoverCampaignProposal(db, row, request, authority, renderer, storage)
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
        const lockedOwner = await lockDesignDraftOwner(db, row.document_id)
        assertDesignDraftMutable(lockedOwner)
        const design = action.action === 'propose-designer-return'
          ? applyDesignerOperations(row.payload, action.operations, action.operationId)
          : validateContentReturn(validateEmailDesign(row.payload), action.design)
        if (row.campaign_id) await verifyCampaignDesign(design, authority, db, storage)
        if (designer) {
          // Reject a proposal whose source is already obsolete, but leave the
          // authoritative Apply CAS in the canonical writer as well.
          const current = await getHandoffDraft(db, row.document_id, authorizeWrite)
          if (current.headRevisionId !== row.base_revision_id || current.state !== 'structured' || current.projection.state !== 'current') throw new DesignHandoffError('REVISION_CONFLICT')
          await renderDesignerPreview(design, renderer)
          if (row.campaign_id) await verifyCampaignDesign(design, authority, db, storage)
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
          const campaign = !!row.campaign_id
          const save = campaign ? (designer ? saveDesignerCampaignDesignDraft : saveStaffCampaignDesignDraft) : (designer ? saveDesignerTemplateDesignDraft : saveStaffTemplateDesignDraft)
          const metadata = campaign ? (await db.query('SELECT subject,preview_text FROM email_design_revisions WHERE document_id=$1 AND id=$2', [row.document_id, row.base_revision_id])).rows[0] as { subject: string | null, preview_text: string | null } : null
          const writeInput = {
            documentId: row.document_id, actorId: authority.actorId, operationId: action.operationId,
            expectedRevisionId: row.base_revision_id, design: JSON.parse(row.proposal_payload_text),
            ...(metadata ? { subject: metadata.subject, previewText: metadata.preview_text } : {}),
            ...(designer ? { operations: designerProposal?.operations ?? [], proposalOperationId: designerProposal?.operationId ?? action.operationId } : {})
          }
          if (campaign) await verifyCampaignDesign(writeInput.design, authority, db, storage)
          const checkedRenderer = campaign
            ? { ...renderer, renderDocument: async (...args: Parameters<EmailRendererClient['renderDocument']>) => {
                const html = await renderer.renderDocument(...args)
                await verifyCampaignDesign(writeInput.design, authority, db, storage)
                return html
              } }
            : renderer
          const writeOptions = { ...dependencies, authorizeTemplateRead: async (_id: string, scope: string | null) => {
            await authority.authorize(scope, 'read')
          } }
          const receipt = await save(writeInput as Parameters<typeof saveDesignerCampaignDesignDraft>[0], async (clientId) => {
            if (designer && await authority.authorize(clientId, 'write') !== 'designer') throw new DesignHandoffError('DESIGNER_REQUIRED')
            await authorizeWrite(clientId)
          }, checkedRenderer, callback => callback(db), writeOptions)
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
    // An exact terminal campaign replay performs no insert, including a
    // conflict-only receipt insert that would still invoke database triggers.
    if (operationId && 'handoff' in result && !historicalReplay) {
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
      new Promise<never>((_, reject) => {
        deadline = setTimeout(() => reject(new DesignHandoffError('RENDER_TIMEOUT')), 15_000)
      })
    ])
  } finally {
    clearTimeout(deadline)
  }
}

export function executeDesignRoundtrip(request: RoundtripRequest, authority: Authority, renderer: EmailRendererClient, runTransaction?: DesignTransaction, storage?: DesignAssetStorage) {
  return executeRoundtrip(request, authority, renderer, runTransaction, false, storage)
}

/** Separate admission surface. Persisted open receipts bind mode even after
 * uncertain replies; it is never selected by an actor/policy field in JSON. */
export async function executeDesignerRoundtrip(request: DesignerRoundtripRequest, authority: Authority, renderer: EmailRendererClient, runTransaction?: DesignTransaction, storage?: DesignAssetStorage) {
  const result = await executeRoundtrip(request, authority, renderer, runTransaction, true, storage)
  if (!('handoff' in result) || result.recovery) return result
  await authority.authorize(result.handoff.source.scope.clientId, 'read')
  const html = await renderDesignerPreview(result.handoff.proposal ?? result.handoff.source, renderer)
  await authority.authorize(result.handoff.source.scope.clientId, 'read')
  return { ...result, capabilities: designerCapabilities(result.handoff.source), preview: { html, source: 'canonical-renderer' as const } }
}
