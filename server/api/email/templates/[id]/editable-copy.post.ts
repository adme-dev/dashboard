// Explicit, reversible conversion of a complete imported email into a NEW
// structured draft. The source template is read only: its stored HTML, name,
// scope and revisions never change. Preview renders the proposed copy; save
// writes it through the existing receipt-bound import owner with the source's
// own client scope, fenced at insert against the exact reviewed source.
//
// Save outcomes carry `data.outcome`: `conflict` when this request's identity
// is bound to a different command; `stale` when the original no longer matches
// the reviewed preview. Neither proves nothing was committed: an earlier attempt
// of the same key may still be running and could commit if the source is
// restored, so clients keep the request until a receipt or explicit abandonment.
import { z } from 'zod'
import { requireAuth, requireWriteAccess } from '~~/server/utils/auth'
import { assertEmailClientAccess, resolveEmailWriteClientId } from '~~/server/utils/email-marketing/access'
import { getTemplate, TemplateSourceFenceError, type EdmTemplate } from '~~/server/utils/email-marketing/templates'
import { renderTemplateDocument } from '~~/server/utils/email-marketing/render'
import { createEmailRenderer } from '~~/server/utils/email-marketing/render/client'
import { importReceiptMatches, importReceiptOf, importRequestTemplateId, saveImportedTemplate } from '~~/server/utils/email-marketing/templateImportSave'
import { convertImportedEmailDocument, ImportedConversionError } from '~~/server/utils/email-marketing/importedDesignConversion'
import { redactTemplateProvenance } from '~~/shared/emailRendering/templateProvenance'

const Body = z.object({
  save: z.boolean().default(false),
  request_key: z.string().uuid().optional(),
  name: z.string().trim().min(1).max(200).optional(),
  source_digest: z.string().regex(/^[a-f0-9]{64}$/).optional()
}).strict()

async function sha256(value: string) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))).map(byte => byte.toString(16).padStart(2, '0')).join('')
}
/** Binds a reviewed preview to every copied field of the exact source row. */
const sourceDigest = (source: EdmTemplate) => sha256(JSON.stringify({ id: source.id, client_id: source.client_id ?? null, subject: source.subject ?? null, preview_text: source.preview_text ?? null, folder_name: source.folder_name ?? null, body_source: source.body_source ?? null }))
const summary = (template: EdmTemplate) => ({ id: template.id, name: template.name, client_id: template.client_id, template_kind: template.template_kind })
const refuse = (statusCode: number, statusMessage: string, outcome?: 'stale' | 'conflict') => createError({ statusCode, statusMessage, ...(outcome ? { data: { outcome } } : {}) })

function convert(body: unknown, sourceId: string) {
  let converted: ReturnType<typeof convertImportedEmailDocument>
  try {
    converted = convertImportedEmailDocument(body)
  } catch (error) {
    if (error instanceof ImportedConversionError) throw refuse(422, error.message)
    throw error
  }
  const original = redactTemplateProvenance(body as typeof converted.document)?.root?.data?.props?.sourceProvenance as Record<string, string> | undefined
  converted.document.root.data.props = {
    ...converted.document.root.data.props,
    // Descriptive only; never used as authority.
    sourceProvenance: { ...(original ?? {}), importForm: 'editable-copy', notes: `Editable copy converted from template ${sourceId}. The original imported template is unchanged.` }
  }
  return converted
}

export default defineEventHandler(async (event) => {
  const parsed = Body.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'invalid_body' })
  const input = parsed.data
  const user = input.save ? await requireWriteAccess(event) : await requireAuth(event)
  const id = getRouterParam(event, 'id')
  if (!id) throw createError({ statusCode: 400, statusMessage: 'missing_id' })
  const renderer = createEmailRenderer(event.context?.cloudflare?.env ?? {})

  if (!input.save) {
    const source = await getTemplate(id)
    if (!source) throw createError({ statusCode: 404, statusMessage: 'not_found' })
    await assertEmailClientAccess(event, user, source.client_id)
    const { document, report } = convert(source.body_source, source.id)
    const options = { subjectLine: source.subject ?? undefined, previewText: source.preview_text ?? undefined }
    const html = await renderTemplateDocument(document, options, renderer)
    // The stored compiled original is the "before" view; render only if absent.
    const originalHtml = source.body_html || await renderTemplateDocument(source.body_source as typeof document, options, renderer)
    return { html, original_html: originalHtml, report, source_id: source.id, source_digest: await sourceDigest(source) }
  }

  if (!input.request_key || !input.name || !input.source_digest) throw createError({ statusCode: 400, statusMessage: 'invalid_body' })
  const binding = { operation: 'editable-copy', version: 1, writer: user.id, requestKey: input.request_key, sourceTemplateId: id, sourceDigest: input.source_digest, name: input.name }
  // Receipt first, independent of the original: a committed request returns
  // its own copy under the copy's CURRENT scope, even if the original was later
  // changed, moved or deleted. Only the typed receipt binding is authority.
  const receiptId = await importRequestTemplateId(user.id, input.request_key, 'editable-copy')
  const replay = async () => {
    const committed = await getTemplate(receiptId)
    if (!committed) return null
    await assertEmailClientAccess(event, user, committed.client_id)
    // The stored binding is write-once (see updateTemplate); the copy's client may
    // legitimately change later, so the request is matched against the binding
    // as created and current access is checked on the copy's present scope.
    const stored = importReceiptOf(committed)?.binding as { clientId?: string | null } | undefined
    if (!importReceiptMatches(committed, user.id, 'editable-copy', { ...binding, clientId: stored?.clientId ?? null }))
      throw refuse(409, 'This request was already used for a different copy. Check the template library before continuing.', 'conflict')
    return { template: summary(committed), replayed: true }
  }
  const replayed = await replay()
  if (replayed) return replayed
  // No receipt yet. A missing or changed original is reported as `stale`, not
  // as a terminal non-commit; a late receipt is still returned when present.
  const source = await getTemplate(id)
  if (!source) {
    const late = await replay()
    if (late) return late
    throw refuse(404, 'The original template is no longer available. If an earlier attempt is still finishing it may still create the copy; retry to check, or abandon this request.', 'stale')
  }
  await assertEmailClientAccess(event, user, source.client_id)
  if (input.source_digest !== await sourceDigest(source)) {
    const late = await replay()
    if (late) return late
    throw refuse(409, 'The original template changed after preview. Retry to check for an earlier attempt, or abandon this request and preview again.', 'stale')
  }
  // The copy keeps the source's client scope; it can never be widened or moved.
  const clientId = await resolveEmailWriteClientId(event, user, source.client_id)
  if ((clientId ?? null) !== (source.client_id ?? null)) throw createError({ statusCode: 403, statusMessage: 'email_client_scope_required' })
  const { document, report } = convert(source.body_source, source.id)
  if (!report.native) throw refuse(422, 'No sections of this email can become FigFlow layers.')
  try {
    const template = await saveImportedTemplate({
      name: input.name, subject: source.subject, preview_text: source.preview_text, body_source: document,
      client_id: clientId, folder_name: source.folder_name, created_by: user.id, template_kind: 'draft'
    }, input.request_key, renderer, {
      operation: 'editable-copy',
      binding: { ...binding, clientId: clientId ?? null },
      sourceFence: { templateId: source.id, bodySource: source.body_source, clientId: source.client_id ?? null, subject: source.subject ?? null, previewText: source.preview_text ?? null, folderName: source.folder_name ?? null },
      // Rendering is awaited before insert: re-check write authority for this scope.
      authorize: async () => {
        const fresh = await requireWriteAccess(event)
        if (fresh.id !== user.id || ((await resolveEmailWriteClientId(event, fresh, source.client_id)) ?? null) !== (source.client_id ?? null))
          throw createError({ statusCode: 403, statusMessage: 'email_client_scope_required' })
      }
    })
    return { template: summary(template), report }
  } catch (error) {
    if (error instanceof TemplateSourceFenceError) throw refuse(409, 'The original template changed while the copy was being prepared. Retry to check for an earlier attempt, or abandon this request and preview again.', 'stale')
    throw error
  }
})
