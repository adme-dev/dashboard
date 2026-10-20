import { createError, getCookie, getHeader, getQuery, getRequestURL, getRouterParam, setHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
import { checkAndConsume } from '~~/server/utils/rateLimit'
import { collectionCanonical } from '~~/shared/pageStudio/collectionApi'
import { TransferOwnerBodySchema, TransferOperatorBodySchema, TransferWorkflowBodySchema } from '~~/shared/pageStudio/transferWorkflow'
import { callTransferControls, callTransferWorkflow } from './transferControls'
import { requireCustomerPlanOperator } from './customerPlanGrants'
import { bindPageStudioLoginSession, resolvePageStudioLoginSession } from './loginSessions'
import { guardCustomerRequest, customerSessionToken, limitCustomerRequest } from './customerSignupHttp'
import { readCustomerSession } from './customerSignup'
import { readPageStudioJson } from './boundedJson'

const Id = z.string().uuid()
const StatusQuery = z.object({ expectedRevision: z.string().regex(/^[1-9]\d{0,9}$/).transform(Number).pipe(z.number().int().positive().max(2147483647)) }).strict()
const ListQuery = z.object({ cursor: Id.optional() }).strict()
const emptyQuery = z.object({}).strict()
const invalid = () => createError({ statusCode: 400 })
function parse<T>(schema: z.ZodType<T>, raw: unknown) {
  const parsed = schema.safeParse(raw)
  if (!parsed.success) throw invalid()
  return parsed.data
}
async function body<T>(event: H3Event, schema: z.ZodType<T>) {
  return parse(schema, await readPageStudioJson(event, 1024, [
    'Use JSON for this request.', 'The request is too large.', 'Choose a transfer action.', 'Invalid transfer request.', 'Invalid transfer JSON.'
  ]))
}
function boundary(event: H3Event, method: 'GET' | 'POST') {
  setHeader(event, 'cache-control', 'private, no-store')
  setHeader(event, 'Cross-Origin-Resource-Policy', 'same-origin')
  if (event.method !== method) throw createError({ statusCode: 405 })
  const origin = getHeader(event, 'origin')
  if ((method === 'POST' || origin) && origin !== getRequestURL(event).origin) throw createError({ statusCode: 403 })
}
function guarded(error: unknown): never {
  const code = (error as { statusCode?: number })?.statusCode
  throw createError({ statusCode: code && [400, 401, 403, 404, 405, 409, 413, 415, 429].includes(code) ? code : 503,
    statusMessage: code === 401 ? 'Sign in to continue.' : 'Transfer status could not be confirmed. Refresh the saved request before continuing.' })
}
async function operator(event: H3Event) {
  // Studio operations require a genuine cookie login, never bearer-only authority.
  if (!getCookie(event, 'auth_token') && !getCookie(event, 'auth_token_client')) throw createError({ statusCode: 401 })
  const user = await requireAuth(event)
  return transactionWithoutRetry(async (db) => {
    await requireCustomerPlanOperator(db, user.id)
    const login = await resolvePageStudioLoginSession(db, event, 'agency', user.id)
    await bindPageStudioLoginSession(db, login)
    return { actorId: user.id, loginSessionHash: login.tokenHash }
  })
}
async function limitOperator(event: H3Event, hash: string, method: 'GET' | 'POST') {
  const result = await checkAndConsume({ key: `studio-transfer:${method}:${hash}`, limit: method === 'GET' ? 120 : 30, windowSeconds: 900, failureMode: 'closed' })
  if (!result.allowed) {
    setHeader(event, 'Retry-After', Math.max(1, Math.ceil((result.resetAt.getTime() - Date.now()) / 1000)))
    throw createError({ statusCode: 429 })
  }
}
/** Owner request/consent uses the actual native cookie and rechecks it after RPC. */
export async function handleTransferOwnerHttp(event: H3Event, method: 'GET' | 'POST') {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    guardCustomerRequest(event, method)
    boundary(event, method)
    parse(emptyQuery, getQuery(event))
    const siteId = parse(Id, getRouterParam(event, 'siteId'))
    const token = customerSessionToken(event), ownerLoginSessionHash = await digestPortalSessionToken(token)
    const principal = await readCustomerSession(token, transactionWithoutRetry)
    await limitCustomerRequest(event, `transfer:${method}:${ownerLoginSessionHash}`, method === 'GET' ? 120 : 30)
    const input = method === 'GET' ? { action: 'owner-status' as const } : await body(event, TransferOwnerBodySchema)
    const result = await callTransferControls({ ...input, siteId, ownerLoginSessionHash }, event.context.cloudflare?.env ?? {})
    if (collectionCanonical(principal) !== collectionCanonical(await readCustomerSession(token, transactionWithoutRetry))) throw createError({ statusCode: 403 })
    return result
  } catch (error) { guarded(error) }
}
/** Current operator is independently checked before and after the one RPC. */
export async function handleTransferOperatorHttp(event: H3Event, method: 'GET' | 'POST', route: 'list' | 'request' | 'workflow') {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    boundary(event, method)
    if (route === 'list' && method !== 'GET') throw createError({ statusCode: 405 })
    const query = parse(route === 'list' ? ListQuery : route === 'workflow' && method === 'GET' ? StatusQuery : emptyQuery, getQuery(event))
    const identity = route === 'list' ? {} : { siteId: parse(Id, getRouterParam(event, 'siteId')), requestId: parse(Id, getRouterParam(event, 'requestId')) }
    const principal = await operator(event)
    await limitOperator(event, principal.loginSessionHash, method)
    const env = event.context.cloudflare?.env ?? {}
    let result: unknown
    if (route === 'workflow') {
      const input = method === 'GET' ? { ...query, action: 'status' } : await body(event, TransferWorkflowBodySchema)
      result = await callTransferWorkflow({ ...identity, ...input, operator: principal }, env)
    } else {
      const input = route === 'list' ? { ...query, action: 'operator-list' } : method === 'GET' ? { action: 'operator-status' } : await body(event, TransferOperatorBodySchema)
      result = await callTransferControls({ ...identity, ...input, operator: principal }, env)
    }
    if (collectionCanonical(principal) !== collectionCanonical(await operator(event))) throw createError({ statusCode: 403 })
    return result
  } catch (error) { guarded(error) }
}
