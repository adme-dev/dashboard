import { createError, getHeader, getQuery, getRequestURL, getRouterParam, setHeader, type H3Event } from 'h3'
import { ZodError } from 'zod'
import { resolvePageStudioHttpActor } from './httpActor'
import { preparePageStudioContentLogin } from './contentNativeLogin'
import { readPageStudioJson } from './boundedJson'
import { pageStudioHttpError } from './http'
import { ImageCreditError } from './imageCredits'
import { createImageCheckout, imageBillingCatalog, imageBillingReceipt, ImageCheckoutInput, ImageReceiptInput } from './imageBillingService'

export async function handleImageBilling(event: H3Event, operation: 'catalog' | 'checkout' | 'receipt') {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    if (operation === 'checkout' && getHeader(event, 'origin') !== getRequestURL(event).origin) {
      throw createError({ statusCode: 403, statusMessage: 'Checkout must start from this application' })
    }
    const actor = await resolvePageStudioHttpActor(event, 'portal', false)
    const login = await preparePageStudioContentLogin(event, actor)
    const request = { actor, login, siteId: getRouterParam(event, 'siteId') ?? '',
      env: (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env ?? {} }
    if (operation === 'catalog') return await imageBillingCatalog(request)
    if (operation === 'receipt') return await imageBillingReceipt(request, ImageReceiptInput.parse(getQuery(event)))
    const input = ImageCheckoutInput.parse(await readPageStudioJson(event, 2048, ['Checkout must be JSON', 'Checkout request is too large', 'Checkout request is required', 'Invalid checkout request', 'Invalid checkout JSON']))
    return await createImageCheckout(request, input)
  } catch (error) {
    if (error instanceof ImageCreditError) throw createError({ statusCode: error.statusCode, statusMessage: error.message, data: { error: { code: error.code } } })
    if (error instanceof ZodError) throw createError({ statusCode: 400, statusMessage: 'Invalid credit purchase request' })
    // Stripe errors can contain request details: never forward those to a browser.
    if (error && typeof error === 'object' && 'type' in error && String(error.type).startsWith('Stripe')) {
      throw createError({ statusCode: 502, statusMessage: 'Checkout could not be confirmed. Retry this same purchase.' })
    }
    pageStudioHttpError(error)
  }
}
