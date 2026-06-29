import type { SocialInboxAccountHealth } from '~/types'

type BadgeColor = 'success' | 'warning' | 'error' | 'neutral'

const STATUS_META: Record<SocialInboxAccountHealth['status'], { label: string, color: BadgeColor, icon: string }> = {
  healthy: { label: 'Healthy', color: 'success', icon: 'i-lucide-circle-check' },
  attention: { label: 'Needs attention', color: 'warning', icon: 'i-lucide-triangle-alert' },
  reauth: { label: 'Reconnect required', color: 'error', icon: 'i-lucide-plug-zap' },
  inactive: { label: 'Inactive', color: 'neutral', icon: 'i-lucide-circle-minus' },
  not_synced: { label: 'Not synced', color: 'warning', icon: 'i-lucide-clock-alert' }
}

export function getSocialInboxAccountHealthDisplay(status: SocialInboxAccountHealth['status']) {
  return STATUS_META[status]
}

export function getSocialInboxAccountIssueText(account: Pick<SocialInboxAccountHealth, 'status' | 'last_error' | 'cursor_error_count'>) {
  if (account.last_error) return account.last_error
  if (account.cursor_error_count > 0) return `${account.cursor_error_count} sync cursor issue${account.cursor_error_count === 1 ? '' : 's'}`
  if (account.status === 'reauth') return 'The token has expired and the account needs to be reconnected.'
  if (account.status === 'not_synced') return 'This account has not completed an inbox sync yet.'
  if (account.status === 'inactive') return 'This account is currently inactive.'
  return 'No account issues detected.'
}
