import { createError, getQuery, getRouterParam, setHeader, type H3Event } from 'h3'
import { resolvePageStudioHttpActor } from './httpActor'
import { preparePageStudioContentLogin } from './contentNativeLogin'
import { readPageStudioJson } from './boundedJson'
import { pageStudioHttpError } from './http'
import { operateEmailTemplate, previewTrustedEmailTemplate, listTrustedEmailTemplateHistory, readTrustedEmailTemplateRevision } from './emailTemplates'
import { portalFormContext } from './portalFormContext'
import { EmailTemplateHistoryQuerySchema, EmailTemplateRevisionParamSchema } from '~~/shared/pageStudio/emailTemplates'

export async function handleEmailTemplate(event: H3Event, method: 'GET' | 'PUT' | 'PREVIEW' | 'HISTORY' | 'HISTORY_VERSION') {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    const history = method === 'HISTORY' || method === 'HISTORY_VERSION'
    const cursor = history ? EmailTemplateHistoryQuerySchema.safeParse(getQuery(event)) : undefined
    const revision = method === 'HISTORY_VERSION' ? EmailTemplateRevisionParamSchema.safeParse(getRouterParam(event, 'revision')) : undefined
    if (history && (!cursor?.success || (method === 'HISTORY_VERSION' && (!revision?.success || Object.keys(getQuery(event)).length)))) throw createError({ statusCode: 400, statusMessage: 'Choose a valid saved revision or history cursor' })
    const actor = await resolvePageStudioHttpActor(event, 'portal', method === 'PUT')
    const login = await preparePageStudioContentLogin(event, actor)
    const body = method === 'PUT' || method === 'PREVIEW' ? await readPageStudioJson(event, 300_000, ['Templates must be JSON', 'Template is too large', 'Template is required', 'Invalid template', 'Invalid template JSON']) : undefined
    const request = { actor, login, siteId: getRouterParam(event, 'siteId') ?? '', env: event.context.cloudflare?.env ?? {} }
    const audience = getRouterParam(event, 'audience') ?? ''
    if (history) {
      const context = portalFormContext(request)
      const definitionId = getRouterParam(event, 'definitionId')
      return method === 'HISTORY' ? await listTrustedEmailTemplateHistory(context, audience, cursor!.data, definitionId) : await readTrustedEmailTemplateRevision(context, audience, revision!.data, definitionId)
    }
    if (method !== 'PREVIEW') return await operateEmailTemplate(request, audience, body, {}, getRouterParam(event, 'definitionId'))
    return await previewTrustedEmailTemplate(portalFormContext(request), audience, body)
  } catch (error) {
    pageStudioHttpError(error)
  }
}
