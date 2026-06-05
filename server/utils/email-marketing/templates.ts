// server/utils/email-marketing/templates.ts
// DB layer for edm_templates. body_html is always (re)rendered from
// body_source on write via the pure-TS renderer.

import { queryRows, queryOne, execute } from '~~/server/utils/db'
import { renderTemplateDocument } from './render'
import { isFlyhubFormat } from './render/flyhub-html-renderer'
import { addEmailClientScopeCondition, type EmailClientScope } from './access'

export type EdmTemplateKind = 'template' | 'draft'

export interface EdmTemplate {
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

function renderHtml(bodySource: unknown, subject?: string | null, previewText?: string | null): string {
  if (!isFlyhubFormat(bodySource)) return ''
  return renderTemplateDocument(bodySource, {
    subjectLine: subject ?? undefined,
    previewText: previewText ?? undefined
  })
}

export async function listTemplates(clientIds?: EmailClientScope): Promise<EdmTemplate[]> {
  const conditions: string[] = []
  const params: unknown[] = []
  addEmailClientScopeCondition(conditions, params, 'client_id', clientIds)
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
  return queryRows<EdmTemplate>(`
    SELECT *
    FROM edm_templates
    ${where}
    ORDER BY
      CASE WHEN template_kind = 'draft' THEN 0 ELSE 1 END,
      COALESCE(folder_name, ''),
      updated_at DESC
  `, params)
}

export async function getTemplate(id: string): Promise<EdmTemplate | null> {
  return queryOne<EdmTemplate>('SELECT * FROM edm_templates WHERE id = $1', [id])
}

export async function createTemplate(input: {
  name: string
  subject?: string | null
  preview_text?: string | null
  body_source?: unknown
  template_kind?: EdmTemplateKind
  folder_name?: string | null
  client_id?: string | null
  created_by: string | null
}): Promise<EdmTemplate> {
  const source = input.body_source ?? { root: { type: 'EmailLayout', data: { childrenIds: [] } } }
  const html = renderHtml(source, input.subject, input.preview_text)
  const kind = input.template_kind === 'draft' ? 'draft' : 'template'
  const folderName = input.folder_name?.trim() || null
  const row = await queryOne<EdmTemplate>(`
    INSERT INTO edm_templates (
      name, subject, preview_text, body_source, body_html, template_kind, folder_name, client_id, created_by
    )
    VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, $9)
    RETURNING *
  `, [
    input.name,
    input.subject ?? null,
    input.preview_text ?? null,
    JSON.stringify(source),
    html,
    kind,
    folderName,
    input.client_id ?? null,
    input.created_by
  ])
  return row as EdmTemplate
}

export async function updateTemplate(id: string, patch: {
  name?: string
  subject?: string | null
  preview_text?: string | null
  body_source?: unknown
  template_kind?: EdmTemplateKind
  folder_name?: string | null
}): Promise<EdmTemplate | null> {
  const existing = await getTemplate(id)
  if (!existing) return null

  const name = patch.name ?? existing.name
  const subject = patch.subject !== undefined ? patch.subject : existing.subject
  const previewText = patch.preview_text !== undefined ? patch.preview_text : existing.preview_text
  const source = patch.body_source !== undefined ? patch.body_source : existing.body_source
  const kind = patch.template_kind !== undefined
    ? (patch.template_kind === 'draft' ? 'draft' : 'template')
    : existing.template_kind
  const folderName = patch.folder_name !== undefined
    ? patch.folder_name?.trim() || null
    : existing.folder_name
  const html = renderHtml(source, subject, previewText)

  return queryOne<EdmTemplate>(`
    UPDATE edm_templates
    SET name = $1,
        subject = $2,
        preview_text = $3,
        body_source = $4::jsonb,
        body_html = $5,
        template_kind = $6,
        folder_name = $7,
        updated_at = NOW()
    WHERE id = $8
    RETURNING *
  `, [name, subject, previewText, JSON.stringify(source), html, kind, folderName, id])
}

export async function deleteTemplate(id: string): Promise<void> {
  await execute('DELETE FROM edm_templates WHERE id = $1', [id])
}
