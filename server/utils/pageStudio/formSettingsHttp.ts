import { getRouterParam, setHeader, type H3Event } from 'h3'
import { resolvePageStudioHttpActor } from './httpActor'
import { preparePageStudioContentLogin } from './contentNativeLogin'
import { readPageStudioJson } from './boundedJson'
import { pageStudioHttpError } from './http'
import { operateFormSettings } from './formSettings'

export async function handleFormSettings(event: H3Event, method: 'GET' | 'PUT') {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    const actor = await resolvePageStudioHttpActor(event, 'portal', method === 'PUT')
    const login = await preparePageStudioContentLogin(event, actor)
    const body = method === 'PUT' ? await readPageStudioJson(event, 48_000, ['Settings must be JSON', 'Settings are too large', 'Settings are required', 'Invalid settings', 'Invalid settings JSON']) : undefined
    return await operateFormSettings({ actor, login, siteId: getRouterParam(event, 'siteId') ?? '', env: event.context.cloudflare?.env ?? {} },
      { pageId: getRouterParam(event, 'pageId') ?? '', formId: getRouterParam(event, 'formId') ?? '' }, body)
  } catch (error) {
    pageStudioHttpError(error)
  }
}
