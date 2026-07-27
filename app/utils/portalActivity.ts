export interface PortalActivity {
  id: string
  action: string
  entityType: string | null
  entityId: string | null
  details: Record<string, unknown>
  createdAt: string
  userName: string | null
}

export function portalActivityIcon(action: string) {
  if (action.includes('request')) return 'i-lucide-message-square'
  if (action.includes('approval')) return 'i-lucide-check-check'
  if (action.includes('login') || action.includes('access')) return 'i-lucide-shield-check'
  if (action.includes('comment') || action.includes('reply')) return 'i-lucide-message-circle'
  if (action.includes('invite') || action.includes('activated')) return 'i-lucide-user-check'
  return 'i-lucide-activity'
}

export function portalActivityLabel(activity: PortalActivity) {
  const details = activity.details || {}

  if (activity.action === 'agency_request_updated') {
    const status = typeof details.status === 'string'
      ? details.status.replaceAll('_', ' ')
      : 'updated'
    return `updated your request to ${status}`
  }
  if (activity.action === 'agency_request_reply') return 'replied to your request'
  if (activity.action === 'client_request_submitted') {
    const title = typeof details.title === 'string' ? `: ${details.title}` : ''
    return `submitted a request${title}`
  }
  if (activity.action === 'client_request_message_added') return 'added a request reply'
  if (activity.action === 'agency_portal_access') return 'previewed the client portal'
  if (activity.action === 'invite_accepted') return 'accepted a portal invite'
  if (activity.action === 'account_activated') return 'activated their portal account'
  if (activity.action === 'approval_response') return 'responded to an approval'
  if (activity.action === 'comment_added') return 'added a comment'
  if (activity.action === 'login') return 'signed in to the portal'

  return activity.action.replaceAll('_', ' ')
}
