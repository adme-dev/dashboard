import { createTemplate, getTemplate, type CreateTemplateInput, type EdmTemplate } from './templates'
import type { EmailRendererClient } from '../../../shared/emailRendering/contract'
import type { EdmFlyhubDocument } from '../../../app/types/edm'
import { redactTemplateProvenance } from '../../../shared/emailRendering/templateProvenance'

async function digest(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(byte => byte.toString(16).padStart(2, '0')).join('')
}
function canonical(value: unknown): string {
  return JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0))
    : item)
}
async function fingerprintFor(input: CreateTemplateInput) {
  const source = redactTemplateProvenance(input.body_source) as EdmFlyhubDocument
  source.root.data.props = { ...source.root.data.props }
  delete source.root.data.props.importReceipt
  return digest(canonical({ name: input.name, subject: input.subject ?? null, preview_text: input.preview_text ?? null, client_id: input.client_id ?? null, folder_name: input.folder_name?.trim() || null, template_kind: input.template_kind || 'template', source }))
}
// An import request gets a deterministic, writer-scoped primary key. The normal
// primary-key constraint serialises concurrent retries without a second insert.
export async function saveImportedTemplate(input: CreateTemplateInput, requestKey: string, renderer: EmailRendererClient): Promise<EdmTemplate> {
  const source = redactTemplateProvenance(input.body_source) as EdmFlyhubDocument
  source.root.data.props = { ...source.root.data.props }
  delete source.root.data.props.importReceipt
  const hash = await digest(`xeroflow-email-import:v1:${input.created_by}:${requestKey}`)
  const id = `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
  const fingerprint = await fingerprintFor({ ...input, body_source: source })
  const verify = async (row: EdmTemplate) => {
    const document = row.body_source as EdmFlyhubDocument
    const receipt = document.root?.data?.props?.importReceipt as { fingerprint?: unknown } | undefined
    if (row.created_by !== input.created_by || (row.client_id ?? null) !== (input.client_id ?? null) || receipt?.fingerprint !== fingerprint) {
      throw createError({ statusCode: 409, statusMessage: 'This import request was already used for different content or ownership. Preview again before saving.' })
    }
    if (await fingerprintFor(row) !== fingerprint) {
      throw createError({ statusCode: 409, statusMessage: 'This template changed after import. Open the saved template from the library before continuing.' })
    }
    return row
  }
  const existing = await getTemplate(id)
  if (existing) return verify(existing)
  source.root.data.props.importReceipt = { fingerprint }
  return verify(await createTemplate({ ...input, body_source: source, id }, renderer))
}
