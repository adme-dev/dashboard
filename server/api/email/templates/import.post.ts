import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { resolveEmailWriteClientId } from '~~/server/utils/email-marketing/access'
import { createTemplate } from '~~/server/utils/email-marketing/templates'
import { createEmailRenderer } from '~~/server/utils/email-marketing/render/client'
import { prepareTemplateImport, MAX_TEMPLATE_IMPORT_BYTES } from '~~/server/utils/email-marketing/templateImport'

const Body = z.object({
  format: z.enum(['html', 'json']), content: z.string().max(MAX_TEMPLATE_IMPORT_BYTES),
  name: z.string().trim().min(1).max(200), subject: z.string().max(300).optional(),
  client_id: z.string().uuid().nullable().optional(), folder_name: z.string().trim().max(120).nullable().optional(), save: z.boolean().default(false)
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
  if (!input.save) return { html: await renderer.renderDocument(document, { subjectLine: input.subject }), blocks: Object.keys(document).length - 1 }
  const template = await createTemplate({ name: input.name, subject: input.subject, body_source: document, client_id: clientId, folder_name: input.folder_name ?? null, created_by: user.id, template_kind: 'template' }, renderer)
  return { template }
})
