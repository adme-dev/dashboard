import { createError, getRouterParam, type H3Event } from 'h3'
import { z } from 'zod'
import type { R2BucketBinding } from '~~/server/utils/storage'

export function storyboardRouteId(event: H3Event, name = 'id'): string {
  const result = z.string().uuid().safeParse(getRouterParam(event, name))
  if (!result.success) throw createError({ statusCode: 400, statusMessage: 'Invalid storyboard identifier' })
  return result.data
}
export function storyboardRequestDependencies(event: H3Event) {
  return { event, bucket: event.context.cloudflare?.env?.MEDIA_BUCKET as R2BucketBinding | undefined }
}
