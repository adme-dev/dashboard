import type { SocialInboxSyncChannelResult, SocialInboxSyncResult } from '~/types'

function plural(count: number, singular: string, pluralLabel = `${singular}s`) {
  return `${count} ${count === 1 ? singular : pluralLabel}`
}

export function getSocialInboxSyncIssueCount(result: Pick<SocialInboxSyncResult, 'channels'> | null | undefined) {
  return (result?.channels ?? []).filter(channel => channel.status === 'error' || channel.status === 'skipped').length
}

export function getSocialInboxSyncChannelsForAccount(
  result: Pick<SocialInboxSyncResult, 'channels'> | null | undefined,
  accountId: string
) {
  return (result?.channels ?? []).filter(channel => channel.accountId === accountId)
}

export function getSocialInboxSyncStatusDisplay(status: SocialInboxSyncChannelResult['status']) {
  if (status === 'success') return { label: 'Synced', color: 'success' as const, icon: 'i-lucide-check-circle-2' }
  if (status === 'skipped') return { label: 'Skipped', color: 'warning' as const, icon: 'i-lucide-clock-3' }
  return { label: 'Failed', color: 'error' as const, icon: 'i-lucide-alert-triangle' }
}

export function formatSocialInboxSyncChannelResult(channel: SocialInboxSyncChannelResult) {
  if (channel.status === 'success') return `${plural(channel.synced, 'new item')}`
  return channel.error || getSocialInboxSyncStatusDisplay(channel.status).label
}

export function formatSocialInboxSyncSummary(result: SocialInboxSyncResult) {
  const parts = [`${plural(result.synced, 'new item')}`]
  const channelCount = result.channels?.length ?? 0
  if (channelCount) parts.push(`${plural(channelCount, 'channel')} checked`)

  const issueCount = getSocialInboxSyncIssueCount(result)
  if (issueCount) parts.push(`${plural(issueCount, 'channel')} failed`)
  if (result.skipped && !issueCount) parts.push(`${plural(result.skipped, 'channel')} skipped`)
  if (result.automated) parts.push(`${plural(result.automated, 'automation run')}`)
  if (result.breaches) parts.push(`${plural(result.breaches, 'SLA breach')}`)
  if (result.timedOut) parts.push('time limit reached')
  return parts.join(' · ')
}
