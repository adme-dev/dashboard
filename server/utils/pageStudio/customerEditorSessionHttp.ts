import { assertMethod, createError, getHeader, readBody, setHeader, setResponseStatus, type H3Event } from 'h3'
import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import { requirePageStudioMachineAuth } from './machineAuth'
import { CustomerEditorCapabilitySchema, CustomerEditorOriginSchema, verifyCustomerEditorToken } from './customerEditorToken'
import { resolvePageStudioSessionEnvironment, resolvePageStudioSessionPublicKey } from './sessions'
import { assertCustomerEditorSessionAuthority, commitCustomerEditorCheckpoint, exchangeCustomerEditorSession, readCustomerEditorCheckpoint } from './customerEditorSessions'

const Exchange = z.object({ ticket: z.string().regex(/^[A-Za-z0-9_-]{64}$/) }).strict()
const Authorize = z.object({ capability: CustomerEditorCapabilitySchema }).strict()
const Empty = z.object({}).strict()
function setting(event: H3Event, name: string): unknown {
  const env = event.context.cloudflare?.env
  return env && Object.prototype.hasOwnProperty.call(env, name) ? env[name] : process.env[name]
}
function configuration(event: H3Event) {
  const dashboard = CustomerEditorOriginSchema.safeParse(setting(event, 'PAGE_STUDIO_CUSTOMER_ORIGIN'))
  const editor = CustomerEditorOriginSchema.safeParse(setting(event, 'PAGE_STUDIO_CUSTOMER_EDITOR_ORIGIN'))
  if (setting(event, 'PAGE_STUDIO_CUSTOMER_EDITOR_ENABLED') !== 'true'
    || setting(event, 'PAGE_STUDIO_PROVISIONING_ENVIRONMENT') !== 'staging'
    || !dashboard.success || !editor.success || dashboard.data === editor.data) throw createError({ statusCode: 403 })
  return { enabled: true as const, dashboardOrigin: dashboard.data, editorOrigin: editor.data }
}
async function body<T>(event: H3Event, schema: z.ZodType<T>) {
  const parsed = schema.safeParse(await readBody(event))
  if (!parsed.success) throw createError({ statusCode: 400 })
  return parsed.data
}
/** Private service-binding adapter. No browser cookies, public exchange or cached authority. */
export async function customerEditorSessionHandler(event: H3Event, operation: string) {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    assertMethod(event, 'POST')
    requirePageStudioMachineAuth(event)
    const config = configuration(event)
    if (operation === 'exchange') {
      const input = await body(event, Exchange)
      return await exchangeCustomerEditorSession(input.ticket, config, { event })
    }
    const token = getHeader(event, 'x-page-studio-customer-session') ?? ''
    const claims = await verifyCustomerEditorToken(token, resolvePageStudioSessionPublicKey(event), resolvePageStudioSessionEnvironment(event).issuer)
    if (claims.editorOrigin !== config.editorOrigin || claims.returnUrl !== `${config.dashboardOrigin}/studio/dashboard`) throw createError({ statusCode: 403 })
    if (operation === 'authorize') {
      const input = await body(event, Authorize)
      await transaction(db => assertCustomerEditorSessionAuthority(claims, input.capability, db))
      return { authorized: true, sessionId: claims.nonce, capability: input.capability }
    }
    if (operation === 'latest-checkpoint') {
      await body(event, Empty)
      return { checkpoint: await readCustomerEditorCheckpoint(claims) }
    }
    if (operation === 'cms-prerequisites') {
      const { coordinateCustomerSchemaUpgrade } = await import('./customerSchemaUpgrade')
      const env = Object.fromEntries(['PAGE_STUDIO_PROVISIONING_ENVIRONMENT', 'PAGE_STUDIO_PROVISIONER'].map(name => [name, setting(event, name)]))
      return await coordinateCustomerSchemaUpgrade(await readBody(event), claims, { env })
    }
    if (operation === 'checkpoint' || operation === 'cms-adoption') {
      const env = Object.fromEntries(
        ['PAGE_STUDIO_CONTENT_ENVIRONMENT', 'PAGE_STUDIO_CHECKPOINTS', 'PAGE_STUDIO_CONTENT_ROUTER', 'PAGE_STUDIO_CMS_OBJECT_TRANSPORT']
          .map(name => [name, setting(event, name)])
      )
      if (operation === 'checkpoint') return await commitCustomerEditorCheckpoint(await readBody(event), claims, { env })
      const { coordinateCmsAdoption } = await import('./cmsAdoptionCoordinator')
      return await coordinateCmsAdoption(await readBody(event), { source: 'customer-session', claims, env, capability: 'workspace:create' })
    }
    throw createError({ statusCode: 404 })
  } catch (error) {
    const candidate = typeof error === 'object' && error !== null && 'statusCode' in error ? Number(error.statusCode) : 503
    const status = [400, 401, 403, 404, 405, 409, 413, 429].includes(candidate) ? candidate : 503
    setResponseStatus(event, status)
    return { error: { code: `CUSTOMER_EDITOR_${status}`, message: status === 409 ? 'The draft has changed. Reload before saving.' : 'Customer editor request could not be completed.' } }
  }
}
