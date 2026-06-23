// Inbox tab definitions + the notification-type → tab mapping, extracted so the
// mapping is unit-testable and stays in sync with the notification types the app
// actually creates (`NotificationType` in server/utils/notifications.ts).
//
// Coverage intent (every created type should have a home beyond "All"):
//   assigned  — anything "assigned to you" (task / brief / social)
//   mentions  — @-mentions (task / chat)
//   approvals — the full approval lifecycle: requested, completed, AND response
//   chat      — direct chat traffic
//   system    — system-generated alerts with no human actor (anomalies, leads,
//               AI digest, board membership, social SLA) + generic system/team
// Types deliberately left to "All" only: task lifecycle (comment/status/due/
// overdue) and brief status/comment/submit — high-volume, low-actionability.

export interface InboxTab {
  label: string
  value: string
}

export const inboxTabItems: InboxTab[] = [
  { label: 'All', value: 'all' },
  { label: 'Unread', value: 'unread' },
  { label: 'Assigned', value: 'assigned' },
  { label: 'Mentions', value: 'mentions' },
  { label: 'Approvals', value: 'approvals' },
  { label: 'Chat', value: 'chat' },
  { label: 'System', value: 'system' }
]

// Maps a category tab → the notification types it surfaces. 'all' and 'unread'
// are handled structurally in filterNotificationsByTab (not type-based).
export const typesByTab: Record<string, string[]> = {
  assigned: ['task_assigned', 'brief_assigned', 'social_assigned'],
  mentions: ['task_mentioned', 'chat_mention'],
  approvals: ['approval_requested', 'approval_completed', 'approval_response'],
  chat: ['chat_mention', 'chat_dm'],
  system: ['system', 'team_update', 'anomaly_critical', 'ai_digest', 'board_member_added', 'lead', 'social_sla_breach']
}

interface FilterableNotification {
  type: string
  isRead: boolean
}

export function filterNotificationsByTab<T extends FilterableNotification>(items: T[], tab: string): T[] {
  if (tab === 'all') return items
  if (tab === 'unread') return items.filter(n => !n.isRead)
  const types = typesByTab[tab]
  return types ? items.filter(n => types.includes(n.type)) : items
}
