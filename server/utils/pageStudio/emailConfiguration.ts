import { PageStudioEmailStateSchema } from '~~/shared/pageStudio/emailConfiguration'
import { PageStudioEmailConfigurationError, type PageStudioEmailActor } from '~~/shared/pageStudio/emailConfigurationContract'

export { PageStudioEmailConfigurationError, type PageStudioEmailActor } from '~~/shared/pageStudio/emailConfigurationContract'

interface Request { actor: PageStudioEmailActor, siteId: string, env: Record<string, unknown> }
interface ManagementService { emailSettings(input: unknown): Promise<unknown> }
const errorStatuses: Record<string, number> = { EMAIL_ACCESS_DENIED: 403, EMAIL_INVALID: 400, INVALID_SITE: 400, SITE_NOT_FOUND: 404, EMAIL_NOT_CONFIGURED: 503, EMAIL_STATE_INVALID: 503, EMAIL_CONFLICT: 409, EMAIL_SCHEMA_PENDING: 503, EMAIL_SERVICE_UNAVAILABLE: 503 }
const exactKeys = (value: object, keys: string) => Object.keys(value).sort().join(',') === keys
const unavailable = () => new PageStudioEmailConfigurationError('EMAIL_SERVICE_UNAVAILABLE', 503, 'Website email settings service is unavailable')

async function operate(request: Request, body?: unknown) {
  const environment = request.env.PAGE_STUDIO_RELEASE_ENVIRONMENT
  const service = request.env.PAGE_STUDIO_MANAGEMENT as ManagementService | undefined
  if (!['staging', 'production'].includes(String(environment)) || typeof service?.emailSettings !== 'function') throw unavailable()
  let result: unknown
  try {
    // A failed RPC may already have committed. Never replay writes automatically.
    result = await service.emailSettings({ actor: request.actor, siteId: request.siteId, expectedEnvironment: environment, ...(body === undefined ? { operation: 'read' } : { operation: 'write', body }) })
  } catch { throw unavailable() }
  if (!result || typeof result !== 'object') throw unavailable()
  const response = result as Record<string, unknown>
  if (response.ok === false) {
    const error = response.error as Record<string, unknown> | undefined
    if (!exactKeys(response, 'error,ok') || !error || typeof error !== 'object' || !exactKeys(error, 'code,message,statusCode')
      || typeof error.code !== 'string' || !Object.hasOwn(errorStatuses, error.code) || error.statusCode !== errorStatuses[error.code]
      || typeof error.message !== 'string' || !error.message || error.message.length > 500 || /[\r\n]/.test(error.message)) throw unavailable()
    throw new PageStudioEmailConfigurationError(error.code, errorStatuses[error.code], error.message)
  }
  const parsed = PageStudioEmailStateSchema.safeParse(response.value)
  if (!exactKeys(response, 'ok,value') || response.ok !== true || !parsed.success || parsed.data.siteId !== request.siteId || parsed.data.environment !== environment) throw unavailable()
  return parsed.data
}
export const readPageStudioEmailConfiguration = (request: Request) => operate(request)
export const writePageStudioEmailConfiguration = (request: Request & { body: unknown }) => {
  if (request.body === undefined) throw new PageStudioEmailConfigurationError('EMAIL_INVALID', 400, 'Email settings are required')
  return operate(request, request.body)
}
