import {
  createError,
  defineEventHandler,
  getHeader,
  readBody,
  type H3Event
} from 'h3'
import {
  CrmEmailInboundProcessingRequestSchema
} from '~~/server/utils/crm/emailInboundProcessingContracts'
import {
  processCrmInboundEmail
} from '~~/server/utils/crm/emailInboundProcessor'

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

  const parsed = CrmEmailInboundProcessingRequestSchema.safeParse(
    await readBody(event)
  )
  if (!parsed.success) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid CRM email processing payload'
    })
  }

  const result = await processCrmInboundEmail(parsed.data)
  if (result.status === 'route_unavailable') {
    throw createError({
      statusCode: 409,
      statusMessage: 'CRM email route is unavailable'
    })
  }

  return {
    accepted: true as const,
    duplicate: result.status === 'duplicate'
  }
})
