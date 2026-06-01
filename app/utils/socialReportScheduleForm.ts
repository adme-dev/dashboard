// app/utils/socialReportScheduleForm.ts
// Pure client-side helpers for the Slice 3 / 3c-2 schedule editor. Give the form instant
// feedback (recipient chips, list summaries); the API (schedules/index.post.ts) remains the
// authority and re-validates on the server.

/** Same shape the server accepts: local-part @ domain . tld, no whitespace. */
export function isValidEmail(value: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value.trim())
}

/**
 * Parse a free-text recipients field (commas / semicolons / whitespace / newlines) into a clean,
 * lowercased, de-duplicated list of valid email addresses, preserving first-seen order.
 */
export function parseRecipients(raw: string): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const token of (raw || '').split(/[\s,;]+/)) {
    const email = token.trim().toLowerCase()
    if (!email || !isValidEmail(email) || seen.has(email)) continue
    seen.add(email)
    out.push(email)
  }
  return out
}

export interface PlatformOption { label: string; value: string }

/** The six supported social networks (stored platform values). Single source of truth. */
export const SOCIAL_NETWORK_OPTIONS: PlatformOption[] = [
  { label: 'Facebook', value: 'facebook' },
  { label: 'Instagram', value: 'instagram' },
  { label: 'LinkedIn', value: 'linkedin' },
  { label: 'YouTube', value: 'youtube' },
  { label: 'TikTok', value: 'tiktok' },
  { label: 'Google Business', value: 'google-business' },
]

/** Network options prefixed with the "all networks" sentinel — for filter/select menus. */
export const SOCIAL_PLATFORM_FILTER_OPTIONS: PlatformOption[] = [
  { label: 'All networks', value: 'all' },
  ...SOCIAL_NETWORK_OPTIONS,
]

/** Human label for a stored platform value (null = all networks). */
export function platformLabel(platform: string | null): string {
  if (!platform) return 'all networks'
  return SOCIAL_NETWORK_OPTIONS.find(o => o.value === platform)?.label ?? platform
}

export interface ScheduleSummaryInput {
  cadence: string
  window_days: number
  platform: string | null
  recipients: string[]
}

/** One-line description of a schedule for the management list. */
export function scheduleSummary(s: ScheduleSummaryInput): string {
  const cadence = s.cadence === 'weekly' ? 'Weekly' : 'Monthly'
  const count = s.recipients?.length ?? 0
  const audience = count === 0 ? 'no recipients' : `${count} recipient${count === 1 ? '' : 's'}`
  return `${cadence} · last ${s.window_days} days · ${platformLabel(s.platform)} · ${audience}`
}
