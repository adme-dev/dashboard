import { resolvePageStudioHttpActor } from './httpActor'
import { readPageStudioJson } from './boundedJson'
import { getRouterParam, setHeader, type H3Event } from 'h3'
import { readPageStudioBusinessContent, writePageStudioBusinessContent } from '~~/server/utils/pageStudio/businessContent'
import { pageStudioHttpError } from '~~/server/utils/pageStudio/http'

import { preparePageStudioContentLogin } from './contentNativeLogin'

export function readContentBody(event: H3Event): Promise<unknown> {
  return readPageStudioJson(event, 512000, [
    'Business content must be JSON',
    'Business content exceeds the size limit',
    'Business content is required',
    'Invalid business content',
    'Invalid business content JSON'
  ])
}

export async function handlePageStudioBusinessContent(event: H3Event, audience: 'agency' | 'portal', method: 'GET' | 'PUT') {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    const actor = await resolvePageStudioHttpActor(event, audience, method === 'PUT')
    const body = method === 'PUT' ? await readContentBody(event) : undefined
    const login = await preparePageStudioContentLogin(event, actor)
    const request = {
      actor, login,
      siteId: getRouterParam(event, 'siteId') ?? '',
      env: (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env ?? {}
    }
    return method === 'GET'
      ? await readPageStudioBusinessContent(request)
      : await writePageStudioBusinessContent({ ...request, body })
  } catch (error) { pageStudioHttpError(error) }
}
