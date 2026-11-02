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
import { parseDesignTemplateRequest, type DesignLibraryReceipt } from '../../../shared/emailRendering/designTemplates'
import type { EmailRendererClient } from '../../../shared/emailRendering/contract'
import { ensureLegacyDesignDocument, type DesignDb, type DesignTransaction } from './designRevisions'
import { appendModuleOrDraft, dependencyRecords, lockDraft, renderDraft, type ModuleAuthority } from './designModules'
import { verifyDesignModuleAssets, readPublishedEmailAsset, type DesignAssetStorage } from './designAssets'
import { getTemplateDesignDraft } from './designReads'

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
        const draft = await getTemplateDesignDraft(request.draftId, authority.read, db)
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
      const metadata = (
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
    if (publish && (source.kind !== 'template' || source.scope.clientId !== sourceIdentity!.client_id))
      throw new DesignModuleError('SCOPE_MISMATCH')
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
    await db.query(
      'INSERT INTO email_design_revision_receipts(actor_id,operation_id,document_id,payload_sha256,revision_id) VALUES ($1,$2,$3,$4,$5)',
      [authority.actorId, request.operationId, initialized.documentId, digest, revisionId]
    )
    return { documentId: initialized.documentId, revisionId, templateId: owner.id, published: publish }
  })
}
