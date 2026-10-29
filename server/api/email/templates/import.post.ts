import { saveImportedTemplate } from '~~/server/utils/email-marketing/templateImportSave'
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { resolveEmailWriteClientId } from '~~/server/utils/email-marketing/access'
import { createTemplate } from '~~/server/utils/email-marketing/templates'
import { renderTemplateDocument } from '~~/server/utils/email-marketing/render'
import { createEmailRenderer } from '~~/server/utils/email-marketing/render/client'
import { prepareTemplateImport, MAX_TEMPLATE_IMPORT_BYTES } from '~~/server/utils/email-marketing/templateImport'

const Body = z.object({
  request_key: z.string().uuid().optional(),
  format: z.enum(['html', 'json']),
  content: z.string().max(MAX_TEMPLATE_IMPORT_BYTES),
  name: z.string().trim().min(1).max(200),
  subject: z.string().max(300).optional(),
  preview_text: z.string().max(300).optional(),
  template_kind: z.enum(['template', 'draft']).default('template'),
  client_id: z.string().uuid().nullable().optional(),
  folder_name: z.string().trim().max(120).nullable().optional(),
  save: z.boolean().default(false)
})
export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const raw = await readRawBody(event)
  if (!raw || new TextEncoder().encode(raw).byteLength > MAX_TEMPLATE_IMPORT_BYTES * 2) throw createError({ statusCode: 413, statusMessage: 'Import request too large' })
  let input: z.infer<typeof Body>
  let document
  try {
    input = Body.parse(JSON.parse(raw))
    document = prepareTemplateImport(input.format, input.content)
  } catch { throw createError({ statusCode: 400, statusMessage: 'Invalid import. Use HTML or a valid XeroFlow document JSON, up to 512 KB.' }) }
  const clientId = await resolveEmailWriteClientId(event, user, input.client_id ?? null)
  const renderer = createEmailRenderer(event.context?.cloudflare?.env ?? {})
  if (!input.save) return { html: await renderTemplateDocument(document, { subjectLine: input.subject, previewText: input.preview_text }, renderer), blocks: Object.keys(document).length - 1 }
  const templateInput = { name: input.name, subject: input.subject, preview_text: input.preview_text, body_source: document, client_id: clientId, folder_name: input.folder_name ?? null, created_by: user.id, template_kind: input.template_kind }
  const template = input.request_key ? await saveImportedTemplate(templateInput, input.request_key, renderer) : await createTemplate(templateInput, renderer)
  return { template }
})
