import {
  createError,
  defineEventHandler,
  getHeader,
  readBody,
  setResponseStatus,
  type H3Event
} from 'h3'
import { z } from 'zod'
import { parseCrmEmailReplySecrets } from '~~/server/utils/crm/emailInboundConfig'
import {
  createCrmEmailInboundIdempotencyKey,
  enqueueCrmInboundEmail
} from '~~/server/utils/crm/emailInboundQueue'
import { resolveCrmInboundEmailRoute } from '~~/server/utils/crm/emailRouteRepository'

const routeTokenPattern
  = /^v[1-9]\d{0,5}\.[A-Za-z0-9_-]{32}\.[A-Za-z0-9_-]{43}$/
const rawMimeKeyPattern
  = /^crm-email\/inbound\/[A-Za-z0-9][A-Za-z0-9/_=.-]*$/

const inboundPayloadSchema = z.object({
  routeKind: z.enum(['lead_inbox', 'conversation_reply']),
  routeToken: z.string().max(128).regex(routeTokenPattern),
  recipientDomain: z.string().trim().min(3).max(253),
  providerMessageId: z.string().trim().min(1).max(500),
  rawMimeR2Key: z.string()
    .min(20)
    .max(1024)
    .regex(rawMimeKeyPattern)
    .refine(value => !value.includes('..')),
  receivedAt: z.string().datetime({ offset: true })
}).strict()

function stringBinding(event: H3Event, name: string): string | undefined {
  const eventValue = (event.context as {
    cloudflare?: { env?: Record<string, unknown> }
  }).cloudflare?.env?.[name]
  if (typeof eventValue === 'string') return eventValue

  const processValue = process.env[name]
  return typeof processValue === 'string' ? processValue : undefined
}

function secretMatches(expected: string, supplied: string | undefined): boolean {
  if (!supplied || expected.length !== supplied.length) return false
  let difference = 0
  for (let index = 0; index < expected.length; index += 1) {
    difference |= expected.charCodeAt(index) ^ supplied.charCodeAt(index)
  }
  return difference === 0
}

export default defineEventHandler(async (event) => {
  const workerSecret = stringBinding(event, 'CRM_EMAIL_WORKER_SECRET')?.trim()
  if (!workerSecret) {
    throw createError({
      statusCode: 503,
      statusMessage: 'CRM email Worker authentication is not configured'
    })
  }

  if (!secretMatches(workerSecret, getHeader(event, 'x-crm-email-secret'))) {
    throw createError({ statusCode: 401, statusMessage: 'Unauthorized' })
  }

  if (stringBinding(event, 'CRM_EMAIL_CONVERSATIONS_ENABLED') !== 'true') {
    throw createError({
      statusCode: 503,
      statusMessage: 'CRM email conversations are disabled'
    })
  }

  let secrets: Readonly<Record<number, string>>
  try {
    secrets = parseCrmEmailReplySecrets(
      stringBinding(event, 'CRM_EMAIL_REPLY_SECRETS')
    )
  } catch {
    throw createError({
      statusCode: 503,
      statusMessage: 'CRM email reply secrets are not configured'
    })
  }

  const parsed = inboundPayloadSchema.safeParse(await readBody(event))
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid CRM email inbound payload'
    })
  }

  const payload = parsed.data
  const route = await resolveCrmInboundEmailRoute({
    routeKind: payload.routeKind,
    routeToken: payload.routeToken,
    recipientDomain: payload.recipientDomain,
    secrets
  })
  if (!route) {
    throw createError({
      statusCode: 404,
      statusMessage: 'CRM email route not found'
    })
  }

  const idempotencyKey = await createCrmEmailInboundIdempotencyKey(
    route.routeTokenHash,
    payload.providerMessageId
  )

  try {
    await enqueueCrmInboundEmail(event, {
      version: 1,
      type: 'crm.email.inbound',
      idempotencyKey,
      routeId: route.id,
      clientId: route.clientId,
      conversationId: route.conversationId,
      routeKind: route.routeKind,
      provider: 'cloudflare_email',
      providerMessageId: payload.providerMessageId,
      rawMimeR2Key: payload.rawMimeR2Key,
      receivedAt: payload.receivedAt
    })
  } catch {
    throw createError({
      statusCode: 503,
      statusMessage: 'CRM email inbound queue unavailable'
    })
  }

  setResponseStatus(event, 202)
  return { accepted: true as const }
})
