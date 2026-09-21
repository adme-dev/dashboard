import { resolvePageStudioHttpActor } from './httpActor'
import { readPageStudioJson } from './boundedJson'
import { createError, getRouterParam, setHeader, type H3Event } from 'h3'
import { readPageStudioEmailConfiguration, writePageStudioEmailConfiguration, PageStudioEmailConfigurationError } from '~~/server/utils/pageStudio/emailConfiguration'

function readContentBody(event: H3Event): Promise<unknown> {
  return readPageStudioJson(event, 8192, [
    'Email settings must be JSON',
    'Email settings exceed the size limit',
    'Email settings are required',
    'Invalid email settings',
    'Invalid email settings JSON'
  ])
}

export async function handlePageStudioEmailConfiguration(event: H3Event, audience: 'agency' | 'portal', method: 'GET' | 'PUT') {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    const actor = await resolvePageStudioHttpActor(event, audience, method === 'PUT')
    const request = {
      actor,
      siteId: getRouterParam(event, 'siteId') ?? '',
      env: (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env ?? {}
    }
    return method === 'GET'
      ? await readPageStudioEmailConfiguration(request)
      : await writePageStudioEmailConfiguration({ ...request, body: await readContentBody(event) })
  } catch (error) {
    if (error instanceof PageStudioEmailConfigurationError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message, data: { code: error.code } })
    }
    throw error
  }
}
