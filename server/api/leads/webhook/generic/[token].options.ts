import { queryOne } from '~~/server/utils/db'
import {
  normaliseWebsiteOrigin,
  setWebsiteCorsHeaders
} from '~~/server/utils/leads/websiteCors'

export default defineEventHandler(async (event) => {
  const token = getRouterParam(event, 'token')
  const origin = normaliseWebsiteOrigin(getHeader(event, 'origin'))
  if (!token || !origin) {
    throw createError({ statusCode: 400, statusMessage: 'invalid_preflight' })
  }

  const result = await queryOne<{ allowed: boolean }>(
    `SELECT EXISTS (
       SELECT 1
         FROM lead_webhook_endpoints ep
         JOIN tracking_sites ts
           ON ts.client_id = ep.client_id
          AND ts.is_active = TRUE
        WHERE ep.url_token = $1
          AND $2 = ANY(ts.allowed_origins)
     ) AS allowed`,
    [token, origin]
  )
  if (!result?.allowed) {
    throw createError({ statusCode: 403, statusMessage: 'origin_not_allowed' })
  }

  setWebsiteCorsHeaders(event, origin)
  setResponseHeaders(event, {
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'content-type',
    'Access-Control-Max-Age': '86400'
  })
  setResponseStatus(event, 204)
  return ''
})
