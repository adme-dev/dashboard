import { createError, getHeader, getQuery, getRequestURL, getRouterParam, setHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { EMAIL_TEMPLATE_PROPOSAL_MAX_BYTES, EmailTemplateProposalDraftSchema, EmailTemplateProposalRequestSchema } from '~~/shared/pageStudio/emailTemplateProposals'
import { resolvePageStudioHttpActor } from './httpActor'
import { preparePageStudioContentLogin } from './contentNativeLogin'
import { readPageStudioJson } from './boundedJson'
import { portalFormContext } from './portalFormContext'
import { admitFormDocument, recheckFormAuthority } from './formAuthority'
import { generateEmailTemplateProposal } from './emailTemplateGeneration'
import { createEmailTemplateModelResolver, listEmailTemplateModels } from './emailTemplateModel'
import { createPortalEmailTemplateUsage, readPortalEmailTemplateAllowance } from './emailTemplateUsage'
import { projectPageStudioInternalError } from './http'

const EnabledModels = z.array(z.string().trim().min(1).max(200)).min(1).max(16)
  .refine(ids => new Set(ids).size === ids.length)
const Target = EmailTemplateProposalDraftSchema.pick({ apiAudience: true, audience: true, definitionId: true }).strict()

function enabledModels(value: unknown): string[] {
  if (typeof value !== 'string' || value.length > 4000) return []
  try {
    const parsed = EnabledModels.safeParse(JSON.parse(value))
    return parsed.success ? parsed.data : []
  } catch { return [] }
}

/** CMS login only. Native customer preview has no paid AI entitlement and must
 * use its own authority adapter before this capability can be offered there. */
export async function handleEmailTemplateAi(event: H3Event) {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    if (!['GET', 'POST'].includes(event.method)) throw createError({ statusCode: 405 })
    if (event.method === 'POST' && getHeader(event, 'origin') !== getRequestURL(event).origin) throw createError({ statusCode: 403 })
    if (Object.keys(getQuery(event)).length) throw createError({ statusCode: 400 })
    const target = Target.safeParse({ apiAudience: 'portal', audience: getRouterParam(event, 'audience'), definitionId: getRouterParam(event, 'definitionId') })
    if (!target.success) throw createError({ statusCode: 400 })
    const body = event.method === 'POST'
      ? EmailTemplateProposalRequestSchema.safeParse(await readPageStudioJson(event,
          EMAIL_TEMPLATE_PROPOSAL_MAX_BYTES, ['Template requests must be JSON', 'Template request is too large', 'Template request is required', 'Invalid template request', 'Invalid template JSON']))
      : undefined
    if (body && !body.success) throw createError({ statusCode: 400 })
    const actor = await resolvePageStudioHttpActor(event, 'portal', true)
    const login = await preparePageStudioContentLogin(event, actor)
    const request = { actor, login, siteId: getRouterParam(event, 'siteId') ?? '', env: event.context.cloudflare?.env ?? {} }
    const context = portalFormContext(request)
    const authority = await context.authorize(true)
    if (!authority.canEdit) throw createError({ statusCode: 403 })
    const document = await context.readDocument(authority.scope)
    admitFormDocument(document, authority.scope)
    if (target.data.definitionId && !document.studio?.formLibrary?.definitions.some(item => item.id === target.data.definitionId)) throw createError({ statusCode: 404 })
    await recheckFormAuthority(context, authority, true)
    const enabled = enabledModels(request.env.PAGE_STUDIO_EMAIL_AI_MODELS)
    if (event.method === 'POST') {
      if (!enabled.length) throw createError({ statusCode: 503 })
      return await generateEmailTemplateProposal(context, target.data, body!.data, {
        resolveModel: createEmailTemplateModelResolver(enabled), ...createPortalEmailTemplateUsage(request)
      })
    }
    const models = enabled.length ? await listEmailTemplateModels(enabled) : []
    if (!models.length) {
      await recheckFormAuthority(context, authority, true)
      return { available: false, reason: 'AI email design is not enabled for this workspace.', models: [], allowance: null }
    }
    const allowance = await readPortalEmailTemplateAllowance(request, authority)
    await recheckFormAuthority(context, authority, true)
    return { available: true, reason: null, models, allowance }
  } catch (error) {
    const projected = projectPageStudioInternalError(error)
    throw createError({ statusCode: projected.statusCode, statusMessage: projected.body.error.message, data: projected.body })
  }
}
