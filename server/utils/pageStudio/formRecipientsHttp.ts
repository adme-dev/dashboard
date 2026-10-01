import { getRouterParam, setHeader, type H3Event } from 'h3'
import { resolvePageStudioHttpActor } from './httpActor'
import { preparePageStudioContentLogin } from './contentNativeLogin'
import { readPageStudioJson } from './boundedJson'
import { pageStudioHttpError } from './http'
import { operateFormRecipients } from './formRecipients'

export async function handleFormRecipients(event: H3Event, method: 'GET' | 'PUT') {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    const actor = await resolvePageStudioHttpActor(event, 'portal', method === 'PUT')
    const login = await preparePageStudioContentLogin(event, actor)
    const body = method === 'PUT' ? await readPageStudioJson(event, 300_000, ['Settings must be JSON', 'Settings are too large', 'Settings are required', 'Invalid settings', 'Invalid settings JSON']) : undefined
    return await operateFormRecipients({ actor, login, siteId: getRouterParam(event, 'siteId') ?? '', env: event.context.cloudflare?.env ?? {} }, body)
  } catch (error) {
    pageStudioHttpError(error)
  }
}
