// server/utils/crm/comms.ts
// F10 — pure helpers for the unified communication log + contact-preference
// enforcement. The DB layer lives in commsDb.ts; bridges call contactPrefBlocks()
// before logging/sending an outbound communication.

export type CommChannel = 'email' | 'call' | 'sms' | 'meeting' | 'note'
export type CommDirection = 'inbound' | 'outbound'

export interface ContactPrefs {
  do_not_contact?: boolean | null
  do_not_email?: boolean | null
  do_not_call?: boolean | null
  do_not_sms?: boolean | null
}

/**
 * Returns a reason string if an OUTBOUND communication on `channel` is blocked by
 * the contact's preferences, else null. Inbound is never blocked (we still log it).
 * do_not_contact is a master switch over every channel.
 */
export function contactPrefBlocks(prefs: ContactPrefs | null | undefined, channel: CommChannel): string | null {
  if (!prefs) return null
  if (prefs.do_not_contact) return 'contact opted out of all communication'
  if (channel === 'email' && prefs.do_not_email) return 'contact opted out of email'
  if (channel === 'call' && prefs.do_not_call) return 'contact opted out of calls'
  if (channel === 'sms' && prefs.do_not_sms) return 'contact opted out of SMS'
  return null
}

/** A normalised timeline entry (activity or communication) for the merged view. */
export interface TimelineEntry {
  source: 'activity' | 'communication'
  id: string
  kind: string                 // activity.type or communication.channel
  direction: CommDirection | null
  title: string | null
  body: string | null
  at: string                   // ISO timestamp used for ordering
  actor_name: string | null
}

/** Merge + sort two already-normalised lists newest-first (stable on ties). */
export function mergeTimeline(a: TimelineEntry[], b: TimelineEntry[]): TimelineEntry[] {
  return [...a, ...b].sort((x, y) => (x.at < y.at ? 1 : x.at > y.at ? -1 : 0))
}
