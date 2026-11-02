import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { validateEmailDesign, type EmailDesignDocument } from '../../../shared/emailRendering/designContract'
import { designToRendererDocument } from '../../../shared/emailRendering/designAdapter'
import { applyModuleInstance, DesignModuleError, designDigest, extractDesignModule, insertDesignImage, parseDesignModuleRequest, moduleLocalOverrides, type ModuleRecord, stableDesignJson } from '../../../shared/emailRendering/designModules'
import type { EmailRendererClient } from '../../../shared/emailRendering/contract'
import { ensureLegacyDesignDocument, type DesignDb, type DesignTransaction } from './designRevisions'
import { getTemplateDesignDraft } from './designReads'
import { resolveStoredDesignDependencies } from './designDependencies'
import { readPublishedEmailAsset, verifyDesignModuleAssets, type DesignAssetStorage } from './designAssets'

export interface ModuleAuthority {
  actorId: string
  read(scope: string | null): Promise<void>
  designer(scope: string | null): Promise<void>
  publisher(scope: string | null): Promise<void>
}
type ModuleRow = { id: string, client_id: string | null, document_id: string, head_revision_id: string, schema_version: number, payload: unknown }
/** Exact immutable selection; no latest-head substitution or mutable block read. */
export async function readImmutableDesignModule(moduleId: string, revisionId: string, authorize: ModuleAuthority['read'], db: DesignDb): Promise<ModuleRecord> {
  z.object({ moduleId: z.string().uuid(), revisionId: z.string().uuid() }).parse({ moduleId, revisionId })
  const row = (await db.query(`SELECT m.id,m.client_id,d.id AS document_id,d.client_id AS document_client_id,d.head_revision_id,r.schema_version,r.payload
    FROM edm_custom_modules m JOIN email_design_documents d ON d.module_id=m.id
    JOIN email_design_revisions r ON r.document_id=d.id
    WHERE m.id=$1 AND r.id=$2`, [moduleId, revisionId])).rows[0] as (ModuleRow & { document_client_id: string | null }) | undefined
  if (!row) throw new DesignModuleError('NOT_FOUND')
  await authorize(row.client_id)
  if (row.client_id !== row.document_client_id || row.schema_version !== 1) throw new DesignModuleError('NOT_FOUND')
  const design = validateEmailDesign(row.payload)
  if (design.kind !== 'module' || design.scope.clientId !== row.client_id) throw new DesignModuleError('SCOPE_MISMATCH')
  return { moduleId, revisionId, design }
}
async function lockDraft(db: DesignDb, draftId: string) {
  const row = (await db.query('SELECT template_id,client_id FROM email_design_documents WHERE id=$1', [draftId])).rows[0] as { template_id: string | null, client_id: string | null } | undefined
  if (!row?.template_id) throw new DesignModuleError('NOT_FOUND')
  await db.query('SELECT id FROM edm_templates WHERE id=$1 FOR UPDATE', [row.template_id])
  await db.query('SELECT head_revision_id FROM email_design_documents WHERE id=$1 FOR UPDATE', [draftId])
  return row
}
async function appendModuleOrDraft(db: DesignDb, documentId: string, parent: string, design: EmailDesignDocument, actor: string, subject: string | null = null, preview: string | null = null) {
  const row = (await db.query(`INSERT INTO email_design_revisions(document_id,parent_revision_id,schema_version,payload_text,created_by,subject,preview_text)
    VALUES ($1,$2,1,$3,$4,$5,$6) RETURNING id`, [documentId, parent, JSON.stringify(validateEmailDesign(design)), actor, subject, preview])).rows[0] as { id: string }
  await db.query('UPDATE email_design_documents SET head_revision_id=$2 WHERE id=$1', [documentId, row.id])
  return row.id
}
async function dependencyRecords(design: EmailDesignDocument, db: DesignDb, authority: ModuleAuthority): Promise<ModuleRecord[]> {
  return resolveStoredDesignDependencies(design, db, (_id, scope) => authority.read(scope))
}
async function renderDraft(renderer: EmailRendererClient, design: EmailDesignDocument, subject: string | null, preview: string | null) {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      renderer.renderDocument(designToRendererDocument(design).document, { ...(subject != null ? { subjectLine: subject } : {}), ...(preview != null ? { previewText: preview } : {}) }),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('module_render_timeout')), 15_000)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}
/** No automatic retry. Reconcile an uncertain acknowledgement by submitting the
 * SAME request/operationId. Its receipt is committed with the one canonical head. */
export async function executeDesignModules(input: unknown, authority: ModuleAuthority, renderer: EmailRendererClient, storage?: DesignAssetStorage, transaction: DesignTransaction = cb => transactionWithoutRetry(db => cb(db))) {
  const request = parseDesignModuleRequest(input)
  z.string().uuid().parse(authority.actorId)
  const digest = await designDigest({ boundary: 'email-modules-v1', request })
  return transaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`${authority.actorId}:${request.operationId}`])
    // Resolve original persisted source scope even for a replay. A receipt never
    // bypasses revocation and never obtains authority from JSON declarations.
    const identity = await lockDraft(db, request.draftId)
    const publish = request.command === 'publish-module' || request.command === 'revise-module'
    await (publish ? authority.publisher : authority.designer)(identity.client_id)
    await authority.read(identity.client_id)
    const prior = (await db.query(`SELECT c.document_id,c.revision_id,c.payload_sha256,d.module_id,d.template_id,d.client_id
      FROM email_design_revision_receipts c JOIN email_design_documents d ON d.id=c.document_id
      WHERE c.actor_id=$1 AND c.operation_id=$2`, [authority.actorId, request.operationId])).rows[0] as { document_id: string, revision_id: string, payload_sha256: string, module_id: string | null, template_id: string | null, client_id: string | null } | undefined
    if (prior) {
      if (prior.payload_sha256 !== digest) throw new DesignModuleError('IDEMPOTENCY_CONFLICT')
      await (publish ? authority.publisher : authority.designer)(prior.client_id)
      return { documentId: prior.document_id, revisionId: prior.revision_id, ...(prior.module_id ? { moduleId: prior.module_id } : {}), published: publish }
    }
    const draft = await getTemplateDesignDraft(request.draftId, authority.read, db)
    if (draft.headRevisionId !== request.expectedDraftRevisionId) throw new DesignModuleError('REVISION_CONFLICT')
    if (draft.state !== 'structured' || draft.projection.state !== 'current') throw new DesignModuleError('SAVED_DRAFT_REQUIRED')
    const current = draft.source
    if (current.source.nativeArtifact !== null) throw new DesignModuleError('NATIVE_ARTIFACT_STORAGE_UNAVAILABLE')
    let records = await dependencyRecords(current, db, authority)
    let documentId = request.draftId
    let moduleId: string | undefined
    let revisionId: string
    let result: EmailDesignDocument
    if (request.command === 'publish-module' || request.command === 'revise-module') {
      result = extractDesignModule(current, request.rootBlockIds, records, request.includedOverridePaths)
      result.assets = await verifyDesignModuleAssets(result, db, authority.read, storage)
      designToRendererDocument(result)
      // Module validation has no subject/footer send gates.
      let baseline: string
      if (request.command === 'publish-module') {
        const module = (await db.query(`INSERT INTO edm_custom_modules(name,description,category,blocks,preview_tone,client_id,created_by)
          VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7) RETURNING id`, [request.name, request.description, request.category, JSON.stringify({ blocks: result.blocks, rootChildrenIds: result.rootChildrenIds }), request.previewTone, identity.client_id, authority.actorId])).rows[0] as { id: string }
        moduleId = module.id
        const initialized = await ensureLegacyDesignDocument({ kind: 'module', ownerId: module.id, actorId: authority.actorId }, authority.publisher, cb => cb(db))
        documentId = initialized.documentId
        baseline = initialized.revisionId
      } else {
        const owner = (await db.query('SELECT id,client_id FROM edm_custom_modules WHERE id=$1 FOR UPDATE', [request.moduleId])).rows[0] as { id: string, client_id: string | null } | undefined
        if (!owner) throw new DesignModuleError('NOT_FOUND')
        await authority.publisher(owner.client_id)
        // Publication scope is derived from source and destination; no widening.
        if (owner.client_id !== identity.client_id) throw new DesignModuleError('SCOPE_MISMATCH')
        const doc = (await db.query('SELECT id,head_revision_id FROM email_design_documents WHERE module_id=$1 FOR UPDATE', [owner.id])).rows[0] as { id: string, head_revision_id: string } | undefined
        if (!doc || doc.head_revision_id !== request.expectedModuleRevisionId) throw new DesignModuleError('REVISION_CONFLICT')
        moduleId = owner.id
        documentId = doc.id
        baseline = doc.head_revision_id
      }
      await authority.publisher(identity.client_id)
      await authority.read(current.scope.clientId)
      await dependencyRecords(result, db, authority)
      revisionId = await appendModuleOrDraft(db, documentId, baseline, result, authority.actorId)
      await db.query('UPDATE edm_custom_modules SET name=$2,description=$3,category=$4,preview_tone=$5,blocks=$6::jsonb,updated_at=NOW() WHERE id=$1', [moduleId, request.name, request.description, request.category, request.previewTone, JSON.stringify({ blocks: result.blocks, rootChildrenIds: result.rootChildrenIds })])
    } else {
      if (request.command === 'insert-published-image') {
        if (!storage) throw new DesignModuleError('ASSET_STORAGE_UNAVAILABLE')
        const verified = await readPublishedEmailAsset(request.assetId, current.scope.clientId, db, authority.read, storage)
        result = insertDesignImage(current, verified.asset, verified.url, request.operationId, request)
      } else {
        if (request.command !== 'detach-module-instance') {
          const id = request.command === 'insert-module' ? request.moduleId : current.moduleInstances.find(i => i.instanceId === request.instanceId)?.moduleId
          if (!id) throw new DesignModuleError('NOT_FOUND')
          const selected = await readImmutableDesignModule(id, request.revisionId, authority.read, db)
          const verifiedAssets = await verifyDesignModuleAssets(selected.design, db, authority.read, storage)
          if (stableDesignJson(verifiedAssets) !== stableDesignJson(selected.design.assets)) throw new DesignModuleError('ASSET_NOT_READY')
          const nested = await dependencyRecords(selected.design, db, authority)
          records = [...records, selected, ...nested]
        }
        result = applyModuleInstance(current, request, records)
        if (request.command !== 'detach-module-instance') {
          const instanceId = request.command === 'insert-module' ? request.operationId : request.instanceId
          const instance = result.moduleInstances.find(i => i.instanceId === instanceId)!
          const record = records.find(r => r.moduleId === instance.moduleId && r.revisionId === instance.revisionId)!
          // Preserved local URL overrides need the same registered-asset checks
          // as newly inserted images, without reclassifying unrelated old blocks.
          const section = extractDesignModule(result, instance.rootBlockIds, records, Object.keys(moduleLocalOverrides(result, instanceId, record.design)))
          for (const asset of await verifyDesignModuleAssets(section, db, authority.read, storage)) {
            const previous = result.assets.find(a => a.id === asset.id)
            if (previous && stableDesignJson(previous) !== stableDesignJson(asset)) throw new DesignModuleError('ASSET_NOT_READY')
            if (!previous) result.assets.push(asset)
          }
        }
      }
      await dependencyRecords(result, db, authority)
      const metadata = (await db.query('SELECT subject,preview_text FROM edm_templates WHERE id=$1', [draft.templateId])).rows[0] as { subject: string | null, preview_text: string | null }
      const html = await renderDraft(renderer, result, metadata.subject, metadata.preview_text)
      await authority.designer(identity.client_id)
      await authority.read(identity.client_id)
      await dependencyRecords(result, db, authority)
      revisionId = await appendModuleOrDraft(db, documentId, draft.headRevisionId, result, authority.actorId, metadata.subject, metadata.preview_text)
      await db.query('UPDATE edm_templates SET body_source=$2::jsonb,body_html=$3,email_design_revision_id=$4,updated_at=NOW() WHERE id=$1', [draft.templateId, JSON.stringify(result.blocks), html, revisionId])
    }
    await db.query(`INSERT INTO email_design_revision_receipts(actor_id,operation_id,document_id,payload_sha256,revision_id)
      VALUES ($1,$2,$3,$4,$5)`, [authority.actorId, request.operationId, documentId, digest, revisionId])
    return { documentId, revisionId, ...(moduleId ? { moduleId } : {}), published: publish }
  })
}
