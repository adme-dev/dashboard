import { createTemplate, getTemplate, type CreateTemplateInput, type EdmTemplate, type TemplateSourceFence } from './templates'
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
export type ImportOperation = 'import' | 'editable-copy'
/** Immutable typed request binding recorded in the receipt and checked on replay. */
export type ImportBinding = Record<string, string | number | null>
type Receipt = { fingerprint?: unknown, operation?: unknown, binding?: unknown }

/** The deterministic, writer-scoped template ID owned by one request. Each
 * operation kind has its own namespace; ordinary import v1 IDs are unchanged. */
export async function importRequestTemplateId(createdBy: string | null, requestKey: string, operation: ImportOperation = 'import'): Promise<string> {
  const namespace = operation === 'import' ? 'xeroflow-email-import:v1' : 'xeroflow-email-editable-copy:v1'
  const hash = await digest(`${namespace}:${createdBy}:${requestKey}`)
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-5${hash.slice(13, 16)}-a${hash.slice(17, 20)}-${hash.slice(20, 32)}`
}
export function importReceiptOf(row: EdmTemplate): Receipt | undefined {
  return (row.body_source as EdmFlyhubDocument | null)?.root?.data?.props?.importReceipt as Receipt | undefined
}
/** A committed row is this exact request only when its writer, operation kind
 * and complete typed binding match; descriptive provenance is never used. */
export function importReceiptMatches(row: EdmTemplate, createdBy: string | null, operation: ImportOperation, binding: ImportBinding): boolean {
  const receipt = importReceiptOf(row)
  return row.created_by === createdBy && receipt?.operation === operation && canonical(receipt.binding) === canonical(binding)
}
// An import request gets a deterministic, writer-scoped primary key. The normal
// primary-key constraint serialises concurrent retries without a second insert.
export async function saveImportedTemplate(input: CreateTemplateInput, requestKey: string, renderer: EmailRendererClient, options: {
  operation?: ImportOperation
  binding?: ImportBinding
  sourceFence?: TemplateSourceFence
  authorize?: () => Promise<void>
} = {}): Promise<EdmTemplate> {
  const operation = options.operation ?? 'import'
  const source = redactTemplateProvenance(input.body_source) as EdmFlyhubDocument
  source.root.data.props = { ...source.root.data.props }
  delete source.root.data.props.importReceipt
  const id = await importRequestTemplateId(input.created_by, requestKey, operation)
  const fingerprint = await fingerprintFor({ ...input, body_source: source })
  const verify = async (row: EdmTemplate) => {
    if (operation !== 'import') {
      // The typed binding is the authority for derived operations; later edits
      // to the committed copy do not turn its own replay into a conflict.
      if ((row.client_id ?? null) !== (input.client_id ?? null) || !importReceiptMatches(row, input.created_by, operation, options.binding ?? {}))
        throw createError({ statusCode: 409, statusMessage: 'This request was already used for a different copy. Check the template library before continuing.', data: { outcome: 'conflict' } })
      return row
    }
    const receipt = importReceiptOf(row)
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
  source.root.data.props.importReceipt = operation === 'import' ? { fingerprint } : { fingerprint, operation, binding: options.binding ?? {} }
  return verify(await createTemplate({ ...input, body_source: source, id }, renderer, { sourceFence: options.sourceFence, authorize: options.authorize }))
}
