import { CalendarDateTime, fromDate, getDayOfWeek, toZoned } from '@internationalized/date'

export const DRIVEAGENT_NEWS_ORIGIN = 'https://driveagent.news'
export const NEWS_MAX_AGE_MS = 72 * 60 * 60 * 1000
export interface PublishedSocialStory { id: string, url: string, title: string, content: string, mediaUrl: string, publishedAt: string }
export interface NewsPostingSlot { id: string, day_of_week: number, time_of_day: string, timezone: string, capacity: number, platforms: string[], metadata: Record<string, unknown> }
export interface PlannedNewsSlot { at: string, slotId: string, timezone: string }

export function canonicalNewsUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    const url = new URL(value)
    if (url.origin !== DRIVEAGENT_NEWS_ORIGIN || url.username || url.password || !/^\/news\/[a-z0-9-]+\/?$/.test(url.pathname)) return null
    return `${url.origin}${url.pathname.replace(/\/$/, '')}`
  } catch { return null }
}

/** Only the publisher's already-approved facts are copied; no generative rewrite. */
export function eligiblePublishedStory(input: unknown, now: Date): PublishedSocialStory | null {
  if (!input || typeof input !== 'object') return null
  const item = input as Record<string, unknown>
  if (item.status !== 'published' || item.archive || typeof item.id !== 'string' || !item.id) return null
  if (typeof item.slug !== 'string' || !/^[a-z0-9-]+$/.test(item.slug)) return null
  if (typeof item.title !== 'string' || !item.title.trim() || item.title.length > 500) return null
  if (typeof item.publishedAt !== 'string') return null
  const age = now.getTime() - Date.parse(item.publishedAt)
  if (!Number.isFinite(age) || age < 0 || age > NEWS_MAX_AGE_MS) return null
  if (!item.image || typeof item.image !== 'object') return null
  const image = item.image as Record<string, unknown>
  if (typeof image.url !== 'string') return null
  let media: URL
  try {
    media = new URL(image.url, DRIVEAGENT_NEWS_ORIGIN)
  } catch { return null }
  if (media.origin !== DRIVEAGENT_NEWS_ORIGIN || media.username || media.password || !/^\/api\/news\/(media|artwork)\/[a-zA-Z0-9-]+$/.test(media.pathname)) return null
  const title = item.title.trim()
  const summary = typeof item.standfirst === 'string' ? item.standfirst.trim().slice(0, 600) : ''
  const date = new Intl.DateTimeFormat('en-AU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Australia/Melbourne' }).format(new Date(item.publishedAt))
  return {
    id: item.id, title, url: `${DRIVEAGENT_NEWS_ORIGIN}/news/${item.slug}`,
    publishedAt: new Date(item.publishedAt).toISOString(), mediaUrl: media.href,
    content: [title, summary, `From our ${date} coverage. Read the full story at DriveAgent News.`, image.generated === true ? 'Image: AI-generated illustration.' : ''].filter(Boolean).join('\n\n')
  }
}

/** Capacity is shared at an instant; duplicate definitions never multiply capacity. */
export function planNewsSlots(slots: NewsPostingSlot[], occupied: Array<{ scheduled_at: string }>, now: Date, horizonDays = 7): PlannedNewsSlot[] {
  const end = now.getTime() + horizonDays * 86_400_000
  const byInstant = new Map<number, { slot: NewsPostingSlot, capacity: number }>()
  for (const slot of slots) {
    if (slot.metadata?.contentKind !== 'news' || (slot.platforms?.length && !slot.platforms.includes('facebook'))) continue
    const start = fromDate(now, slot.timezone)
    for (let d = 0; d <= horizonDays; d++) {
      const day = start.add({ days: d })
      if (getDayOfWeek(day, 'en-US') !== slot.day_of_week) continue
      const [hour, minute] = slot.time_of_day.split(':').map(Number)
      const at = toZoned(new CalendarDateTime(day.year, day.month, day.day, hour!, minute!), slot.timezone).toDate().getTime()
      if (at <= now.getTime() + 300_000 || at > end) continue
      const capacity = Math.min(10, Math.max(1, slot.capacity || 1))
      const existing = byInstant.get(at)
      if (!existing || capacity > existing.capacity) byInstant.set(at, { slot, capacity })
    }
  }
  const used = new Map<number, number>()
  for (const post of occupied) {
    const at = Date.parse(post.scheduled_at)
    used.set(at, (used.get(at) || 0) + 1)
  }
  return [...byInstant.entries()].sort(([a], [b]) => a - b).flatMap(([at, { slot, capacity }]) =>
    Array.from({ length: Math.max(0, capacity - (used.get(at) || 0)) }, () => ({ at: new Date(at).toISOString(), slotId: slot.id, timezone: slot.timezone })))
}
