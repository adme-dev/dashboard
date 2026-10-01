import { getRouterParam, setHeader, type H3Event } from 'h3'
import { resolvePageStudioHttpActor } from './httpActor'
import { preparePageStudioContentLogin } from './contentNativeLogin'
import { readPageStudioJson } from './boundedJson'
import { pageStudioHttpError } from './http'
import { operateEmailTemplate, previewTrustedEmailTemplate } from './emailTemplates'
import { portalFormContext } from './portalFormContext'

export async function handleEmailTemplate(event: H3Event, method: 'GET' | 'PUT' | 'PREVIEW') {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    const actor = await resolvePageStudioHttpActor(event, 'portal', method === 'PUT')
    const login = await preparePageStudioContentLogin(event, actor)
    const body = method !== 'GET' ? await readPageStudioJson(event, 300_000, ['Templates must be JSON', 'Template is too large', 'Template is required', 'Invalid template', 'Invalid template JSON']) : undefined
    const request = { actor, login, siteId: getRouterParam(event, 'siteId') ?? '', env: event.context.cloudflare?.env ?? {} }
    const audience = getRouterParam(event, 'audience') ?? ''
    if (method !== 'PREVIEW') return await operateEmailTemplate(request, audience, body, {}, getRouterParam(event, 'definitionId'))
    return await previewTrustedEmailTemplate(portalFormContext(request), audience, body)
  } catch (error) {
    pageStudioHttpError(error)
  }
}
