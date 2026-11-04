import type { EmailDesignDocument } from '../../../shared/emailRendering/designContract'
import { designToRendererDocument } from '../../../shared/emailRendering/designAdapter'
import { DesignRevisionError, type DesignDb } from './designRevisions'

export type DesignDraftOwner = { kind: 'template', id: string } | { kind: 'campaign', id: string }
export type DesignDraftMetadata = { subject: string | null, previewText: string | null }
export type DesignDraftDocumentRow = {
  id: string
  template_id: string | null
  campaign_id: string | null
  module_id: string | null
  client_id: string | null
  head_revision_id: string | null
}
export type LockedDesignDraftOwner = {
  owner: DesignDraftOwner
  document: DesignDraftDocumentRow
  table: 'edm_templates' | 'campaigns'
  client_id: string | null
  template_kind?: string
  status?: string
  subject?: string | null
  preview_text?: string | null
}

/** A caller holding actor/operation acquires owner then document here. Only the
 * persisted, immutable document identity selects a table; no caller owner hint. */
export async function lockDesignDraftOwner(db: DesignDb, documentId: string): Promise<LockedDesignDraftOwner> {
  const document = (await db.query('SELECT * FROM email_design_documents WHERE id=$1', [documentId])).rows[0] as DesignDraftDocumentRow | undefined
  if (!document) throw new DesignRevisionError('NOT_FOUND')
  const owner: DesignDraftOwner = document.template_id
    ? { kind: 'template', id: document.template_id }
    : document.campaign_id && !document.module_id
      ? { kind: 'campaign', id: document.campaign_id }
      : (() => { throw new DesignRevisionError('KIND_MISMATCH') })()
  const table = owner.kind === 'template' ? 'edm_templates' : 'campaigns'
  const row = (await db.query(
    `SELECT client_id, ${owner.kind === 'template' ? 'template_kind, subject, preview_text' : 'status, to_jsonb(campaigns)->>\'subject\' AS subject, to_jsonb(campaigns)->>\'preview_text\' AS preview_text'} FROM ${table} WHERE id=$1 FOR UPDATE`,
    [owner.id]
  )).rows[0] as Omit<LockedDesignDraftOwner, 'owner' | 'document' | 'table'> | undefined
  if (!row) throw new DesignRevisionError('NOT_FOUND')
  const locked = (await db.query('SELECT head_revision_id FROM email_design_documents WHERE id=$1 FOR UPDATE', [documentId])).rows[0] as { head_revision_id: string | null } | undefined
  if (!locked) throw new DesignRevisionError('NOT_FOUND')
  if (row.client_id !== document.client_id) throw new DesignRevisionError('SCOPE_MISMATCH')
  document.head_revision_id = locked.head_revision_id
  return { ...row, owner, document, table }
}

export function assertDesignDraftMutable(locked: LockedDesignDraftOwner): void {
  if (locked.owner.kind === 'campaign') {
    if (locked.status !== 'draft') throw new DesignRevisionError('CAMPAIGN_FROZEN')
  } else if (locked.template_kind !== 'draft') throw new DesignRevisionError('TEMPLATE_DRAFT_REQUIRED')
}

/** Inside the existing revision transaction only. This is a projection of the
 * saved canonical owner, never a template copy, new store or send operation. */
export async function writeDesignDraftProjection(
  db: DesignDb,
  locked: LockedDesignDraftOwner,
  revisionId: string,
  design: EmailDesignDocument,
  html: string,
  metadata?: DesignDraftMetadata
): Promise<void> {
  assertDesignDraftMutable(locked)
  if (design.kind !== (locked.owner.kind === 'template' ? 'template' : 'campaign-draft')
    || design.scope.clientId !== locked.document.client_id) throw new DesignRevisionError('SCOPE_MISMATCH')
  const { document: source } = designToRendererDocument(design)
  if (locked.owner.kind === 'template' && !metadata) {
    // Retain the template projection shape used by existing wrappers.
    await db.query('UPDATE edm_templates SET body_source=$2::jsonb, body_html=$3, email_design_revision_id=$4, updated_at=NOW() WHERE id=$1',
      [locked.owner.id, JSON.stringify(source), html, revisionId])
    return
  }
  const values = metadata ?? { subject: locked.subject ?? null, previewText: locked.preview_text ?? null }
  await db.query(`UPDATE ${locked.table} SET subject=$2, preview_text=$3, body_source=$4::jsonb, body_html=$5, email_design_revision_id=$6, updated_at=NOW() WHERE id=$1`,
    [locked.owner.id, values.subject, values.previewText, JSON.stringify(source), html, revisionId])
}
