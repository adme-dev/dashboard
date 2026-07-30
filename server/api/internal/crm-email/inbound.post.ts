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
  = /^v[1-9]\d{0,5}\.[A-Za-z0-9_-]{22}\.[A-Za-z0-9_-]{27}$/
const rawMimeKeyPattern
  = /^crm-email\/inbound\/\d{4}\/\d{2}\/\d{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\/message\.eml$/i
const sha256Pattern = /^[a-f0-9]{64}$/
const contentTypePattern
  = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/[a-z0-9][a-z0-9!#$&^_.+-]*$/
const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024
const MAX_COMBINED_ATTACHMENT_BYTES = 8 * 1024 * 1024
const MAX_RETENTION_MILLISECONDS = 30 * 24 * 60 * 60 * 1000

function containsControlCharacter(value: string): boolean {
  return [...value].some((character) => {
    const code = character.charCodeAt(0)
    return code < 32 || code === 127
  })
}

const inboundAttachmentSchema = z.object({
  r2ObjectKey: z.string().min(1).max(1024),
  filename: z.string()
    .trim()
    .min(1)
    .max(500)
    .refine(value =>
      !value.includes('/')
      && !value.includes('\\')
      && !containsControlCharacter(value)
    ),
  contentType: z.string().max(255).regex(contentTypePattern),
  byteSize: z.number().int().min(0).max(MAX_ATTACHMENT_BYTES),
  sha256: z.string().regex(sha256Pattern),
  contentId: z.string()
    .max(998)
    .refine(value => !containsControlCharacter(value))
    .nullable()
}).strict()

const inboundPayloadSchema = z.object({
  routeKind: z.enum(['lead_inbox', 'conversation_reply']),
  routeToken: z.string().max(128).regex(routeTokenPattern),
  recipientDomain: z.string().trim().min(3).max(253),
  providerMessageId: z.string().trim().min(1).max(500),
  rawMimeR2Key: z.string()
    .min(20)
    .max(1024)
    .regex(rawMimeKeyPattern),
  rawMimeSha256: z.string().regex(sha256Pattern),
  rawMimeExpiresAt: z.string().datetime({ offset: true }),
  attachments: z.array(inboundAttachmentSchema).max(10),
  receivedAt: z.string().datetime({ offset: true })
}).strict().superRefine((payload, context) => {
  const prefix = payload.rawMimeR2Key.slice(0, -'/message.eml'.length)
  let combinedBytes = 0

  for (const [offset, attachment] of payload.attachments.entries()) {
    const expectedKey
      = `${prefix}/attachments/${String(offset + 1).padStart(2, '0')}.bin`
    if (attachment.r2ObjectKey !== expectedKey) {
      context.addIssue({
        code: 'custom',
        path: ['attachments', offset, 'r2ObjectKey'],
        message: 'Attachment R2 key does not match the raw MIME object'
      })
    }
    combinedBytes += attachment.byteSize
  }

  if (combinedBytes > MAX_COMBINED_ATTACHMENT_BYTES) {
    context.addIssue({
      code: 'custom',
      path: ['attachments'],
      message: 'Combined attachment bytes exceed the inbound limit'
    })
  }

  const receivedAt = Date.parse(payload.receivedAt)
  const expiresAt = Date.parse(payload.rawMimeExpiresAt)
  const retention = expiresAt - receivedAt
  if (retention <= 0 || retention > MAX_RETENTION_MILLISECONDS) {
    context.addIssue({
      code: 'custom',
      path: ['rawMimeExpiresAt'],
      message: 'Raw MIME retention is outside the approved policy'
    })
  }
})

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
      rawMimeSha256: payload.rawMimeSha256,
      rawMimeExpiresAt: payload.rawMimeExpiresAt,
      attachments: payload.attachments.map(attachment => ({
        ...attachment,
        contentId: attachment.contentId ?? null
      })),
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
