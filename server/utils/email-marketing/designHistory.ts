import { assertLibraryOperationNamespace } from './designLibraryOperations'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { deriveHistoryRestore, parseDesignHistoryRequest } from '../../../shared/emailRendering/designHistory'
import { designToRendererDocument } from '../../../shared/emailRendering/designAdapter'
import { validateEmailDesign, type EmailDesignDocument } from '../../../shared/emailRendering/designContract'
import { designDigest, DesignModuleError } from '../../../shared/emailRendering/designModules'
import type { EmailRendererClient } from '../../../shared/emailRendering/contract'
import type { DesignTransaction, DesignDb } from './designRevisions'
import { DesignRevisionError } from './designRevisions'
import { getTemplateDesignDraft } from './designReads'
import { appendModuleOrDraft, dependencyRecords, lockDraft, renderDraft, type ModuleAuthority } from './designModules'
import { verifyExactDesignAssets } from './designTemplates'
import type { DesignAssetStorage } from './designAssets'

type Snapshot = {
  id: string
  parent_revision_id: string | null
  schema_version: number
  payload: unknown
  subject: string | null
  preview_text: string | null
  created_at: string
}
async function snapshot(db: DesignDb, draftId: string, revisionId: string) {
  const row = (
    await db.query(
      'SELECT id,parent_revision_id,schema_version,payload,subject,preview_text,created_at FROM email_design_revisions WHERE document_id=$1 AND id=$2',
      [draftId, revisionId]
    )
  ).rows[0] as Snapshot | undefined
  if (!row) throw new DesignModuleError('NOT_FOUND')
  return row
}
/** Appends a new successor. Never rewinds a head, changes immutable snapshots or
 * imports browser design JSON. Fresh current policy and dependency access are
 * repeated after rendering before the atomic head/projection/receipt commit. */
export async function executeDesignHistory(
  input: unknown,
  authority: ModuleAuthority,
  renderer: EmailRendererClient,
  storage?: DesignAssetStorage,
  transaction: DesignTransaction = cb => transactionWithoutRetry(db => cb(db))
) {
  const request = parseDesignHistoryRequest(input)
  return transaction(async (db) => {
    if (request.command === 'restore-revision')
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `${authority.actorId}:${request.operationId}`
      ])
    if (request.command === 'restore-revision')
      await assertLibraryOperationNamespace(db, authority.actorId, request.operationId, 'revision')
    const identity = await lockDraft(db, request.draftId)
    await authority.read(identity.client_id)
    const current = await getTemplateDesignDraft(request.draftId, authority.read, db)
    if (current.state === 'structured') await dependencyRecords(current.source, db, authority)
    if (request.command === 'list-revisions') {
      let start = current.headRevisionId
      if (request.beforeRevisionId)
        start = (await snapshot(db, request.draftId, request.beforeRevisionId)).parent_revision_id ?? ''
      if (!start) return { currentRevisionId: current.headRevisionId, revisions: [], nextRevisionId: null }
      // Walk the immutable parent chain: timestamps can tie inside a transaction.
      const rows = (
        await db.query(
          `WITH RECURSIVE history AS (
        SELECT id,parent_revision_id,schema_version,created_at,subject,preview_text,0 AS depth FROM email_design_revisions WHERE document_id=$1 AND id=$2
        UNION ALL SELECT r.id,r.parent_revision_id,r.schema_version,r.created_at,r.subject,r.preview_text,h.depth+1 FROM email_design_revisions r
        JOIN history h ON r.id=h.parent_revision_id WHERE r.document_id=$1 AND h.depth<50)
        SELECT * FROM history ORDER BY depth LIMIT 51`,
          [request.draftId, start]
        )
      ).rows as Omit<Snapshot, 'payload'>[]
      return {
        currentRevisionId: current.headRevisionId,
        revisions: rows.slice(0, 50),
        nextRevisionId: rows.length > 50 ? rows[49]!.id : null
      }
    }
    const restore = request.command === 'restore-revision'
    if (restore) await authority.designer(identity.client_id)
    const digest = restore ? await designDigest({ boundary: 'email-history-restore-v1', request }) : null
    const prior = restore
      ? ((
          await db.query(
            'SELECT document_id,revision_id,payload_sha256 FROM email_design_revision_receipts WHERE actor_id=$1 AND operation_id=$2',
            [authority.actorId, request.operationId]
          )
        ).rows[0] as { document_id: string, revision_id: string, payload_sha256: string } | undefined)
      : undefined
    if (prior && (prior.document_id !== request.draftId || prior.payload_sha256 !== digest))
      throw new DesignModuleError('IDEMPOTENCY_CONFLICT')
    // Receipt replay is exact even after later heads; it never adopts that head.
    if (prior) {
      const committed = await snapshot(db, request.draftId, prior.revision_id)
      const design = validateEmailDesign(committed.payload)
      await dependencyRecords(design, db, authority)
      await verifyExactDesignAssets(design, authority, db, storage)
      await authority.designer(identity.client_id)
      return {
        documentId: request.draftId,
        revisionId: prior.revision_id,
        published: false as const,
        subject: committed.subject,
        previewText: committed.preview_text
      }
    }
    if (current.headRevisionId !== request.expectedRevisionId) throw new DesignModuleError('REVISION_CONFLICT')
    const chosen = await snapshot(db, request.draftId, request.revisionId)
    let candidate: EmailDesignDocument | null = null,
      blockedReason: string | null = null
    try {
      if (current.state !== 'structured' || current.projection.state !== 'current' || chosen.schema_version !== 1)
        throw new DesignRevisionError('STRUCTURED_REVISION_REQUIRED')
      await authority.designer(identity.client_id)
      candidate = deriveHistoryRestore(current.source, chosen.payload)
      designToRendererDocument(candidate)
      await dependencyRecords(candidate, db, authority)
      await verifyExactDesignAssets(candidate, authority, db, storage)
    } catch (error) {
      if (restore) throw error
      blockedReason
        = error && typeof error === 'object' && 'code' in error ? String(error.code) : 'CURRENT_AUTHORITY_REQUIRED'
    }
    if (!restore) {
      // Preview remains server derived, and historic scope/dependencies still
      // require read authority even when current policy blocks restoration.
      let design: EmailDesignDocument | null = null
      if (chosen.schema_version === 1) {
        design = validateEmailDesign(chosen.payload)
        if (design.scope.clientId !== identity.client_id || design.kind !== 'template')
          throw new DesignModuleError('SCOPE_MISMATCH')
        await dependencyRecords(design, db, authority)
      }
      let previewHtml: string | null = null
      if (design) {
        try {
          previewHtml = await renderDraft(renderer, design, chosen.subject, chosen.preview_text)
        } catch {
          blockedReason ??= 'PREVIEW_UNAVAILABLE'
        }
        await authority.read(identity.client_id)
        await dependencyRecords(design, db, authority)
      }
      return {
        previewHtml,
        draftId: request.draftId,
        revisionId: chosen.id,
        expectedRevisionId: current.headRevisionId,
        design,
        restorable: candidate !== null && blockedReason === null,
        blockedReason,
        subject: chosen.subject,
        previewText: chosen.preview_text
      }
    }
    if (!candidate) throw new DesignRevisionError('STRUCTURED_REVISION_REQUIRED')
    const html = await renderDraft(renderer, candidate, chosen.subject, chosen.preview_text)
    await authority.designer(identity.client_id)
    await authority.read(identity.client_id)
    await dependencyRecords(candidate, db, authority)
    await verifyExactDesignAssets(candidate, authority, db, storage)
    await authority.designer(identity.client_id)
    await authority.read(identity.client_id)
    const revisionId = await appendModuleOrDraft(
      db,
      request.draftId,
      current.headRevisionId,
      candidate,
      authority.actorId,
      chosen.subject,
      chosen.preview_text
    )
    await db.query(
      'UPDATE edm_templates SET subject=$2,preview_text=$3,body_source=$4::jsonb,body_html=$5,email_design_revision_id=$6,updated_at=NOW() WHERE id=$1',
      [identity.template_id, chosen.subject, chosen.preview_text, JSON.stringify(candidate.blocks), html, revisionId]
    )
    await db.query(
      'INSERT INTO email_design_revision_receipts(actor_id,operation_id,document_id,payload_sha256,revision_id) VALUES ($1,$2,$3,$4,$5)',
      [authority.actorId, request.operationId, request.draftId, digest, revisionId]
    )
    return {
      documentId: request.draftId,
      revisionId,
      published: false as const,
      subject: chosen.subject,
      previewText: chosen.preview_text
    }
  })
}
