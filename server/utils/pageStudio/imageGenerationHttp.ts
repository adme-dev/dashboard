import { createError, getHeader, getQuery, getRequestURL, getRouterParam, setHeader, type H3Event } from 'h3'
import { resolvePageStudioHttpActor } from './httpActor'
import { preparePageStudioContentLogin } from './contentNativeLogin'
import { readPageStudioJson } from './boundedJson'
import { executeNativeImageOperation, parseImageOperationInput, type ImageNativeOperation } from './imageGenerationService'
import { pageStudioHttpError } from './http'
import { ImageCreditError } from './imageCredits'

export async function handlePageStudioImages(event: H3Event, audience: 'agency' | 'portal', operation: ImageNativeOperation) {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    const writing = operation === 'quote'
    if (writing && getHeader(event, 'origin') !== getRequestURL(event).origin) {
      throw createError({ statusCode: 403, statusMessage: 'Image requests must come from this application' })
    }
    const actor = await resolvePageStudioHttpActor(event, audience, writing)
    let input: unknown
    if (writing) {
      input = await readPageStudioJson(event, 16_384, ['Image request must be JSON', 'Image request exceeds the size limit', 'Image request is required', 'Invalid image request', 'Invalid image request JSON'])
    } else {
      const query = { ...getQuery(event) }
      if (query.before !== undefined) {
        if (typeof query.before !== 'string' || query.before.length > 512) throw new ImageCreditError('IMAGE_REQUEST_INVALID', 400, 'Invalid history cursor')
        try {
          query.before = JSON.parse(query.before)
        } catch {
          throw new ImageCreditError('IMAGE_REQUEST_INVALID', 400, 'Invalid history cursor')
        }
      }
      input = query
    }
    const parsed = parseImageOperationInput(operation, input)
    const login = await preparePageStudioContentLogin(event, actor)
    return await executeNativeImageOperation({ actor, login, siteId: getRouterParam(event, 'siteId') ?? '',
      env: (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env ?? {} }, operation, parsed)
  } catch (error) {
    if (error instanceof ImageCreditError) throw createError({ statusCode: error.statusCode, statusMessage: error.message, data: { error: { code: error.code, message: error.message } } })
    pageStudioHttpError(error)
  }
}
