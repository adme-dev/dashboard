import { createError, getHeader, getQuery, getRouterParam, sendStream, setHeader, type H3Event } from 'h3'
import { guardCustomerRequest, customerSessionToken } from './customerSignupHttp'
import { readPageStudioJson } from './boundedJson'
import { createCustomerFormContext, readCustomerFormsWorkspace, readCustomerDefaultWebsite, readCustomerFormsAvailability, type CustomerFormsDependencies } from './customerForms'
import { operateTrustedFormSettings } from './formSettings'
import { operateTrustedFormRecipients } from './formRecipients'
import { operateTrustedEmailTemplate, previewTrustedEmailTemplate } from './emailTemplates'
import { readScopedMedia } from './standaloneMedia'

type Operation = 'workspace' | 'asset' | 'settings' | 'recipients' | 'template' | 'website' | 'availability'
export function customerFormsEnabled(event: H3Event) {
  const env = event.context.cloudflare?.env ?? {}
  return (env.PAGE_STUDIO_CUSTOMER_FORMS_ENABLED ?? process.env.PAGE_STUDIO_CUSTOMER_FORMS_ENABLED) === 'true'
    && env.PAGE_STUDIO_CONTENT_ENVIRONMENT === 'staging'
}
function safeError(error: unknown): never {
  const code = (error as { statusCode?: number })?.statusCode
  const messages: Record<number, string> = { 400: 'Check the form details and try again.', 401: 'Sign in to continue.', 403: 'Customer form access is not available.', 404: 'The saved website or form is not available.', 409: 'This form or its settings changed. Reload the saved version before saving again.', 405: 'This request method is not available.', 413: 'The form settings are too large.', 415: 'Form settings must be JSON.' }
  const statusCode = code && messages[code] ? code : 503
  throw createError({ statusCode, statusMessage: messages[statusCode] ?? 'Form storage is unavailable. Reload the saved version before trying again.' })
}
export async function customerFormsHandler(event: H3Event, operation: Operation, method: 'GET' | 'PUT' | 'PREVIEW', deps: CustomerFormsDependencies = {}) {
  setHeader(event, 'Cache-Control', 'private, no-store')
  try {
    guardCustomerRequest(event, method === 'PREVIEW' ? 'POST' : method)
    if (!customerFormsEnabled(event)) {
      if (operation === 'availability') return { available: false, siteId: null }
      throw createError({ statusCode: 404 })
    }
    const sessionToken = customerSessionToken(event)
    const env = event.context.cloudflare?.env ?? {}
    if (operation === 'website' || operation === 'availability') {
      if (Object.keys(getQuery(event)).length || getHeader(event, 'transfer-encoding') || Number(getHeader(event, 'content-length') ?? 0) !== 0) throw createError({ statusCode: 400 })
      if (operation === 'website') return await readCustomerDefaultWebsite(sessionToken, env, deps)
      try {
        return await readCustomerFormsAvailability(sessionToken, deps)
      } catch {
        return { available: false, siteId: null }
      }
    }
    const siteId = getRouterParam(event, 'siteId') ?? ''
    const body = method === 'GET'
      ? undefined
      : await readPageStudioJson(event, operation === 'settings' ? 48_000 : 300_000,
          ['Settings must be JSON', 'Settings are too large', 'Settings are required', 'Invalid settings', 'Invalid settings JSON'])
    const context = createCustomerFormContext({ sessionToken, siteId, environment: 'staging' }, env, deps)
    if (operation === 'workspace') return await readCustomerFormsWorkspace(context, deps)
    if (operation === 'settings') return await operateTrustedFormSettings(context, { pageId: getRouterParam(event, 'pageId') ?? '', formId: getRouterParam(event, 'formId') ?? '' }, body)
    if (operation === 'recipients') return await operateTrustedFormRecipients(context, body)
    if (operation === 'template') {
      const audience = getRouterParam(event, 'audience') ?? ''
      return method === 'PREVIEW' ? await previewTrustedEmailTemplate(context, audience, body) : await operateTrustedEmailTemplate(context, audience, body, getRouterParam(event, 'definitionId'))
    }
    const image = await readScopedMedia(context, getRouterParam(event, 'assetId') ?? '', { bucket: env.MEDIA_BUCKET })
    setHeader(event, 'Content-Type', image.mediaType)
    setHeader(event, 'Content-Length', image.size)
    setHeader(event, 'X-Content-Type-Options', 'nosniff')
    setHeader(event, 'Content-Security-Policy', 'default-src \'none\'; sandbox')
    setHeader(event, 'Cross-Origin-Resource-Policy', 'same-origin')
    return sendStream(event, image.body)
  } catch (error) { safeError(error) }
}
