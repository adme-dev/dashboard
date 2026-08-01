import type {
  AudienceOpportunityStatus,
  AudienceSiteStatus
} from '~/types/audience-analytics'

type UiColor = 'success' | 'warning' | 'error' | 'neutral' | 'primary'

const statusMetadata: Record<AudienceSiteStatus, {
  label: string
  color: UiColor
  description: string
}> = {
  receiving: {
    label: 'Receiving data',
    color: 'success',
    description: 'An event arrived in the past 24 hours.'
  },
  stale: {
    label: 'Stale signal',
    color: 'warning',
    description: 'The last event arrived between one and seven days ago.'
  },
  no_recent_data: {
    label: 'No recent data',
    color: 'error',
    description: 'No event has arrived in the past seven days.'
  },
  never_received: {
    label: 'Never received',
    color: 'neutral',
    description: 'This endpoint has not recorded its first event.'
  },
  inactive: {
    label: 'Inactive',
    color: 'neutral',
    description: 'Tracking is disabled for this endpoint.'
  }
}

const numberFormatter = new Intl.NumberFormat('en-AU', { maximumFractionDigits: 1 })

export function siteStatusMeta(status: AudienceSiteStatus) {
  return statusMetadata[status]
}

export function formatAudienceDelta(current: number, previous: number): string {
  if (current === 0 && previous === 0) return 'No change'
  if (previous === 0) return 'New activity'

  const change = Math.round(Math.abs(((current - previous) / previous) * 1000)) / 10
  if (change === 0) return 'No change'
  return `${numberFormatter.format(change)}% ${current > previous ? 'increase' : 'decrease'}`
}

export function formatAudienceMetric(metric: string, value: number): string {
  if (/Rate$|Coverage$/.test(metric)) return `${numberFormatter.format(value)}%`
  return numberFormatter.format(value)
}

export function formatFreshness(value: string | null, now = new Date()): string {
  if (!value) return 'No events received'
  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return 'Unknown freshness'

  const minutes = Math.max(0, Math.floor((now.getTime() - parsed.getTime()) / 60_000))
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  return `${days}d ago`
}

export function opportunityTone(status: AudienceOpportunityStatus): {
  color: 'primary' | 'neutral'
  label: string
} {
  return status === 'opportunity'
    ? { color: 'primary', label: 'Opportunity' }
    : { color: 'neutral', label: 'Building evidence' }
}
