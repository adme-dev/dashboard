import { resolvePageStudioHttpActor } from './httpActor'
import { readPageStudioJson } from './boundedJson'
import { createError, getRouterParam, getQuery, setHeader, type H3Event } from 'h3'
import { readPageStudioHistory, mutatePageStudioHistory, PageStudioHistoryError } from '~~/server/utils/pageStudio/draftHistory'
import { PageStudioReleaseCheckpointError } from '~~/shared/pageStudio/checkpointReader'
import { PageStudioControlError } from '~~/server/utils/pageStudio/controlStore'

function readContentBody(event: H3Event): Promise<unknown> {
  return readPageStudioJson(event, 8192, [
    'Draft history must be JSON',
    'Draft history request exceeds the size limit',
    'Draft history request is required',
    'Invalid draft history',
    'Invalid draft history JSON'
  ])
}

export async function handlePageStudioHistory(event: H3Event, audience: 'agency' | 'portal', method: 'GET' | 'POST') {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    const actor = await resolvePageStudioHttpActor(event, audience, method === 'POST')
    const request = {
      actor,
      siteId: getRouterParam(event, 'siteId') ?? '',
      bucket: event.context.cloudflare?.env?.PAGE_STUDIO_CHECKPOINTS
    }
    return method === 'GET'
      ? await readPageStudioHistory({ ...request, query: getQuery(event) })
      : await mutatePageStudioHistory({ ...request, event, body: await readContentBody(event) })
  } catch (error) {
    if (error instanceof PageStudioHistoryError || error instanceof PageStudioReleaseCheckpointError || error instanceof PageStudioControlError) {
      throw createError({ statusCode: error.statusCode, statusMessage: error.message, data: { code: error.code } })
    }
    throw error
  }
}
