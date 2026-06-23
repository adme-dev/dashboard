import { describe, it, expect } from 'vitest'
import { filterNotificationsByTab, typesByTab, inboxTabItems } from '../../app/utils/inboxTabs'

interface N { id: string, type: string, isRead: boolean }
const mk = (type: string, isRead = false): N => ({ id: type, type, isRead })

describe('inbox tab filtering', () => {
  it('All returns everything (no filter)', () => {
    const items = [mk('task_assigned'), mk('system', true)]
    expect(filterNotificationsByTab(items, 'all')).toHaveLength(2)
  })

  it('Unread returns only unread', () => {
    const items = [mk('system', false), mk('system', true)]
    const out = filterNotificationsByTab(items, 'unread')
    expect(out).toHaveLength(1)
    expect(out[0]!.isRead).toBe(false)
  })

  it('Assigned catches task, brief AND social assignments', () => {
    const items = [mk('task_assigned'), mk('brief_assigned'), mk('social_assigned'), mk('system')]
    expect(filterNotificationsByTab(items, 'assigned').map(n => n.type))
      .toEqual(['task_assigned', 'brief_assigned', 'social_assigned'])
  })

  it('Approvals catches requested, completed AND response', () => {
    // approval_response is created on social post approve/reject + the approve token
    // endpoint — it was previously missed by this tab.
    const items = [mk('approval_requested'), mk('approval_completed'), mk('approval_response'), mk('system')]
    expect(filterNotificationsByTab(items, 'approvals').map(n => n.type))
      .toEqual(['approval_requested', 'approval_completed', 'approval_response'])
  })

  it('System catches generated alerts + system/team updates', () => {
    const types = ['system', 'team_update', 'anomaly_critical', 'ai_digest', 'board_member_added', 'lead', 'social_sla_breach']
    const items = [...types.map(t => mk(t)), mk('task_assigned')]
    expect(filterNotificationsByTab(items, 'system').map(n => n.type)).toEqual(types)
  })

  it('Mentions and Chat keep their existing mappings', () => {
    const items = [mk('task_mentioned'), mk('chat_mention'), mk('chat_dm')]
    expect(filterNotificationsByTab(items, 'mentions').map(n => n.type)).toEqual(['task_mentioned', 'chat_mention'])
    expect(filterNotificationsByTab(items, 'chat').map(n => n.type)).toEqual(['chat_mention', 'chat_dm'])
  })

  it('an unknown tab falls back to showing everything', () => {
    const items = [mk('system'), mk('lead')]
    expect(filterNotificationsByTab(items, 'whatever')).toHaveLength(2)
  })

  it('exposes the 7 tabs in display order', () => {
    expect(inboxTabItems.map(t => t.value)).toEqual(['all', 'unread', 'assigned', 'mentions', 'approvals', 'chat', 'system'])
  })

  it('every categorised type is unique to keep tabs unambiguous (except cross-listed chat_mention)', () => {
    const seen = new Map<string, string[]>()
    for (const [tab, types] of Object.entries(typesByTab)) {
      for (const t of types) seen.set(t, [...(seen.get(t) || []), tab])
    }
    // chat_mention is intentionally in both Mentions and Chat; nothing else is duplicated.
    const duplicated = [...seen.entries()].filter(([, tabs]) => tabs.length > 1).map(([t]) => t)
    expect(duplicated).toEqual(['chat_mention'])
  })
})
