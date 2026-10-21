import { createError, getHeader, getQuery, getRouterParam, type H3Event } from 'h3'
import { z } from 'zod'
import { readPageStudioJson } from './boundedJson'
import { PageStudioIdempotencyKeySchema } from './controlSchemas'
import { PageStudioReleaseActivationBody, PageStudioReleaseRollbackBody, PageStudioSiteId } from './schemas'

export const activation = PageStudioReleaseActivationBody.extend({ environment: z.literal('production') })
export const rollback = PageStudioReleaseRollbackBody.extend({ environment: z.literal('production') })
/** Syntax only; each caller authenticates before this parser and owns all authority. */
export async function readPublicationRequest(event: H3Event, action: 'activate' | 'rollback') {
  const siteId = PageStudioSiteId.safeParse(getRouterParam(event, 'siteId'))
  const key = PageStudioIdempotencyKeySchema.safeParse(getHeader(event, 'idempotency-key'))
  if (!siteId.success || !key.success || !z.object({}).strict().safeParse(getQuery(event)).success) throw createError({ statusCode: 400, statusMessage: 'Invalid website publication request' })
  const raw = await readPageStudioJson(event, 2048, [
    'Website publication requires JSON', 'Website publication request is too large',
    'Website publication request is required', 'Invalid website publication body', 'Invalid website publication JSON'
  ])
  const parsed = (action === 'activate' ? activation : rollback).safeParse(raw)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid website publication request' })
  return { siteId: siteId.data, key: key.data, body: parsed.data }
}
