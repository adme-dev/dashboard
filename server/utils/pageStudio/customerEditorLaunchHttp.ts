import { createError, readBody, setHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
import { guardCustomerRequest, customerSessionToken, limitCustomerRequest } from './customerSignupHttp'
import { parseCustomerEditorHandoffConfiguration } from './customerEditorHandoff'
import { launchCustomerEditor, type CustomerEditorLaunchOptions } from './customerEditorLaunch'

export function customerEditorBrowserConfiguration(event: H3Event) {
  const bindings = event.context?.cloudflare?.env ?? {}
  const setting = (key: string) => Object.prototype.hasOwnProperty.call(bindings, key) ? bindings[key] : process.env[key]
  if (setting('PAGE_STUDIO_CUSTOMER_BROWSER_ENABLED') !== 'true' || setting('PAGE_STUDIO_CUSTOMER_EDITOR_ENABLED') !== 'true'
    || setting('PAGE_STUDIO_PROVISIONING_ENVIRONMENT') !== 'staging' || setting('PAGE_STUDIO_CONTENT_ENVIRONMENT') !== 'staging') return null
  try {
    return parseCustomerEditorHandoffConfiguration({ enabled: true,
      dashboardOrigin: setting('PAGE_STUDIO_CUSTOMER_ORIGIN'), editorOrigin: setting('PAGE_STUDIO_CUSTOMER_EDITOR_ORIGIN') })
  } catch { return null }
}
export function customerEditorLaunchOptions(event: H3Event): CustomerEditorLaunchOptions | null {
  const configuration = customerEditorBrowserConfiguration(event)
  if (!configuration) return null
  const bindings = event.context?.cloudflare?.env ?? {}
  const env = { PAGE_STUDIO_CONTENT_ENVIRONMENT: 'staging', PAGE_STUDIO_CHECKPOINTS: bindings.PAGE_STUDIO_CHECKPOINTS,
    PAGE_STUDIO_CONTENT_ROUTER: bindings.PAGE_STUDIO_CONTENT_ROUTER }
  if (typeof env.PAGE_STUDIO_CHECKPOINTS?.get !== 'function' || typeof env.PAGE_STUDIO_CONTENT_ROUTER?.readManagedCmsTarget !== 'function') return null
  return { configuration, env }
}
export async function customerEditorLaunchHandler(event: H3Event) {
  guardCustomerRequest(event, 'POST')
  setHeader(event, 'referrer-policy', 'no-referrer')
  const token = customerSessionToken(event)
  if (!z.object({}).strict().safeParse(await readBody(event)).success) throw createError({ statusCode: 400, statusMessage: 'Invalid editor request.' })
  const options = customerEditorLaunchOptions(event)
  if (!options) throw createError({ statusCode: 403, statusMessage: 'Editor access is not available yet.' })
  await limitCustomerRequest(event, `editor:${await digestPortalSessionToken(token)}`, 10)
  try {
    return await launchCustomerEditor(token, options)
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode
    if (status === 401) throw createError({ statusCode: 401, statusMessage: 'Sign in to continue.' })
    throw createError({ statusCode: status === 403 || status === 409 ? status : 503,
      statusMessage: 'We could not open your editor. Refresh your overview or contact support.' })
  }
}
