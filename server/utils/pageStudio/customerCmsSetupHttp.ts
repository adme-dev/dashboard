import { createError, readBody, setHeader, type H3Event } from 'h3'
import { customerPreviewRuntimeEnvironment } from './customerPreviewRuntime'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
import { CustomerCmsSetupRequestSchema } from '~~/shared/pageStudio/customerCmsSetup'
import { guardCustomerRequest, customerSessionToken, limitCustomerRequest } from './customerSignupHttp'
import { parseCustomerEditorHandoffConfiguration } from './customerEditorHandoff'
import { readCustomerCmsSetup, mutateCustomerCmsSetup, type CustomerCmsSetupOptions } from './customerCmsSetup'

export function customerCmsSetupOptions(event: H3Event): CustomerCmsSetupOptions | null {
  const env = customerPreviewRuntimeEnvironment(event.context.cloudflare?.env ?? {})
  if (!env) return null
  const setting = (key: string) => Object.hasOwn(env, key) ? env[key] : process.env[key]
  if (setting('PAGE_STUDIO_CUSTOMER_CMS_SETUP_ENABLED') !== 'true'
    || setting('PAGE_STUDIO_PROVISIONING_ENVIRONMENT') !== 'staging'
    || setting('PAGE_STUDIO_CONTENT_ENVIRONMENT') !== 'staging'
    || typeof (env.PAGE_STUDIO_PROVISIONER as { readProvisioning?: unknown } | undefined)?.readProvisioning !== 'function'
    || typeof (env.PAGE_STUDIO_CONTENT_ROUTER as { readManagedCmsTarget?: unknown } | undefined)?.readManagedCmsTarget !== 'function'
    || typeof (env.PAGE_STUDIO_CHECKPOINTS as { get?: unknown } | undefined)?.get !== 'function') return null
  try {
    const configuration = parseCustomerEditorHandoffConfiguration({ enabled: true,
      dashboardOrigin: setting('PAGE_STUDIO_CUSTOMER_ORIGIN'), editorOrigin: setting('PAGE_STUDIO_CUSTOMER_EDITOR_ORIGIN') })
    return { event, configuration, env: { ...env, PAGE_STUDIO_CUSTOMER_CMS_SETUP_ENABLED: 'true',
      PAGE_STUDIO_PROVISIONING_ENVIRONMENT: 'staging', PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging' } }
  } catch { return null }
}
function safeError(error: unknown): never {
  const status = (error as { statusCode?: number })?.statusCode
  throw createError({ statusCode: [401, 403, 409].includes(status ?? 0) ? status : 503,
    statusMessage: status === 401 ? 'Sign in to continue.' : 'Refresh CMS setup before continuing, or contact support.' })
}
export async function customerCmsSetupStatusHandler(event: H3Event) {
  guardCustomerRequest(event, 'GET')
  setHeader(event, 'referrer-policy', 'no-referrer')
  const token = customerSessionToken(event), options = customerCmsSetupOptions(event)
  if (!options) throw createError({ statusCode: 403 })
  try {
    return await readCustomerCmsSetup(token, options)
  } catch (error) {
    safeError(error)
  }
}
export async function customerCmsSetupMutationHandler(event: H3Event) {
  guardCustomerRequest(event, 'POST')
  setHeader(event, 'referrer-policy', 'no-referrer')
  const token = customerSessionToken(event), options = customerCmsSetupOptions(event)
  if (!options) throw createError({ statusCode: 403 })
  const input = CustomerCmsSetupRequestSchema.safeParse(await readBody(event))
  if (!input.success) throw createError({ statusCode: 400, statusMessage: 'Invalid CMS setup request.' })
  await limitCustomerRequest(event, `cms-setup:${await digestPortalSessionToken(token)}`, 60)
  try {
    return await mutateCustomerCmsSetup(token, input.data, options)
  } catch (error) {
    safeError(error)
  }
}
