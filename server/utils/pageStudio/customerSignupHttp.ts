import { assertMethod, createError, deleteCookie, getCookie, getHeader, getRequestIP, readBody, setCookie, setHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { CustomerSignInRequest, CustomerSetupWrite } from '~~/shared/pageStudio/customerSignup'
import { checkAndConsume } from '~~/server/utils/rateLimit'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
import { customerEmailAvailable, sendCustomerSignInEmail } from './customerSignupEmail'
import { requestCustomerSignIn, verifyCustomerSignIn, readCustomerSession, revokeCustomerSession, readCustomerSetup, saveCustomerSetup, completeCustomerSetup } from './customerSignup'

export interface CustomerSignupConfig { origin: string, termsVersion: string, from: string }
function cookieName(config: CustomerSignupConfig) {
  // Published sibling sites must not be able to supply a parent-domain session cookie.
  // The unprefixed name is only used by the validated development HTTP loopback origin.
  return config.origin.startsWith('https:') ? '__Host-studio_customer_session' : 'studio_customer_session'
}
function setting(event: H3Event, key: string): string {
  const value = event.context.cloudflare?.env?.[key] ?? process.env[key]
  return typeof value === 'string' ? value.trim() : ''
}
export function customerSignupConfig(event: H3Event): CustomerSignupConfig {
  if (setting(event, 'PAGE_STUDIO_CUSTOMER_SIGNUP_ENABLED') !== 'true') throw createError({ statusCode: 404 })
  const unavailable = () => createError({ statusCode: 503, statusMessage: 'Customer signup is not available yet.' })
  const value = setting(event, 'PAGE_STUDIO_CUSTOMER_ORIGIN')
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw unavailable()
  }
  const local = import.meta.dev && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) && url.protocol === 'http:'
  if ((!local && url.protocol !== 'https:') || url.username || url.password || url.origin !== value) throw unavailable()
  const termsVersion = setting(event, 'PAGE_STUDIO_CUSTOMER_TERMS_VERSION')
  const from = setting(event, 'PAGE_STUDIO_CUSTOMER_EMAIL_FROM')
  if (!termsVersion || termsVersion.length > 100 || !z.string().email().safeParse(from).success) throw unavailable()
  return { origin: url.origin, termsVersion, from }
}
function guard(event: H3Event, method: 'GET' | 'POST' | 'PUT') {
  const config = customerSignupConfig(event)
  assertMethod(event, method)
  if (method !== 'GET' && getHeader(event, 'origin') !== config.origin) throw createError({ statusCode: 403, statusMessage: 'Open Page Studio in its own tab and try again.' })
  setHeader(event, 'Cache-Control', 'private, no-store')
  return config
}
function sessionToken(event: H3Event) {
  const token = getCookie(event, cookieName(customerSignupConfig(event)))
  if (!token || !/^[A-Za-z0-9_-]{64}$/.test(token)) throw createError({ statusCode: 401, statusMessage: 'Sign in to continue.' })
  return token
}
async function body<T>(event: H3Event, schema: z.ZodType<T>) {
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Check your details and try again.' })
  return parsed.data
}
async function limit(event: H3Event, key: string, maximum: number) {
  const result = await checkAndConsume({ key: `studio-customer:${key}`, limit: maximum, windowSeconds: 900, failureMode: 'closed' })
  if (!result.allowed) {
    setHeader(event, 'Retry-After', Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000)))
    throw createError({ statusCode: 429, statusMessage: 'Too many attempts. Please try again later.' })
  }
}
async function ipLimit(event: H3Event, action: string, maximum: number) {
  // Only trust Cloudflare's edge header when running inside its request context.
  const ip = event.context.cloudflare?.request ? getHeader(event, 'cf-connecting-ip') : getRequestIP(event)
  await limit(event, `${action}:ip:${await digestPortalSessionToken(ip || 'unknown')}`, maximum)
}
export function customerConfigHandler(event: H3Event) {
  assertMethod(event, 'GET')
  setHeader(event, 'Cache-Control', 'private, no-store')
  try {
    customerSignupConfig(event)
    return { enabled: true }
  } catch {
    return { enabled: false }
  }
}
export async function customerRequestHandler(event: H3Event) {
  const config = guard(event, 'POST')
  const input = await body(event, CustomerSignInRequest)
  await ipLimit(event, 'request', 20)
  await limit(event, `email:${await digestPortalSessionToken(input.email)}`, 5)
  if (!customerEmailAvailable(event)) throw createError({ statusCode: 503, statusMessage: 'Sign-in email is temporarily unavailable.' })
  const delivery = await requestCustomerSignIn(input, config.termsVersion)
  if (delivery) {
    try {
      await sendCustomerSignInEmail(event, config, delivery)
    } catch {
      // Do not disclose eligibility, addresses, tokens or provider error bodies.
      console.error('[Studio signup] Sign-in email delivery failed')
    }
  }
  return { success: true, message: 'If this account is eligible, a sign-in link is on its way.' }
}
export async function customerVerifyHandler(event: H3Event) {
  const config = guard(event, 'POST')
  const input = await body(event, z.object({ token: z.string().regex(/^[A-Za-z0-9_-]{64}$/) }).strict())
  await ipLimit(event, 'verify', 30)
  const result = await verifyCustomerSignIn(input.token)
  setCookie(event, cookieName(config), result.sessionToken, { httpOnly: true, secure: config.origin.startsWith('https:'), sameSite: 'lax', path: '/', maxAge: 30 * 24 * 60 * 60 })
  return { next: '/studio/onboarding' }
}
export async function customerMeHandler(event: H3Event) {
  guard(event, 'GET')
  const user = await readCustomerSession(sessionToken(event))
  return { name: user.name, email: user.email }
}
export async function customerLogoutHandler(event: H3Event) {
  const config = guard(event, 'POST')
  await revokeCustomerSession(getCookie(event, cookieName(config)))
  deleteCookie(event, cookieName(config), { path: '/', httpOnly: true, secure: config.origin.startsWith('https:'), sameSite: 'lax' })
  return { success: true }
}
export async function customerSetupHandler(event: H3Event) {
  guard(event, 'GET')
  return readCustomerSetup(sessionToken(event))
}
export async function customerSaveHandler(event: H3Event) {
  guard(event, 'PUT')
  const token = sessionToken(event)
  return saveCustomerSetup(token, await body(event, CustomerSetupWrite))
}
export async function customerCompleteHandler(event: H3Event) {
  guard(event, 'POST')
  const token = sessionToken(event)
  const input = await body(event, z.object({ expectedRevision: z.number().int().min(0) }).strict())
  return completeCustomerSetup(token, input.expectedRevision)
}

// Shared native customer boundary for the standalone website journey.
export { guard as guardCustomerRequest, sessionToken as customerSessionToken, limit as limitCustomerRequest }
