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

/** Flag explicit offer-period contradictions; never guess or rewrite source dates. */
export function motorstackOfferDateIssue(endDate: string | null, disclaimer: string | null): string | null {
  if (!endDate || !disclaimer) return null
  const months = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december']
  const date = '(\\d{1,2})\\s+(' + months.join('|') + ')\\s+(\\d{4})'
  const period = new RegExp('\\b(?:offer\\s+(?:is\\s+)?available\\s+from|purchased?\\s+(?:and\\s+fitted\\s+)?between|purchase\\s+and\\s+fitting\\s+between)\\s+' + date + '\\s+(?:to|and|until)\\s+' + date, 'gi')
  for (const match of disclaimer.matchAll(period)) {
    const stated = `${match[6]}-${String(months.indexOf(match[5]!.toLowerCase()) + 1).padStart(2, '0')}-${match[4]!.padStart(2, '0')}`
    const parsed = new Date(`${stated}T00:00:00Z`)
    if (Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === stated && stated !== endDate) {
      return `Source end date ${endDate} conflicts with the offer terms (${stated}). Verify the OEM offer before creating a set with AI.`
    }
  }
  return null
}

export const motorstackDesignSelectionSchema = z.object({
  kitId: z.string().uuid(), offerId: z.string().regex(/^[a-f0-9]{64}$/),
  assetId: z.string().uuid().nullable().default(null), mode: z.enum(['create', 'refine']).default('create')
}).strict()
export type MotorstackDesignSelection = z.infer<typeof motorstackDesignSelectionSchema>
