import { assertLibraryOperationNamespace } from './designLibraryOperations'
import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { validateEmailDesign, type EmailDesignDocument } from '../../../shared/emailRendering/designContract'
import {
  designDigest,
  DesignModuleError,
  moduleLocalOverrides,
  stableDesignJson,
  type ModuleRecord
} from '../../../shared/emailRendering/designModules'
import { parseDesignTemplateRequest, type DesignLibraryReceipt, type DesignTemplateRequest } from '../../../shared/emailRendering/designTemplates'
import type { EmailRendererClient } from '../../../shared/emailRendering/contract'
import { ensureLegacyDesignDocument, digestDesignHtml, type DesignDb, type DesignTransaction } from './designRevisions'
import { appendModuleOrDraft, dependencyRecords, lockDraft, renderDraft, type ModuleAuthority } from './designModules'
import { verifyDesignModuleAssets, verifySavedDesignHtmlAssets, readPublishedEmailAsset, type DesignAssetStorage } from './designAssets'
import { assertDesignDraftMutable, type DesignDraftDocumentRow, type LockedDesignDraftOwner } from './designDraftOwners'
import { getDesignDraft } from './designReads'

type TemplateIdentity = {
  id: string
  client_id: string | null
  template_kind: string
  name: string
  folder_name: string | null
  subject: string | null
  preview_text: string | null
}
export async function readImmutableDesignTemplate(
  templateId: string,
  revisionId: string,
  authority: ModuleAuthority,
  db: DesignDb
) {
  z.object({ templateId: z.string().uuid(), revisionId: z.string().uuid() }).parse({ templateId, revisionId })
  const row = (
    await db.query(
      `SELECT t.*,d.id AS document_id,d.client_id AS document_client_id,d.head_revision_id,r.schema_version,r.payload,r.subject,r.preview_text
    FROM edm_templates t JOIN email_design_documents d ON d.template_id=t.id
    JOIN email_design_revisions r ON r.document_id=d.id WHERE t.id=$1 AND r.id=$2`,
      [templateId, revisionId]
    )
  ).rows[0] as
    | (TemplateIdentity & {
      document_id: string
      document_client_id: string | null
      head_revision_id: string
      schema_version: number
      payload: unknown
    })
    | undefined
  if (!row) throw new DesignModuleError('NOT_FOUND')
  await authority.read(row.client_id)
  if (row.client_id !== row.document_client_id || row.schema_version !== 1 || !['template', 'draft'].includes(row.template_kind))
    throw new DesignModuleError('NOT_FOUND')
  const design = validateEmailDesign(row.payload)
  if (design.kind !== 'template' || design.scope.clientId !== row.client_id)
    throw new DesignModuleError('SCOPE_MISMATCH')
  await dependencyRecords(design, db, authority)
  await authority.read(row.client_id)
  return {
    templateId,
    documentId: row.document_id,
    revisionId,
    headRevisionId: row.head_revision_id,
    design,
    subject: row.subject,
    previewText: row.preview_text
  }
}
export function reviewedOverridePaths(design: EmailDesignDocument, records: ModuleRecord[]) {
  return [
    ...new Set(
      design.moduleInstances.flatMap((instance) => {
        const record = records.find(r => r.moduleId === instance.moduleId && r.revisionId === instance.revisionId)
        if (!record) throw new DesignModuleError('NOT_FOUND')
        return Object.keys(moduleLocalOverrides(design, instance.instanceId, record.design))
      })
    )
  ].sort()
}
/** Retain every immutable descriptor and verify it against registered bytes and
 * current destination scope. No URL fetches or mutable module-head substitution. */
export async function verifyExactDesignAssets(
  design: EmailDesignDocument,
  authority: ModuleAuthority,
  db: DesignDb,
  storage?: DesignAssetStorage
) {
  for (const asset of design.assets) {
    if (!storage) throw new DesignModuleError('ASSET_STORAGE_UNAVAILABLE')
    const verified = await readPublishedEmailAsset(asset.id, design.scope.clientId, db, authority.read, storage)
    if (stableDesignJson(verified.asset) !== stableDesignJson(asset)) throw new DesignModuleError('ASSET_NOT_READY')
  }
  // Unlike library publication, history/copies can preserve an existing legacy
  // block. Publication separately requires supported registered image mappings.
}
type ReviseTemplateRequest = Extract<DesignTemplateRequest, { command: 'revise-template' }>
/** Both persisted owners are locked before either document, in deterministic
 * table/UUID order. Single-owner draft writers retain their existing order. */
async function lockPublicationOwners(db: DesignDb, request: ReviseTemplateRequest) {
  const source = (await db.query('SELECT * FROM email_design_documents WHERE id=$1', [request.draftId])).rows[0] as DesignDraftDocumentRow | undefined
  const target = (await db.query('SELECT * FROM email_design_documents WHERE template_id=$1', [request.templateId])).rows[0] as DesignDraftDocumentRow | undefined
  if (!source || !target || source.module_id || (!source.template_id && !source.campaign_id) || source.id === target.id) throw new DesignModuleError('NOT_FOUND')
  const owners = [
    { table: source.template_id ? 'edm_templates' as const : 'campaigns' as const, id: source.template_id ?? source.campaign_id!, document: source },
    { table: 'edm_templates' as const, id: target.template_id!, document: target }
  ].sort((a, b) => `${a.table}:${a.id}`.localeCompare(`${b.table}:${b.id}`))
  const locked = new Map<string, LockedDesignDraftOwner>()
  for (const owner of owners) {
    const row = (await db.query(`SELECT client_id,${owner.table === 'edm_templates' ? 'template_kind,subject,preview_text' : 'status,subject,preview_text'} FROM ${owner.table} WHERE id=$1 FOR UPDATE`, [owner.id])).rows[0] as { client_id: string | null, template_kind?: string, status?: string, subject: string | null, preview_text: string | null } | undefined
    if (!row) throw new DesignModuleError('NOT_FOUND')
    if (row.client_id !== owner.document.client_id) throw new DesignModuleError('SCOPE_MISMATCH')
    locked.set(owner.document.id, { ...row, owner: { kind: owner.table === 'edm_templates' ? 'template' : 'campaign', id: owner.id }, table: owner.table, document: owner.document })
  }
  for (const document of [source, target].sort((a, b) => a.id.localeCompare(b.id))) {
    const row = (await db.query('SELECT head_revision_id FROM email_design_documents WHERE id=$1 FOR UPDATE', [document.id])).rows[0] as { head_revision_id: string | null } | undefined
    if (!row) throw new DesignModuleError('NOT_FOUND')
    document.head_revision_id = row.head_revision_id
  }
  return { source: locked.get(source.id)!, target: locked.get(target.id)! }
}

/** Same publication owner/receipt namespace, with an explicit target-head CAS.
 * No nested transaction and no automatic retry after an unknown commit. */
async function revisePublishedTemplate(db: DesignDb, request: ReviseTemplateRequest, digest: string, authority: ModuleAuthority,
  renderer: EmailRendererClient, storage?: DesignAssetStorage): Promise<DesignLibraryReceipt> {
  const prior = (await db.query(`SELECT c.document_id,c.revision_id,c.payload_sha256,d.template_id,d.client_id
    FROM email_design_revision_receipts c JOIN email_design_documents d ON d.id=c.document_id
    WHERE c.actor_id=$1 AND c.operation_id=$2`, [authority.actorId, request.operationId])).rows[0] as { document_id: string, revision_id: string, payload_sha256: string, template_id: string | null, client_id: string | null } | undefined
  if (prior && (prior.payload_sha256 !== digest || prior.template_id !== request.templateId.toLowerCase())) throw new DesignModuleError('IDEMPOTENCY_CONFLICT')
  const owners = await lockPublicationOwners(db, request)
  const authorize = async () => {
    // Reading the source does not grant destination publication, or vice versa.
    for (const owner of [owners.source, owners.target]) {
      await authority.read(owner.client_id)
      await authority.publisher(owner.client_id)
    }
  }
  await authorize()
  if (owners.target.template_kind !== 'template') throw new DesignModuleError('NOT_FOUND')
  if (owners.source.client_id !== owners.target.client_id) throw new DesignModuleError('SCOPE_MISMATCH')
  if (prior) {
    if (prior.document_id !== owners.target.document.id || prior.client_id !== owners.target.client_id) throw new DesignModuleError('IDEMPOTENCY_CONFLICT')
    await authorize()
    return { documentId: prior.document_id, revisionId: prior.revision_id, templateId: owners.target.owner.id, published: true }
  }
  assertDesignDraftMutable(owners.source)
  if (owners.target.document.head_revision_id !== request.expectedTemplateRevisionId.toLowerCase()) throw new DesignModuleError('REVISION_CONFLICT')
  const original = (await db.query('SELECT schema_version,payload FROM email_design_revisions WHERE document_id=$1 AND id=$2', [owners.target.document.id, request.expectedTemplateRevisionId])).rows[0] as { schema_version: number, payload: unknown } | undefined
  if (!original || original.schema_version !== 1 || validateEmailDesign(original.payload).kind !== 'template') throw new DesignModuleError('NOT_FOUND')
  const draft = await getDesignDraft(owners.source.document.id, authority.read, db)
  if (draft.headRevisionId !== request.expectedRevisionId.toLowerCase()) throw new DesignModuleError('REVISION_CONFLICT')
  if (draft.state !== 'structured' || draft.projection.state !== 'current') throw new DesignModuleError('SAVED_DRAFT_REQUIRED')
  const design = validateEmailDesign({ ...draft.source, kind: 'template' })
  if (design.scope.clientId !== owners.target.client_id) throw new DesignModuleError('SCOPE_MISMATCH')
  if (design.source.nativeArtifact !== null) throw new DesignModuleError('NATIVE_ARTIFACT_STORAGE_UNAVAILABLE')
  const verify = async () => {
    const records = await dependencyRecords(design, db, authority)
    if (stableDesignJson(reviewedOverridePaths(design, records)) !== stableDesignJson([...new Set(request.includedOverridePaths)].sort())) throw new DesignModuleError('LOCAL_OVERRIDE_REVIEW_REQUIRED')
    // Acquire registered-asset locks consistently without changing saved order.
    await verifyExactDesignAssets({ ...design, assets: [...design.assets].sort((a, b) => a.id.localeCompare(b.id)) }, authority, db, storage)
    const registered = await verifyDesignModuleAssets(design, db, authority.read, storage)
    if (registered.some(asset => !design.assets.some(saved => stableDesignJson(saved) === stableDesignJson(asset)))) throw new DesignModuleError('ASSET_NOT_READY')
    await authorize()
  }
  await verify()
  const { subject, previewText } = draft.metadata
  const html = await renderDraft(renderer, design, subject, previewText)
  await verify()
  await verifySavedDesignHtmlAssets(design, html, db, authority.read, storage)
  await authorize()
  const htmlHash = await digestDesignHtml(html)
  const revision = (await db.query(`INSERT INTO email_design_revisions(document_id,parent_revision_id,schema_version,payload_text,created_by,subject,preview_text,template_rendered_html_sha256)
    VALUES ($1,$2,1,$3,$4,$5,$6,$7) RETURNING id`, [owners.target.document.id, request.expectedTemplateRevisionId, JSON.stringify(design), authority.actorId, subject, previewText, htmlHash])).rows[0] as { id: string }
  await db.query('UPDATE email_design_documents SET head_revision_id=$2 WHERE id=$1', [owners.target.document.id, revision.id])
  await db.query(`UPDATE edm_templates SET name=$2,folder_name=$3,subject=$4,preview_text=$5,body_source=$6::jsonb,body_html=$7,email_design_revision_id=$8,updated_at=NOW() WHERE id=$1`,
    [request.templateId, request.name, request.category, subject, previewText, JSON.stringify(design.blocks), html, revision.id])
  await authorize()
  await db.query('INSERT INTO email_design_revision_receipts(actor_id,operation_id,document_id,payload_sha256,revision_id) VALUES ($1,$2,$3,$4,$5)', [authority.actorId, request.operationId, owners.target.document.id, digest, revision.id])
  return { documentId: owners.target.document.id, revisionId: revision.id, templateId: owners.target.owner.id, published: true }
}

/** Existing edm_templates owns publication and drafts. New library owners have
 * their immutable canonical head plus a pre-rendered projection inserted in the
 * same transaction; no mutable draft is promoted through legacy CRUD. */
export async function executeDesignTemplates(
  input: unknown,
  authority: ModuleAuthority,
  renderer: EmailRendererClient,
  storage?: DesignAssetStorage,
  transaction: DesignTransaction = cb => transactionWithoutRetry(db => cb(db))
): Promise<DesignLibraryReceipt> {
  const request = parseDesignTemplateRequest(input)
  z.string().uuid().parse(authority.actorId)
  const digest = await designDigest({ boundary: 'email-template-library-v1', request })
  return transaction(async (db) => {
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
      `${authority.actorId}:${request.operationId}`
    ])
    await assertLibraryOperationNamespace(db, authority.actorId, request.operationId, 'revision')
    if (request.command === 'revise-template') return revisePublishedTemplate(db, request, digest, authority, renderer, storage)
    let source: EmailDesignDocument, subject: string | null, preview: string | null
    const publish = request.command === 'publish-template'
    const sourceIdentity = publish ? await lockDraft(db, request.draftId) : undefined
    let sourceScope: string | null = sourceIdentity?.client_id ?? null
    const authorize = async () => {
      if (publish) {
        await authority.publisher(sourceIdentity!.client_id)
        await authority.read(sourceIdentity!.client_id)
      } else {
        // Reading the source never grants destination writing or agency publishing.
        await authority.designer(request.clientId)
      }
    }
    await authorize()
    if (!publish) {
      // Lock source owner then document in the canonical order. Head CAS is
      // required for new copies, while receipt replay keeps its original head.
      await db.query('SELECT id FROM edm_templates WHERE id=$1 FOR UPDATE', [request.templateId])
      await db.query('SELECT id FROM email_design_documents WHERE template_id=$1 FOR UPDATE', [request.templateId])
    }
    const prior = (
      await db.query(
        `SELECT c.document_id,c.revision_id,c.payload_sha256,d.template_id,d.client_id
      FROM email_design_revision_receipts c JOIN email_design_documents d ON d.id=c.document_id
      WHERE c.actor_id=$1 AND c.operation_id=$2`,
        [authority.actorId, request.operationId]
      )
    ).rows[0] as
    | {
      document_id: string
      revision_id: string
      payload_sha256: string
      template_id: string | null
      client_id: string | null
    }
    | undefined
    if (prior && (prior.payload_sha256 !== digest || !prior.template_id))
      throw new DesignModuleError('IDEMPOTENCY_CONFLICT')
    if (publish) {
      if (!prior) {
        if (sourceIdentity!.locked) assertDesignDraftMutable(sourceIdentity!.locked)
        const draft = await getDesignDraft(request.draftId, authority.read, db)
        if (draft.headRevisionId !== request.expectedRevisionId) throw new DesignModuleError('REVISION_CONFLICT')
        if (draft.state !== 'structured' || draft.projection.state !== 'current')
          throw new DesignModuleError('SAVED_DRAFT_REQUIRED')
        source = draft.source
      } else {
        const row = (
          await db.query('SELECT payload FROM email_design_revisions WHERE document_id=$1 AND id=$2', [
            request.draftId,
            request.expectedRevisionId
          ])
        ).rows[0] as { payload: unknown } | undefined
        if (!row) throw new DesignModuleError('NOT_FOUND')
        source = validateEmailDesign(row.payload)
      }
      const metadata = sourceIdentity!.locked
        ? { subject: sourceIdentity!.locked.subject ?? null, preview_text: sourceIdentity!.locked.preview_text ?? null }
        : (
            await db.query('SELECT subject,preview_text FROM edm_templates WHERE id=$1', [sourceIdentity!.template_id])
          ).rows[0] as { subject: string | null, preview_text: string | null }
      subject = metadata.subject
      preview = metadata.preview_text
      const records = await dependencyRecords(source, db, authority)
      if (
        stableDesignJson(reviewedOverridePaths(source, records))
        !== stableDesignJson([...new Set(request.includedOverridePaths)].sort())
      )
        throw new DesignModuleError('LOCAL_OVERRIDE_REVIEW_REQUIRED')
    } else {
      const selected = await readImmutableDesignTemplate(request.templateId, request.revisionId, authority, db)
      if (!prior && selected.headRevisionId !== request.expectedSourceHeadRevisionId)
        throw new DesignModuleError('REVISION_CONFLICT')
      if (selected.design.scope.clientId !== null && selected.design.scope.clientId !== request.clientId)
        throw new DesignModuleError('SCOPE_MISMATCH')
      sourceScope = selected.design.scope.clientId
      source = validateEmailDesign({ ...selected.design, scope: { clientId: request.clientId } })
      subject = selected.subject
      preview = selected.previewText
    }
    if (publish && (source.kind !== (sourceIdentity!.campaign_id ? 'campaign-draft' : 'template') || source.scope.clientId !== sourceIdentity!.client_id))
      throw new DesignModuleError('SCOPE_MISMATCH')
    if (publish && source.kind === 'campaign-draft') source = validateEmailDesign({ ...source, kind: 'template' })
    await dependencyRecords(source, db, authority)
    await verifyExactDesignAssets(source, authority, db, storage)
    if (prior) {
      await authority.read(prior.client_id)
      await authorize()
      return {
        documentId: prior.document_id,
        revisionId: prior.revision_id,
        templateId: prior.template_id!,
        published: publish
      }
    }
    if (publish) {
      if (source.source.nativeArtifact) throw new DesignModuleError('NATIVE_ARTIFACT_STORAGE_UNAVAILABLE')
      const assets = await verifyDesignModuleAssets(source, db, authority.read, storage)
      if (assets.some(asset => !source.assets.some(a => stableDesignJson(a) === stableDesignJson(asset))))
        throw new DesignModuleError('ASSET_NOT_READY')
    }
    const html = await renderDraft(renderer, source, subject, preview)
    await authorize()
    await dependencyRecords(source, db, authority)
    await verifyExactDesignAssets(source, authority, db, storage)
    // Source visibility and destination write authority are independent, and
    // must both survive rendering plus registered-byte verification.
    await authority.read(sourceScope)
    await authorize()
    const owner = (
      await db.query(
        `INSERT INTO edm_templates(name,subject,preview_text,body_source,body_html,template_kind,folder_name,client_id,created_by)
      VALUES ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9) RETURNING id`,
        [
          request.name,
          subject,
          preview,
          JSON.stringify(source.blocks),
          html,
          publish ? 'template' : 'draft',
          request.category,
          source.scope.clientId,
          authority.actorId
        ]
      )
    ).rows[0] as { id: string }
    const initialized = await ensureLegacyDesignDocument(
      { kind: 'template', ownerId: owner.id, actorId: authority.actorId },
      publish ? authority.publisher : authority.designer,
      cb => cb(db)
    )
    const revisionId = await appendModuleOrDraft(
      db,
      initialized.documentId,
      initialized.revisionId,
      source,
      authority.actorId,
      subject,
      preview
    )
    // Published rows are inserted fully rendered before canonical initialization;
    // the existing trigger permits projection updates only for draft owners.
    if (!publish)
      await db.query(
        'UPDATE edm_templates SET body_source=$2::jsonb,body_html=$3,email_design_revision_id=$4,updated_at=NOW() WHERE id=$1',
        [owner.id, JSON.stringify(source.blocks), html, revisionId]
      )
    await authority.read(sourceScope)
    await authorize()
    await db.query(
      'INSERT INTO email_design_revision_receipts(actor_id,operation_id,document_id,payload_sha256,revision_id) VALUES ($1,$2,$3,$4,$5)',
      [authority.actorId, request.operationId, initialized.documentId, digest, revisionId]
    )
    return { documentId: initialized.documentId, revisionId, templateId: owner.id, published: publish }
  })
}
