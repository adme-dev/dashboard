// server/utils/crm/lifecycle.ts
// CRM contact lifecycle: pure forward-only transition rules + tag derivation
// (TDD), plus a best-effort DB applier hooked into opportunity/activity paths.
//
// Lifecycle: lead → prospect → active → customer. `lost`/`dormant` are revivable
// side-states (a positive event lifts a contact back into the funnel). We never
// auto-downgrade an advanced stage, and we never auto-set lost/dormant here —
// those come from manual edits or score decay, out of scope for F5.
import { queryOne, execute } from '~~/server/utils/db'

export type LifecycleStage = 'lead' | 'prospect' | 'active' | 'customer' | 'lost' | 'dormant'

// Higher rank = further down the funnel. lost/dormant sit below lead so any
// positive event revives them. Custom/unrecognised stages have no rank and are
// left untouched.
const RANK: Record<string, number> = {
  lost: -1,
  dormant: -1,
  lead: 0,
  prospect: 1,
  active: 2,
  customer: 3,
}

// Maps a lifecycle event to the stage it would advance a contact toward.
const EVENT_TARGET: Record<string, LifecycleStage | undefined> = {
  activity_logged: 'lead',
  opportunity_created: 'prospect',
  opportunity_won: 'customer',
}

// Pure: given an event and the contact's current stage, return the resulting
// stage. Forward-only — never returns a lower-ranked stage than `current`.
export function nextLifecycle(event: string, current: string | null | undefined): string | null {
  const cur = current || null
  const target = EVENT_TARGET[event]
  if (!target) return cur // unknown / non-advancing event (e.g. opportunity_lost)
  if (!cur) return target
  const curRank = RANK[cur]
  if (curRank === undefined) return cur // custom stage — leave it alone
  return RANK[target]! > curRank ? target : cur
}

// Tags an event contributes. Kept tiny on purpose (YAGNI).
const EVENT_TAGS: Record<string, string[]> = {
  opportunity_won: ['won'],
}

// Pure: union the event's tags into the current set, preserving order + dedup.
export function deriveTags(event: string, current: string[] = []): string[] {
  const add = EVENT_TAGS[event] ?? []
  if (!add.length) return current
  const set = new Set(current)
  for (const t of add) set.add(t)
  return [...set]
}

// Best-effort DB applier. Advances lifecycle + adds derived tags for a contact,
// writing only when something actually changes. Callers wrap in try/catch so a
// lifecycle failure never rolls back the originating mutation.
export async function applyLifecycleEvent(opts: {
  clientId: string
  entityType: 'person' | 'company'
  entityId: string | null | undefined
  event: string
}): Promise<void> {
  if (!opts.entityId) return
  const table = opts.entityType === 'person' ? 'crm_people' : 'crm_companies'
  const row = await queryOne<{ lifecycle_stage: string | null, tags: string[] | null }>(
    `SELECT lifecycle_stage, tags FROM ${table} WHERE id = $1 AND client_id = $2 AND deleted_at IS NULL`,
    [opts.entityId, opts.clientId],
  )
  if (!row) return
  const curTags = row.tags ?? []
  const newStage = nextLifecycle(opts.event, row.lifecycle_stage)
  const newTags = deriveTags(opts.event, curTags)
  const stageChanged = newStage !== (row.lifecycle_stage || null)
  const tagsChanged = newTags.length !== curTags.length
  if (!stageChanged && !tagsChanged) return
  await execute(
    `UPDATE ${table} SET lifecycle_stage = $1, tags = $2, updated_at = NOW() WHERE id = $3 AND client_id = $4`,
    [newStage, newTags, opts.entityId, opts.clientId],
  )
}
