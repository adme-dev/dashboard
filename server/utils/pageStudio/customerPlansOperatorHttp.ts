import { createError, getHeader, getQuery, getRequestURL, setHeader, type H3Event } from 'h3'
import { requireAuth } from '~~/server/utils/auth'
import { readPageStudioJson } from './boundedJson'
import { grantCustomerPublishingPlan } from './customerPlanGrants'
import { listCustomerPlanTargets } from './customerPlanTargets'
import { pageStudioHttpError } from './http'

export async function handleCustomerPlansOperator(event: H3Event, method: 'GET' | 'POST') {
  setHeader(event, 'cache-control', 'private, no-store')
  try {
    if (event.method !== method) throw createError({ statusCode: 405, statusMessage: 'Method not allowed' })
    const user = await requireAuth(event)
    if (method === 'GET') return await listCustomerPlanTargets(user.id, getQuery(event))
    if (getHeader(event, 'origin') !== getRequestURL(event).origin) {
      throw createError({ statusCode: 403, statusMessage: 'Plan changes must start from this application' })
    }
    if (Object.keys(getQuery(event)).length) throw createError({ statusCode: 400, statusMessage: 'Invalid plan request' })
    const body = await readPageStudioJson(event, 4096, [
      'Plan requests require JSON', 'Plan request is too large', 'Plan request is required',
      'Invalid plan request body', 'Invalid plan request JSON'
    ])
    return await grantCustomerPublishingPlan({ actorId: user.id, body })
  } catch (error) { pageStudioHttpError(error) }
}
