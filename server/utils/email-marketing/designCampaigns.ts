import { z } from 'zod'
import { createError } from 'h3'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { validateEmailDesign } from '../../../shared/emailRendering/designContract'
import { composerToDesignDraft, validateContentReturn } from '../../../shared/emailRendering/designComposer'
import { designDigest, DesignModuleError, stableDesignJson } from '../../../shared/emailRendering/designModules'
import type { EmailRendererClient } from '../../../shared/emailRendering/contract'
import { createCampaign, type Campaign, type CreateCampaignInput } from './campaigns'
import { readImmutableDesignTemplate, verifyExactDesignAssets } from './designTemplates'
import { verifyDesignModuleAssets, verifySavedDesignHtmlAssets, type DesignAssetStorage } from './designAssets'
import { lockDesignDraftOwner } from './designDraftOwners'
import { getDesignDraft } from './designReads'
import { ensureLegacyDesignDocument, saveStaffCampaignDesignDraft, type DesignTransaction, type DesignDb } from './designRevisions'
import { appendModuleOrDraft, renderDraft, dependencyRecords, type ModuleAuthority } from './designModules'
import { isValidSegment } from './segment'
import { initializeCampaignDesignDraft } from './designInitialization'
import { assertLibraryOperationNamespace } from './designLibraryOperations'

const email = z.string().trim().email().max(300).nullable().optional()
export const CampaignSelectionRequest = z.object({
  version: z.literal(1), command: z.literal('create-from-template'), operationId: z.string().uuid(),
  templateId: z.string().uuid(), revisionId: z.string().uuid(), clientId: z.string().uuid(),
  campaign: z.object({ name: z.string().trim().min(1).max(200), subject: z.string().max(300).nullable().optional(),
    preview_text: z.string().max(300).nullable().optional(), from_name: z.string().max(200).nullable().optional(),
    from_email: email, reply_to: email, filter_rules: z.record(z.string(), z.unknown()).nullable().optional() }).strict()
}).strict()
export interface CampaignDesignAuthority {
  actorId: string
  read(scope: string | null): Promise<void>
  write(scope: string | null): Promise<void>
}
const libraryAuthority = (authority: CampaignDesignAuthority): ModuleAuthority => ({ ...authority,
  designer: async () => { throw new DesignModuleError('DESIGNER_REQUIRED') },
  publisher: async () => { throw new DesignModuleError('PUBLISHER_REQUIRED') } })
const defaultTransaction: DesignTransaction = callback => transactionWithoutRetry(db => callback(db))

/** Immutable source scope only: receipt recovery must reauthorize it without
 * requiring current publication, dependency or registered-byte readiness. */
export async function readCampaignTemplateRevisionScope(templateId: string, revisionId: string, db: DesignDb): Promise<string | null> {
  const original = (await db.query(`SELECT d.client_id,r.payload->'scope'->>'clientId' AS source_client_id
    FROM email_design_documents d JOIN email_design_revisions r ON r.document_id=d.id
    WHERE d.template_id=$1 AND r.id=$2 AND r.schema_version=1`, [templateId, revisionId])).rows[0] as { client_id: string | null, source_client_id: string | null } | undefined
  if (!original || original.client_id !== original.source_client_id) throw new DesignModuleError('NOT_FOUND')
  return original.client_id
}

/** Exact server-resolved source; independent destination row, canonical owner and
 * existing receipt commit in the caller transaction. Replay precedes insertion. */
export async function createCampaignFromTemplateRevision(input: unknown, authority: CampaignDesignAuthority,
  renderer: EmailRendererClient, storage?: DesignAssetStorage, run: DesignTransaction = defaultTransaction) {
  const request = CampaignSelectionRequest.parse(input)
  if (request.campaign.filter_rules != null && !isValidSegment(request.campaign.filter_rules)) throw createError({ statusCode: 400, statusMessage: 'invalid_segment' })
  const digest = await designDigest({ boundary: 'email-campaign-from-template-v1', request })
  return run(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${authority.actorId}:${request.operationId}`])
    await assertLibraryOperationNamespace(db, authority.actorId, request.operationId, 'revision')
    const prior = (await db.query(`SELECT r.document_id,r.revision_id,r.payload_sha256,d.campaign_id,d.client_id
      FROM email_design_revision_receipts r JOIN email_design_documents d ON d.id=r.document_id WHERE r.actor_id=$1 AND r.operation_id=$2`,
    [authority.actorId, request.operationId])).rows[0] as { document_id: string, revision_id: string, payload_sha256: string, campaign_id: string | null, client_id: string } | undefined
    if (prior) {
      if (prior.payload_sha256 !== digest || !prior.campaign_id || prior.client_id !== request.clientId) throw new DesignModuleError('IDEMPOTENCY_CONFLICT')
      // Immutable original source scope remains authoritative when the library
      // owner is withdrawn or assets/dependencies are no longer newly ready.
      await authority.read(await readCampaignTemplateRevisionScope(request.templateId, request.revisionId, db))
      await authority.read(prior.client_id)
      await authority.write(prior.client_id)
      return { campaignId: prior.campaign_id, documentId: prior.document_id, revisionId: prior.revision_id }
    }
    await authority.write(request.clientId)
    const owner = (await db.query('SELECT client_id,template_kind FROM edm_templates WHERE id=$1 FOR SHARE', [request.templateId])).rows[0] as { client_id: string | null, template_kind: string } | undefined
    if (!owner) throw new DesignModuleError('NOT_FOUND')
    await authority.read(owner.client_id)
    if (owner.template_kind !== 'template') throw new DesignModuleError('NOT_FOUND')
    const selected = await readImmutableDesignTemplate(request.templateId, request.revisionId, libraryAuthority(authority), db)
    if (selected.design.scope.clientId !== null && selected.design.scope.clientId !== request.clientId) throw new DesignModuleError('SCOPE_MISMATCH')
    const design = validateEmailDesign({ ...selected.design, kind: 'campaign-draft', scope: { clientId: request.clientId } })
    if (design.source.nativeArtifact !== null) throw new DesignModuleError('NATIVE_ARTIFACT_STORAGE_UNAVAILABLE')
    const verify = async () => {
      await authority.read(selected.design.scope.clientId)
      await dependencyRecords(design, db, libraryAuthority(authority))
      await verifyExactDesignAssets(design, libraryAuthority(authority), db, storage)
      const registered = await verifyDesignModuleAssets(design, db, authority.read, storage)
      if (registered.some(asset => !design.assets.some(item => stableDesignJson(item) === stableDesignJson(asset)))) throw new DesignModuleError('ASSET_NOT_READY')
      await authority.write(request.clientId)
    }
    await verify()
    const campaign = await createCampaign({ ...request.campaign,
      subject: request.campaign.subject !== undefined ? request.campaign.subject : selected.subject,
      preview_text: request.campaign.preview_text !== undefined ? request.campaign.preview_text : selected.previewText,
      body_source: design.blocks, template_id: request.templateId, client_id: request.clientId, created_by: authority.actorId
    } as CreateCampaignInput, renderer, db, { templateRevisionId: selected.revisionId })
    await verify()
    const baseline = await ensureLegacyDesignDocument({ kind: 'campaign-draft', ownerId: campaign.id, actorId: authority.actorId }, authority.write, cb => cb(db))
    // First conversion pins the exact selected template UUID. Ordinary successors
    // inherit this immutable pin through the common campaign projection helper.
    const revision = (await db.query(`INSERT INTO email_design_revisions(document_id,parent_revision_id,schema_version,payload_text,created_by,subject,preview_text,base_template_revision_id,rendered_html_sha256)
      VALUES ($1,$2,1,$3,$4,$5,$6,$7,encode(sha256(convert_to($8,'UTF8')),'hex')) RETURNING id`,
    [baseline.documentId, baseline.revisionId, JSON.stringify(design), authority.actorId, campaign.subject, campaign.preview_text, selected.revisionId, campaign.body_html])).rows[0] as { id: string }
    await db.query('UPDATE email_design_documents SET head_revision_id=$2 WHERE id=$1', [baseline.documentId, revision.id])
    const { writeDesignDraftProjection } = await import('./designDraftOwners')
    await writeDesignDraftProjection(db, await lockDesignDraftOwner(db, baseline.documentId), revision.id, design, campaign.body_html!, { subject: campaign.subject, previewText: campaign.preview_text })
    await verify()
    await db.query('INSERT INTO email_design_revision_receipts(actor_id,operation_id,document_id,payload_sha256,revision_id) VALUES ($1,$2,$3,$4,$5)',
      [authority.actorId, request.operationId, baseline.documentId, digest, revision.id])
    return { campaignId: campaign.id, documentId: baseline.documentId, revisionId: revision.id }
  })
}

const ContentPatch = z.object({
  name: z.string().min(1).max(200).optional(), subject: z.string().max(300).nullable().optional(), preview_text: z.string().max(300).nullable().optional(),
  from_name: z.string().max(200).nullable().optional(), from_email: email, reply_to: email, body_source: z.unknown().optional(),
  template_id: z.string().uuid().nullable().optional(), scheduled_at: z.string().nullable().optional(), filter_rules: z.unknown().optional(),
  utm_settings: z.record(z.string(), z.string().max(100).nullable()).nullable().optional(), web_version_enabled: z.boolean().optional()
}).strict()

export interface CampaignContentMutation {
  actorId: string
  operationId: string
  expectedRevisionId: string
  authorizeWrite: CampaignDesignAuthority['write']
  authorizeRead: CampaignDesignAuthority['read']
  storage?: DesignAssetStorage
}
/** Merge composer blocks into the expected saved envelope, never reconstruct its
 * policy/lineage/pins. Generic staff saves cannot change image source URLs. */
export async function saveCampaignContentPatch(campaignId: string, patch: Record<string, unknown>, context: CampaignContentMutation,
  renderer: EmailRendererClient, db: DesignDb) {
  patch = Object.fromEntries(Object.entries(ContentPatch.parse(patch)).filter(([, value]) => value !== undefined))
  if (patch.filter_rules != null && !isValidSegment(patch.filter_rules)) throw createError({ statusCode: 400, statusMessage: 'invalid_segment' })
  z.object({ actorId: z.string().uuid(), operationId: z.string().uuid(), expectedRevisionId: z.string().uuid() }).parse(context)
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${context.actorId}:${context.operationId}`])
  await assertLibraryOperationNamespace(db, context.actorId, context.operationId, 'revision')
  const doc = (await db.query('SELECT id FROM email_design_documents WHERE campaign_id=$1', [campaignId])).rows[0] as { id: string } | undefined
  if (!doc) throw createError({ statusCode: 409, statusMessage: 'design_revision_required' })
  await lockDesignDraftOwner(db, doc.id)
  const expected = (await db.query('SELECT payload,subject,preview_text FROM email_design_revisions WHERE document_id=$1 AND id=$2 AND schema_version=1', [doc.id, context.expectedRevisionId])).rows[0] as { payload: unknown, subject: string | null, preview_text: string | null } | undefined
  if (!expected) throw createError({ statusCode: 409, statusMessage: 'design_revision_required' })
  const base = validateEmailDesign(expected.payload)
  const candidate = validateContentReturn(base, { ...base, blocks: patch.body_source !== undefined ? patch.body_source : base.blocks })
  for (const [id, block] of Object.entries(base.blocks)) {
    if (['Image', 'Avatar'].includes(block.type) && ['url', 'darkSrc'].some(field => block.data.props?.[field] !== candidate.blocks[id]?.data.props?.[field]))
      throw createError({ statusCode: 409, statusMessage: 'use_registered_image_replacement' })
  }
  const authority = libraryAuthority({ actorId: context.actorId, read: context.authorizeRead, write: context.authorizeWrite })
  const verify = async () => {
    await verifyExactDesignAssets(candidate, authority, db, context.storage)
    await context.authorizeWrite(base.scope.clientId)
  }
  await verify()
  const prior = (await db.query('SELECT revision_id FROM email_design_revision_receipts WHERE actor_id=$1 AND operation_id=$2', [context.actorId, context.operationId])).rows[0]
  const receipt = await saveStaffCampaignDesignDraft({ documentId: doc.id, actorId: context.actorId, operationId: context.operationId,
    expectedRevisionId: context.expectedRevisionId, design: candidate,
    subject: patch.subject !== undefined ? patch.subject as string | null : expected.subject,
    previewText: patch.preview_text !== undefined ? patch.preview_text as string | null : expected.preview_text },
  context.authorizeWrite, { ...renderer, renderDocument: async (...args) => {
    const html = await renderer.renderDocument(...args)
    await verify()
    return html
  } }, cb => cb(db),
  { requestContext: { campaignId, patch }, authorizeModuleRead: (_id, scope) => context.authorizeRead(scope), authorizeTemplateRead: (_id, scope) => context.authorizeRead(scope) })
  return { ...receipt, replayed: !!prior }
}

export interface CanonicalCampaignReadiness {
  campaignId: string
  clientId: string | null
  documentId: string
  revisionId: string
  html: string
  sourceDigest: string
}
function campaignCorrection() {
  return createError({ statusCode: 409, statusMessage: 'canonical_campaign_asset_correction_required', message: 'Reload the campaign and replace unsupported images with registered assets before review or sending.' })
}
function readinessFailure(error: unknown): never {
  const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : null
  if (['ASSET_NOT_READY', 'SCOPE_MISMATCH', 'NOT_FOUND'].includes(code ?? '')) throw campaignCorrection()
  if (code === 'ASSET_STORAGE_UNAVAILABLE') throw createError({ statusCode: 503, statusMessage: code })
  throw error
}
/** Database-only identity/projection check, reused under the review locks. */
async function readCanonicalCampaignState(campaign: Campaign, db: DesignDb) {
  const row = (await db.query('SELECT d.id,c.body_html,c.email_design_revision_id FROM email_design_documents d JOIN campaigns c ON c.id=d.campaign_id WHERE c.id=$1', [campaign.id])).rows[0] as { id: string, body_html: string, email_design_revision_id: string } | undefined
  if (!row || row.email_design_revision_id !== campaign.email_design_revision_id || row.body_html !== campaign.body_html) throw campaignCorrection()
  const authorize = async (scope: string | null) => {
    if (scope !== null && scope !== campaign.client_id) throw campaignCorrection()
  }
  const draft = await getDesignDraft(row.id, authorize, db)
  if (draft.state !== 'structured' || draft.owner.kind !== 'campaign' || draft.owner.id !== campaign.id || draft.projection.state !== 'current' || draft.headRevisionId !== row.email_design_revision_id) throw campaignCorrection()
  return { row, draft, authorize }
}
/** No compiler/upload/mirror/URL fetch. Registered-byte I/O happens in the
 * preflight caller, before review opens a transaction or acquires locks. */
export async function prepareCanonicalCampaignReadiness(campaign: Campaign, db: DesignDb, storage?: DesignAssetStorage): Promise<CanonicalCampaignReadiness> {
  try {
    const { row, draft, authorize } = await readCanonicalCampaignState(campaign, db)
    const authority = libraryAuthority({ actorId: campaign.id, read: authorize, write: authorize })
    await verifyExactDesignAssets(draft.source, authority, db, storage)
    const assets = await verifyDesignModuleAssets(draft.source, db, authorize, storage)
    if (assets.some(asset => !draft.source.assets.some(saved => stableDesignJson(saved) === stableDesignJson(asset)))) throw campaignCorrection()
    await verifySavedDesignHtmlAssets(draft.source, row.body_html, db, authorize, storage)
    return { campaignId: campaign.id, clientId: campaign.client_id, documentId: row.id, revisionId: row.email_design_revision_id, html: row.body_html, sourceDigest: await designDigest(draft.source) }
  } catch (error) { return readinessFailure(error) }
}
export async function assertCanonicalCampaignReady(campaign: Campaign, db: DesignDb, storage?: DesignAssetStorage): Promise<string> {
  return (await prepareCanonicalCampaignReadiness(campaign, db, storage)).html
}
/** Compare only server-derived preflight identity/content with the fresh locked
 * projection. This result is never accepted from a browser/request parameter. */
export async function recheckCanonicalCampaignReadiness(campaign: Campaign, db: DesignDb, prepared: CanonicalCampaignReadiness): Promise<void> {
  try {
    const { row, draft } = await readCanonicalCampaignState(campaign, db)
    if (prepared.campaignId !== campaign.id || prepared.clientId !== campaign.client_id || prepared.documentId !== row.id
      || prepared.revisionId !== row.email_design_revision_id || prepared.html !== row.body_html || prepared.sourceDigest !== await designDigest(draft.source)) throw campaignCorrection()
  } catch (error) { readinessFailure(error) }
}

/** Future first-Open caller must use this one transaction, never snapshot then
 * convert in separate commits. Existing canonical source is read unchanged. */
export async function initializeCampaignOwnedDraft(input: { campaignId: string, operationId: string }, authority: ModuleAuthority,
  renderer: EmailRendererClient, storage?: DesignAssetStorage, run: DesignTransaction = defaultTransaction) {
  const request = z.object({ campaignId: z.string().uuid(), operationId: z.string().uuid() }).strict().parse(input)
  const digest = await designDigest({ boundary: 'email-campaign-first-conversion-v1', request })
  return run(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${authority.actorId}:${request.operationId}`])
    await assertLibraryOperationNamespace(db, authority.actorId, request.operationId, 'revision')
    const owner = (await db.query('SELECT id,client_id,status,subject,preview_text FROM campaigns WHERE id=$1 FOR UPDATE', [request.campaignId])).rows[0] as { id: string, client_id: string, status: string, subject: string | null, preview_text: string | null } | undefined
    if (!owner) throw new DesignModuleError('NOT_FOUND')
    await authority.read(owner.client_id)
    const prior = (await db.query(`SELECT r.document_id,r.revision_id,r.payload_sha256,d.campaign_id FROM email_design_revision_receipts r
      JOIN email_design_documents d ON d.id=r.document_id WHERE r.actor_id=$1 AND r.operation_id=$2`, [authority.actorId, request.operationId])).rows[0] as { document_id: string, revision_id: string, payload_sha256: string, campaign_id: string } | undefined
    if (prior) {
      if (prior.payload_sha256 !== digest || prior.campaign_id !== owner.id) throw new DesignModuleError('IDEMPOTENCY_CONFLICT')
      return { campaignId: owner.id, documentId: prior.document_id, revisionId: prior.revision_id }
    }
    // The legacy initialization owner performs its exact whole-row drift check.
    await authority.designer(owner.client_id)
    const baseline = await initializeCampaignDesignDraft({ campaignId: owner.id, actorId: authority.actorId, expectedClientId: owner.client_id }, authority.designer, cb => cb(db))
    const draft = await getDesignDraft(baseline.documentId, authority.read, db)
    if (draft.state === 'structured') return { campaignId: owner.id, documentId: draft.documentId, revisionId: draft.headRevisionId }
    const legacy = JSON.parse(draft.source) as { body_source: unknown }
    const design = composerToDesignDraft(legacy.body_source, owner.client_id, 'campaign-draft')
    design.assets = await verifyDesignModuleAssets(design, db, authority.read, storage)
    const html = await renderDraft(renderer, design, owner.subject, owner.preview_text)
    await verifyExactDesignAssets(design, authority, db, storage)
    await authority.designer(owner.client_id)
    const revisionId = await appendModuleOrDraft(db, baseline.documentId, baseline.revisionId, design, authority.actorId, owner.subject, owner.preview_text, html)
    await authority.designer(owner.client_id)
    await db.query('INSERT INTO email_design_revision_receipts(actor_id,operation_id,document_id,payload_sha256,revision_id) VALUES ($1,$2,$3,$4,$5)',
      [authority.actorId, request.operationId, baseline.documentId, digest, revisionId])
    return { campaignId: owner.id, documentId: baseline.documentId, revisionId }
  })
}
