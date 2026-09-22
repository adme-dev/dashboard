import { createError, setHeader, type H3Event } from 'h3'
import { readPageStudioJson } from './boundedJson'
import { pageStudioInternalHttpError } from './http'
import { requirePageStudioMachineAuth } from './machineAuth'
import { PublishedFeatureRequestSchema } from './publishedFeatureAuthority'
import { readPublishedFeaturePage } from './publishedFeatureProjection'

export async function handlePublishedFeaturePage(event: H3Event) {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    requirePageStudioMachineAuth(event)
    const body = await readPageStudioJson(event, 4096, [
      'Published page request requires JSON', 'Published page request exceeds byte limit',
      'Published page request required', 'Invalid published page body', 'Invalid published page JSON'
    ])
    if (!PublishedFeatureRequestSchema.safeParse(body).success) throw createError({ statusCode: 400, statusMessage: 'Invalid published page request' })
    return await readPublishedFeaturePage(body, (event.context.cloudflare?.env ?? {}) as Record<string, unknown>)
  } catch (error) { return pageStudioInternalHttpError(event, error) }
}
