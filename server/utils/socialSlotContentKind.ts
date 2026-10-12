import { createError } from 'h3'

export function normalizeSlotContentKind(value: unknown): 'general' | 'news' | 'sponsor' {
  if (value === undefined) return 'general'
  if (value === 'general' || value === 'news' || value === 'sponsor') return value
  throw createError({ statusCode: 400, statusMessage: 'Slot content type must be general, news or sponsor' })
}
