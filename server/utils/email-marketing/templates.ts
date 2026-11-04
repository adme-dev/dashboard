import { redactTemplateProvenance } from '../../../shared/emailRendering/templateProvenance'
// server/utils/email-marketing/templates.ts
// DB layer for edm_templates. body_html is always (re)rendered from
// body_source on content writes via the private rendering service. Canonical
// published library-label edits preserve the exact saved projection.

import { queryRowsFresh, queryOneFresh, queryOne, execute } from '~~/server/utils/db'
import { renderTemplateDocument } from './render'
import { isFlyhubFormat } from '../../../shared/emailRendering/format'
import type { EmailRendererClient } from '../../../shared/emailRendering/contract'
import { addEmailClientScopeCondition, type EmailClientScope } from './access'

export type EdmTemplateKind = 'template' | 'draft'

export interface EdmTemplate {
  design_document_id?: string | null
  head_revision_id?: string | null
  revision_schema_version?: number | null
  id: string
  name: string
  subject: string | null
  preview_text: string | null
  body_source: unknown
  body_html: string | null
  content_type: string
  template_kind: EdmTemplateKind
  folder_name: string | null
  client_id: string | null
  created_by: string | null
  created_at: string
  updated_at: string
}

async function renderHtml(renderer: EmailRendererClient, bodySource: unknown, subject?: string | null, previewText?: string | null): Promise<string> {
  if (!isFlyhubFormat(bodySource)) return ''
  return renderTemplateDocument(bodySource, {
    subjectLine: subject ?? undefined,
    previewText: previewText ?? undefined
  }, renderer)
}

// Mutable library and ownership reads bypass Hyperdrive query caching.
export async function listTemplates(clientIds?: EmailClientScope): Promise<EdmTemplate[]> {
  const conditions: string[] = []
  const params: unknown[] = []
  addEmailClientScopeCondition(conditions, params, 't.client_id', clientIds)
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  return queryRowsFresh<EdmTemplate>(`
    SELECT t.*, d.id AS design_document_id, d.head_revision_id, r.schema_version AS revision_schema_version
    FROM edm_templates t LEFT JOIN email_design_documents d ON d.template_id=t.id
    LEFT JOIN email_design_revisions r ON r.document_id=d.id AND r.id=d.head_revision_id
    ${where}
    ORDER BY
      CASE WHEN template_kind = 'draft' THEN 0 ELSE 1 END,
      COALESCE(folder_name, ''),
      t.updated_at DESC
  `, params)
}

export async function getTemplate(id: string): Promise<EdmTemplate | null> {
  return queryOneFresh<EdmTemplate>(`SELECT t.*,d.id AS design_document_id,d.head_revision_id,r.schema_version AS revision_schema_version FROM edm_templates t LEFT JOIN email_design_documents d ON d.template_id=t.id LEFT JOIN email_design_revisions r ON r.document_id=d.id AND r.id=d.head_revision_id WHERE t.id=$1`, [id])
}

export interface CreateTemplateInput {
  /** Internal deterministic identity for import retry reconciliation; never accepted from template CRUD bodies. */
  id?: string
  name: string
  subject?: string | null
  preview_text?: string | null
  body_source?: unknown
  template_kind?: EdmTemplateKind
  folder_name?: string | null
  client_id?: string | null
  created_by: string | null
}

/** Exact stored source a derived copy was reviewed against. */
export interface TemplateSourceFence {
  templateId: string
  bodySource: unknown
  clientId: string | null
  subject: string | null
  previewText: string | null
  folderName: string | null
}
export class TemplateSourceFenceError extends Error {}

export async function createTemplate(input: CreateTemplateInput, renderer: EmailRendererClient, options: {
  /** Atomically require the reviewed source row to be unchanged at insert. */
  sourceFence?: TemplateSourceFence
  /** Fresh caller authority, re-checked after rendering and before insert. */
  authorize?: () => Promise<void>
} = {}): Promise<EdmTemplate> {
  const source = redactTemplateProvenance(input.body_source ?? { root: { type: 'EmailLayout', data: { childrenIds: [] } } })
  const html = await renderHtml(renderer, source, input.subject, input.preview_text)
  const kind = input.template_kind === 'draft' ? 'draft' : 'template'
  const folderName = input.folder_name?.trim() || null
  if (options.authorize) await options.authorize()
  const values = [
    input.name,
    input.subject ?? null,
    input.preview_text ?? null,
    JSON.stringify(source),
    html,
    kind,
    folderName,
    input.client_id ?? null,
    input.created_by,
    input.id ?? null
  ]
  const fence = options.sourceFence
  // One statement: the insert happens only while the reviewed source row still
  // has exactly the reviewed content, scope and metadata.
  const row = fence
    ? await queryOne<EdmTemplate>(`
      INSERT INTO edm_templates (
        name, subject, preview_text, body_source, body_html, template_kind, folder_name, client_id, created_by, id
      )
      SELECT $1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, COALESCE($10::uuid, gen_random_uuid())
      WHERE EXISTS (
        SELECT 1 FROM edm_templates s WHERE s.id = $11::uuid AND s.body_source = $12::jsonb
          AND s.client_id IS NOT DISTINCT FROM $13::uuid AND s.subject IS NOT DISTINCT FROM $14
          AND s.preview_text IS NOT DISTINCT FROM $15 AND s.folder_name IS NOT DISTINCT FROM $16
      )
      ON CONFLICT (id) DO NOTHING
      RETURNING *
    `, [...values, fence.templateId, JSON.stringify(fence.bodySource ?? null), fence.clientId, fence.subject, fence.previewText, fence.folderName])
    : await queryOne<EdmTemplate>(`
    INSERT INTO edm_templates (
      name, subject, preview_text, body_source, body_html, template_kind, folder_name, client_id, created_by, id
    )
    VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9, COALESCE($10::uuid, gen_random_uuid()))
    ON CONFLICT (id) DO NOTHING
    RETURNING *
  `, values)
  if (row) return row
  const existing = input.id ? await getTemplate(input.id) : null
  if (!existing) {
    if (fence) throw new TemplateSourceFenceError('The reviewed source template changed before the copy was saved.')
    throw new Error('Template save could not be confirmed.')
  }
  return existing
}

export interface UpdateTemplateInput {
  client_id?: string | null
  name?: string
  subject?: string | null
  preview_text?: string | null
  body_source?: unknown
  template_kind?: EdmTemplateKind
  folder_name?: string | null
}

export async function updateTemplate(id: string, patch: UpdateTemplateInput, renderer: EmailRendererClient, expectedClientId?: string | null): Promise<EdmTemplate | null> {
  const existing = await getTemplate(id)
  if (!existing) return null

  if (expectedClientId !== undefined && (existing.client_id ?? null) !== expectedClientId) return null
  const authorizedClientId = expectedClientId === undefined ? existing.client_id ?? null : expectedClientId
  // Library labels have their existing mutable owner; they do not republish
  // canonical content. Strictly exclude scope/kind/content and unknown keys.
  const patchKeys = Object.keys(patch)
  if (existing.template_kind === 'template' && existing.design_document_id && existing.revision_schema_version === 1
    && patchKeys.length > 0 && patchKeys.every(key => key === 'name' || key === 'folder_name')) {
    const fields: string[] = []
    const params: unknown[] = []
    if (patch.name !== undefined) {
      params.push(patch.name)
      fields.push(`name = $${params.length}`)
    }
    if (patch.folder_name !== undefined) {
      params.push(patch.folder_name?.trim() || null)
      fields.push(`folder_name = $${params.length}`)
    }
    if (fields.length) {
      params.push(id, authorizedClientId)
      return queryOne<EdmTemplate>(`UPDATE edm_templates SET ${fields.join(', ')}, updated_at = NOW()
        WHERE id = $${params.length - 1} AND client_id IS NOT DISTINCT FROM $${params.length}::uuid RETURNING *`, params)
    }
  }
  const name = patch.name ?? existing.name
  const subject = patch.subject !== undefined ? patch.subject : existing.subject
  const previewText = patch.preview_text !== undefined ? patch.preview_text : existing.preview_text
  const storedReceipt = (existing.body_source as { root?: { data?: { props?: { importReceipt?: unknown } } } } | null)?.root?.data?.props?.importReceipt !== undefined
  // A receipt-bearing row only accepts content with an object root chain, so
  // the stored receipt can always be restored; other rows keep prior behaviour.
  if (storedReceipt && patch.body_source !== undefined && !hasReceiptParentChain(patch.body_source)) throw new TemplateSourceShapeError()
  const source = withoutImportReceipt(redactTemplateProvenance(patch.body_source !== undefined ? patch.body_source : existing.body_source), storedReceipt)
  const kind = patch.template_kind !== undefined
    ? (patch.template_kind === 'draft' ? 'draft' : 'template')
    : existing.template_kind
  const folderName = patch.folder_name !== undefined
    ? patch.folder_name?.trim() || null
    : existing.folder_name
  const html = await renderHtml(renderer, source, subject, previewText)

  return queryOne<EdmTemplate>(`
    UPDATE edm_templates
    SET name = $1,
        subject = $2,
        preview_text = $3,
        -- The import receipt is write-once server state: carried from the row
        -- itself, never taken from (or removable by) a content save.
        body_source = CASE WHEN edm_templates.body_source #> '{root,data,props,importReceipt}' IS NULL THEN $4::jsonb
          ELSE jsonb_set($4::jsonb, '{root,data,props,importReceipt}', edm_templates.body_source #> '{root,data,props,importReceipt}', true) END,
        body_html = $5,
        template_kind = $6,
        folder_name = $7,
        client_id = $8,
        updated_at = NOW()
    WHERE id = $9 AND client_id IS NOT DISTINCT FROM $10::uuid
    RETURNING *
  `, [name, subject, previewText, JSON.stringify(source), html, kind, folderName, patch.client_id !== undefined ? patch.client_id : existing.client_id, id, authorizedClientId])
}

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
function hasReceiptParentChain(source: unknown): boolean {
  if (!isObject(source) || !isObject(source.root)) return false
  const data = source.root.data
  if (data === undefined) return true
  if (!isObject(data)) return false
  return data.props === undefined || data.props === null || isObject(data.props)
}
/** Rejected before render/write: content that could drop a stored receipt. */
export class TemplateSourceShapeError extends Error {
  readonly statusCode = 400
  readonly statusMessage = 'invalid_template_source'
  constructor() {
    super('invalid_template_source')
  }
}

/** Incoming content never carries an import receipt; `updateTemplate` restores
 * the stored one in SQL. Only when a receipt is stored does it ensure the
 * receipt's parent object exists so `jsonb_set` can restore it; otherwise the
 * body is left byte-for-byte unchanged apart from removing an incoming receipt. */
function withoutImportReceipt<T>(source: T, ensureParent: boolean): T {
  const document = source as { root?: { data?: { props?: Record<string, unknown> | null } } } | null
  const props = document?.root?.data?.props
  const hasIncoming = !!props && typeof props === 'object' && Object.hasOwn(props, 'importReceipt')
  if (!document?.root || typeof document.root !== 'object' || (!hasIncoming && (!ensureParent || (props && typeof props === 'object')))) return source
  const copy = structuredClone(document) as { root: { data?: { props?: Record<string, unknown> | null } } }
  copy.root.data = copy.root.data && typeof copy.root.data === 'object' ? copy.root.data : {}
  const next = copy.root.data.props && typeof copy.root.data.props === 'object' ? { ...copy.root.data.props } : {}
  delete next.importReceipt
  copy.root.data.props = next
  return copy as T
}

export async function deleteTemplate(id: string, expectedClientId?: string | null): Promise<boolean> {
  if (expectedClientId === undefined) {
    await execute('DELETE FROM edm_templates WHERE id = $1', [id])
    return true
  }
  const deleted = await queryOne<{ id: string }>('DELETE FROM edm_templates WHERE id = $1 AND client_id IS NOT DISTINCT FROM $2::uuid RETURNING id', [id, expectedClientId])
  return Boolean(deleted)
}
