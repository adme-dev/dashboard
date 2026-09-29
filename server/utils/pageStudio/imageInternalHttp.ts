import { createError, getHeader, setHeader, setResponseStatus, type H3Event } from 'h3'
import { requirePageStudioMachineAuth } from './machineAuth'
import { readPageStudioJson } from './boundedJson'
import { pageStudioInternalHttpError } from './http'
import { ImageCreditError } from './imageCredits'
import { executeImageWorkerOperation, parseImageWorkerInput, type ImageWorkerOperation } from './imageWorkerService'
import { executeStudioImageOperation, parseImageOperationInput, type ImageNativeOperation } from './imageGenerationService'
import { resolvePageStudioSessionEnvironment, resolvePageStudioSessionPublicKey, verifyPageStudioSessionToken } from './sessions'

const environment = (event: H3Event) => (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env ?? {}
const read = (event: H3Event) => readPageStudioJson(event, 16_384, ['Image request requires JSON', 'Image request exceeds byte limit', 'Image request required', 'Invalid image request body', 'Invalid image request JSON'])
function failure(event: H3Event, error: unknown) {
  if (error instanceof ImageCreditError) {
    setResponseStatus(event, error.statusCode)
    return { error: { code: error.code, message: error.message } }
  }
  return pageStudioInternalHttpError(event, error)
}
/** General control binding possession does not authorize paid image callbacks.
 * The dedicated secret is installed only on the private image worker/native API. */
export async function handlePageStudioImageWorker(event: H3Event, operation: ImageWorkerOperation) {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    requirePageStudioMachineAuth(event)
    const env = environment(event)
    const expected = env.PAGE_STUDIO_IMAGE_WORKER_SECRET
    if (typeof expected !== 'string' || new TextEncoder().encode(expected).length < 32 || new TextEncoder().encode(expected).length > 256) {
      throw new ImageCreditError('IMAGE_WORKER_UNAVAILABLE', 503, 'Image worker authentication is not configured')
    }
    requirePageStudioMachineAuth(event, {
      resolveExpectedSecret: () => expected,
      readAuthorization: (current) => {
        const token = getHeader(current, 'x-page-studio-image-worker')
        return token ? `Bearer ${token}` : null
      }
    })
    const input = parseImageWorkerInput(operation, await read(event))
    return await executeImageWorkerOperation(env, operation, input)
  } catch (error) { return failure(event, error) }
}
export async function handlePageStudioImageEditor(event: H3Event, operation: Exclude<ImageNativeOperation, 'account'>) {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    requirePageStudioMachineAuth(event)
    const token = getHeader(event, 'x-page-studio-session')
    if (!token || token.length > 8192) throw createError({ statusCode: 401, statusMessage: 'Page Studio session required' })
    const claims = await verifyPageStudioSessionToken(token, resolvePageStudioSessionPublicKey(event), resolvePageStudioSessionEnvironment(event).issuer)
    const input = parseImageOperationInput(operation, await read(event))
    return await executeStudioImageOperation(claims, environment(event), operation, input)
  } catch (error) { return failure(event, error) }
}
