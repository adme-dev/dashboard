import { describe, it, expect } from 'vitest'
import { contactPrefBlocks, mergeTimeline, type TimelineEntry } from '~~/server/utils/crm/comms'

describe('contactPrefBlocks', () => {
  it('returns null when there are no blocking prefs', () => {
    expect(contactPrefBlocks(null, 'email')).toBeNull()
    expect(contactPrefBlocks({}, 'email')).toBeNull()
    expect(contactPrefBlocks({ do_not_call: true }, 'email')).toBeNull()
  })
  it('do_not_contact blocks every channel', () => {
    for (const ch of ['email', 'call', 'sms', 'meeting', 'note'] as const) {
      expect(contactPrefBlocks({ do_not_contact: true }, ch)).toMatch(/all communication/)
    }
  })
  it('per-channel opt-outs block only their channel', () => {
    expect(contactPrefBlocks({ do_not_email: true }, 'email')).toMatch(/email/)
    expect(contactPrefBlocks({ do_not_email: true }, 'call')).toBeNull()
    expect(contactPrefBlocks({ do_not_call: true }, 'call')).toMatch(/calls/)
    expect(contactPrefBlocks({ do_not_sms: true }, 'sms')).toMatch(/SMS/)
  })
})

describe('mergeTimeline', () => {
  const mk = (id: string, at: string, source: 'activity' | 'communication'): TimelineEntry =>
    ({ source, id, kind: 'x', direction: null, title: null, body: null, at, actor_name: null })
  it('merges two lists newest-first', () => {
    const a = [mk('a1', '2026-01-03T00:00:00Z', 'activity'), mk('a2', '2026-01-01T00:00:00Z', 'activity')]
    const b = [mk('c1', '2026-01-02T00:00:00Z', 'communication')]
    expect(mergeTimeline(a, b).map(e => e.id)).toEqual(['a1', 'c1', 'a2'])
  })
})
