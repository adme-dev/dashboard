export type SocialInboxPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface ConversationPatchInput {
  status?: unknown
  assigned_to?: unknown
  snoozed_until?: unknown
  markRead?: unknown
  priority?: unknown
  tags?: unknown
}

export interface ConversationPatchUpdate {
  sets: string[]
  params: unknown[]
  broadcastWorthy: boolean
}

const VALID_STATUSES = new Set(['open', 'snoozed', 'closed'])
const VALID_PRIORITIES = new Set(['low', 'medium', 'high', 'urgent'])

function normalizeTags(value: unknown) {
  if (!Array.isArray(value)) return null
  const seen = new Set<string>()
  const tags: string[] = []
  for (const raw of value) {
    const tag = String(raw).trim().replace(/\s+/g, ' ')
    if (!tag || seen.has(tag.toLowerCase())) continue
    seen.add(tag.toLowerCase())
    tags.push(tag.slice(0, 40))
  }
  return tags.slice(0, 20)
}

export function buildConversationPatchUpdate(body: ConversationPatchInput): ConversationPatchUpdate {
  const sets: string[] = []
  const params: unknown[] = []
  const set = (fragment: string, value: unknown) => {
    params.push(value)
    sets.push(fragment.replace('$?', `$${params.length}`))
  }

  if (typeof body.status === 'string' && VALID_STATUSES.has(body.status)) {
    set('status = $?', body.status)
  }
  if (body.assigned_to !== undefined) {
    set('assigned_to = $?', body.assigned_to || null)
    sets.push(`assigned_at = ${body.assigned_to ? 'NOW()' : 'NULL'}`)
  }
  if (body.snoozed_until !== undefined) {
    set('snoozed_until = $?', body.snoozed_until || null)
  }
  if (body.markRead === true) {
    sets.push('unread_count = 0')
  }
  if (body.priority !== undefined) {
    const priority = typeof body.priority === 'string' && VALID_PRIORITIES.has(body.priority) ? body.priority : null
    set('priority = $?', priority)
  }
  if (body.tags !== undefined) {
    set('tags = $?', normalizeTags(body.tags))
  }

  return {
    sets,
    params,
    broadcastWorthy: Boolean(
      body.status
      || body.assigned_to !== undefined
      || body.snoozed_until !== undefined
      || body.priority !== undefined
      || body.tags !== undefined
    )
  }
}
