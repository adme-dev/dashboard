import { createError, readBody, setHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { customerPreviewRuntimeEnvironment, hasCustomerPreviewRuntimeConfiguration } from './customerPreviewRuntime'
import { readCustomerEditorEnvironment } from './customerPreviewRouting'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
import { guardCustomerRequest, customerSessionToken, limitCustomerRequest } from './customerSignupHttp'
import { parseCustomerEditorHandoffConfiguration } from './customerEditorHandoff'
import { launchCustomerEditor, type CustomerEditorLaunchOptions } from './customerEditorLaunch'

export function customerEditorBrowserConfiguration(event: H3Event, bindings: Record<string, unknown> = event.context?.cloudflare?.env ?? {}) {
  const setting = (key: string) => Object.prototype.hasOwnProperty.call(bindings, key) ? bindings[key] : process.env[key]
  const environment = setting('PAGE_STUDIO_CONTENT_ENVIRONMENT')
  if (setting('PAGE_STUDIO_CUSTOMER_BROWSER_ENABLED') !== 'true' || setting('PAGE_STUDIO_CUSTOMER_EDITOR_ENABLED') !== 'true'
    || (environment === 'production'
      ? setting('PAGE_STUDIO_CUSTOMER_PRODUCTION_EDITOR_ENABLED') !== 'true'
      : environment !== 'staging' || setting('PAGE_STUDIO_PROVISIONING_ENVIRONMENT') !== 'staging')) return null
  try {
    return parseCustomerEditorHandoffConfiguration({ enabled: true, environment,
      dashboardOrigin: setting('PAGE_STUDIO_CUSTOMER_ORIGIN'), editorOrigin: setting('PAGE_STUDIO_CUSTOMER_EDITOR_ORIGIN') })
  } catch { return null }
}
export function customerEditorLaunchOptions(event: H3Event, bindings: Record<string, unknown> = event.context?.cloudflare?.env ?? {}): CustomerEditorLaunchOptions | null {
  const configuration = customerEditorBrowserConfiguration(event, bindings)
  if (!configuration) return null
  const env = { PAGE_STUDIO_CONTENT_ENVIRONMENT: configuration.environment, PAGE_STUDIO_CHECKPOINTS: bindings.PAGE_STUDIO_CHECKPOINTS,
    PAGE_STUDIO_CONTENT_ROUTER: bindings.PAGE_STUDIO_CONTENT_ROUTER }
  if (typeof (env.PAGE_STUDIO_CHECKPOINTS as { get?: unknown } | undefined)?.get !== 'function' || typeof (env.PAGE_STUDIO_CONTENT_ROUTER as { readManagedCmsTarget?: unknown } | undefined)?.readManagedCmsTarget !== 'function') return null
  return { configuration, env }
}
/** Browser input never selects its content environment. */
export async function customerEditorRequestOptions(event: H3Event, token: string): Promise<CustomerEditorLaunchOptions | null> {
  const env = event.context?.cloudflare?.env ?? {}
  const setting = (key: string) => Object.hasOwn(env, key) ? env[key] : process.env[key]
  if (setting('PAGE_STUDIO_CUSTOMER_BROWSER_ENABLED') !== 'true' || setting('PAGE_STUDIO_CUSTOMER_EDITOR_ENABLED') !== 'true') return null
  if (env.PAGE_STUDIO_CONTENT_ENVIRONMENT !== 'production') {
    if (!hasCustomerPreviewRuntimeConfiguration(env)) return customerEditorLaunchOptions(event)
    const source = customerPreviewRuntimeEnvironment(env)
    return source ? customerEditorLaunchOptions(event, source) : null
  }
  const environment = await readCustomerEditorEnvironment(token)
  if (environment === 'production') return customerEditorLaunchOptions(event)
  const source = customerPreviewRuntimeEnvironment(env)
  return source ? customerEditorLaunchOptions(event, source) : null
}
export async function customerEditorLaunchHandler(event: H3Event) {
  guardCustomerRequest(event, 'POST')
  setHeader(event, 'referrer-policy', 'no-referrer')
  const token = customerSessionToken(event)
  if (!z.object({}).strict().safeParse(await readBody(event)).success) throw createError({ statusCode: 400, statusMessage: 'Invalid editor request.' })
  await limitCustomerRequest(event, `editor:${await digestPortalSessionToken(token)}`, 10)
  try {
    const options = await customerEditorRequestOptions(event, token)
    if (!options) throw createError({ statusCode: 403, statusMessage: 'Editor access is not available yet.' })
    return await launchCustomerEditor(token, options)
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode
    if (status === 401) throw createError({ statusCode: 401, statusMessage: 'Sign in to continue.' })
    throw createError({ statusCode: status === 403 || status === 409 ? status : 503,
      statusMessage: 'We could not open your editor. Refresh your overview or contact support.' })
  }
}
