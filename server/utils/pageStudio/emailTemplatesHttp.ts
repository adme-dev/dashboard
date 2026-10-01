import { getRouterParam, setHeader, type H3Event } from 'h3'
import { resolvePageStudioHttpActor } from './httpActor'
import { preparePageStudioContentLogin } from './contentNativeLogin'
import { readPageStudioJson } from './boundedJson'
import { pageStudioHttpError } from './http'
import { operateEmailTemplate } from './emailTemplates'
import { authorizePageStudioBusinessContent, PageStudioBusinessContentError } from './businessContent'
import { getPageStudioDocument } from './documents'
import { samePageStudioContentScope } from '~~/shared/pageStudio/businessContent'
import { EmailAudienceSchema, EmailTemplatePreviewSchema } from '~~/shared/pageStudio/emailTemplates'
import { formCatalogue } from '~~/shared/pageStudio/formCatalogue'
import { resolveEmailTemplateMedia } from './emailTemplateMedia'
import { renderCustomerEmailPreview } from './emailTemplatePreview'

export async function handleEmailTemplate(event: H3Event, method: 'GET' | 'PUT' | 'PREVIEW') {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    const actor = await resolvePageStudioHttpActor(event, 'portal', method === 'PUT')
    const login = await preparePageStudioContentLogin(event, actor)
    const body = method !== 'GET' ? await readPageStudioJson(event, 300_000, ['Templates must be JSON', 'Template is too large', 'Template is required', 'Invalid template', 'Invalid template JSON']) : undefined
    const request = { actor, login, siteId: getRouterParam(event, 'siteId') ?? '', env: event.context.cloudflare?.env ?? {} }
    const audience = getRouterParam(event, 'audience') ?? ''
    if (method !== 'PREVIEW') return await operateEmailTemplate(request, audience, body, {}, getRouterParam(event, 'definitionId'))
    const parsed = EmailTemplatePreviewSchema.safeParse(body)
    if (!parsed.success || !EmailAudienceSchema.safeParse(audience).success) throw new PageStudioBusinessContentError('EMAIL_TEMPLATE_INVALID', 400, 'Check the template fields and preview form')
    const before = await authorizePageStudioBusinessContent(request, false, { policyOnly: true })
    const document = await getPageStudioDocument(before.scope.tenantId, request.siteId, request.env.PAGE_STUDIO_CHECKPOINTS)
    const form = document.studio && formCatalogue(document.studio.pages, document.studio.formLibrary).find(item => item.placements.some(placement => placement.pageId === parsed.data.pageId && placement.formId === parsed.data.formId))?.form
    if (!form?.fields) throw new PageStudioBusinessContentError('FORM_NOT_FOUND', 404, 'Choose a saved form for the preview')
    const media = await resolveEmailTemplateMedia(request, parsed.data.template)
    const preview = renderCustomerEmailPreview(parsed.data.template, { siteName: document.site.name, formName: form.name || 'Website form', fields: form.fields, images: media.images })
    const after = await authorizePageStudioBusinessContent(request, false, { policyOnly: true })
    if (!samePageStudioContentScope(before.scope, after.scope)) throw new PageStudioBusinessContentError('EMAIL_TEMPLATE_DENIED', 403, 'Template access denied')
    return { ...preview, warnings: media.warnings }
  } catch (error) {
    pageStudioHttpError(error)
  }
}
