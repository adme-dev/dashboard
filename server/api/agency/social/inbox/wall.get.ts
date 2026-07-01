import { requireAuth } from '~~/server/utils/auth'
import { queryRows } from '~~/server/utils/db'
import { buildSocialInboxWallQuery, normalizeSocialInboxWallRows } from '~~/server/utils/socialInbox/wall'

const VALID_STATUSES = new Set(['open', 'snoozed', 'closed'])

function queryString(value: unknown) {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string') return undefined
  const text = raw.trim()
  return text.length ? text : undefined
}

function queryNumber(value: unknown) {
  const text = queryString(value)
  if (!text) return undefined
  const n = Number(text)
  return Number.isFinite(n) ? n : undefined
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const q = getQuery(event)
  const clientId = queryString(q.clientId)
  if (!clientId) throw createError({ statusCode: 400, statusMessage: 'clientId required' })

  const status = queryString(q.status)
  if (status && !VALID_STATUSES.has(status)) {
    throw createError({ statusCode: 400, statusMessage: 'Unsupported status filter' })
  }

  const { sql, params } = buildSocialInboxWallQuery({
    clientId,
    platform: queryString(q.platform),
    accountId: queryString(q.accountId),
    status,
    assignedTo: queryString(q.assignedTo),
    search: queryString(q.q),
    limit: queryNumber(q.limit)
  })

  return normalizeSocialInboxWallRows(await queryRows(sql, params))
})
