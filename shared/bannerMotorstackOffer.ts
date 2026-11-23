import { z } from 'zod'

/** OEM end dates are Australian calendar dates; unknown dates require designer review. */
export function isCurrentMotorstackOffer(endDate: string | null, now = new Date()): boolean {
  if (!endDate) return true
  if (!/^\d{4}-\d{2}-\d{2}$/.test(endDate)) return false
  const parsed = new Date(`${endDate}T00:00:00Z`)
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== endDate) return false
  const parts = new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Sydney', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now)
  const part = (type: string) => parts.find(item => item.type === type)!.value
  return endDate >= `${part('year')}-${part('month')}-${part('day')}`
}

export const motorstackDesignSelectionSchema = z.object({
  kitId: z.string().uuid(), offerId: z.string().regex(/^[a-f0-9]{64}$/),
  assetId: z.string().uuid().nullable().default(null), mode: z.enum(['create', 'refine']).default('create')
}).strict()
export type MotorstackDesignSelection = z.infer<typeof motorstackDesignSelectionSchema>
