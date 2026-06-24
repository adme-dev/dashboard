import { classifyConnectionHealth, type ConnectionHealth } from './connectionHealth'

export type SpendControlStatus = 'healthy' | 'warning' | 'critical'
export type SpendControlIssueType
  = | 'duplicate_connection'
    | 'unmapped_spend'
    | 'expired_connection'
    | 'stale_connection'
    | 'disconnected_connection'

export interface SpendDiagnosticConnectionInput {
  id: string
  platform: string
  accountId: string | null
  accountName: string | null
  status: string
  tokenExpiresAt: string | null
  refreshToken: string | null
  lastSyncedAt: string | null
  clientId: string | null
  spend: number
  budget: number
  campaignCount: number
}

export interface SpendDiagnosticUnmappedInput {
  platform: string
  accountId: string | null
  accountName: string | null
  spend: number
  budget: number
  campaignCount: number
}

export interface SpendControlIssue {
  id: string
  type: SpendControlIssueType
  severity: Exclude<SpendControlStatus, 'healthy'>
  title: string
  detail: string
  action: string
  platform: string
  accountId: string | null
  accountName: string | null
  affectedConnections?: string[]
  spend?: number
  budget?: number
  campaignCount?: number
}

export interface SpendControlDiagnostics {
  overallStatus: SpendControlStatus
  summary: {
    connectedAccounts: number
    mappedConnections: number
    duplicateConnectionGroups: number
    unmappedSpendGroups: number
    staleConnections: number
    expiredConnections: number
    disconnectedConnections: number
    issueCount: number
  }
  issues: SpendControlIssue[]
}

interface BuildSpendControlDiagnosticsInput {
  connections: SpendDiagnosticConnectionInput[]
  unmappedSpend: SpendDiagnosticUnmappedInput[]
  now?: Date
}

const HEALTH_ISSUE: Partial<Record<ConnectionHealth, {
  type: SpendControlIssueType
  severity: Exclude<SpendControlStatus, 'healthy'>
  title: string
  action: string
}>> = {
  error: {
    type: 'disconnected_connection',
    severity: 'critical',
    title: 'Disconnected ad account',
    action: 'Reconnect or remove the account before trusting this period.'
  },
  expired: {
    type: 'expired_connection',
    severity: 'critical',
    title: 'Expired ad account token',
    action: 'Reconnect the account so spend sync and budget writes can run.'
  },
  expiring_soon: {
    type: 'expired_connection',
    severity: 'warning',
    title: 'Ad account token expiring soon',
    action: 'Refresh the connection before the token expires.'
  },
  stale_sync: {
    type: 'stale_connection',
    severity: 'warning',
    title: 'Stale ad account sync',
    action: 'Run spend sync before approving pacing recommendations.'
  },
  never_synced: {
    type: 'stale_connection',
    severity: 'warning',
    title: 'Ad account never synced',
    action: 'Run the first spend sync before reviewing pacing.'
  }
}

export function buildSpendControlDiagnostics(input: BuildSpendControlDiagnosticsInput): SpendControlDiagnostics {
  const issues: SpendControlIssue[] = []
  const now = input.now ?? new Date()
  const duplicateGroups = groupedDuplicates(input.connections)

  for (const group of duplicateGroups) {
    const first = group[0]
    issues.push({
      id: `duplicate:${normalizePlatform(first.platform)}:${first.accountId || first.accountName || 'unknown'}`,
      type: 'duplicate_connection',
      severity: 'critical',
      title: 'Duplicate ad account connection',
      detail: `${platformLabel(first.platform)} account ${first.accountName || first.accountId || 'Unknown'} is connected ${group.length} times.`,
      action: 'Keep one connection and remove or repair the duplicate before mapping spend.',
      platform: normalizePlatform(first.platform),
      accountId: first.accountId,
      accountName: first.accountName,
      affectedConnections: group.map(conn => conn.id),
      spend: money(group.reduce((sum, conn) => sum + conn.spend, 0)),
      budget: money(group.reduce((sum, conn) => sum + conn.budget, 0)),
      campaignCount: group.reduce((sum, conn) => sum + conn.campaignCount, 0)
    })
  }

  for (const row of input.unmappedSpend.filter(row => row.spend > 0 || row.budget > 0 || row.campaignCount > 0)) {
    issues.push({
      id: `unmapped:${normalizePlatform(row.platform)}:${row.accountId || row.accountName || 'unknown'}`,
      type: 'unmapped_spend',
      severity: 'critical',
      title: 'Unmapped spend group',
      detail: `${platformLabel(row.platform)} spend for ${row.accountName || row.accountId || 'Unknown account'} is not assigned to a client.`,
      action: 'Map this ad account to the correct client before relying on budget variance.',
      platform: normalizePlatform(row.platform),
      accountId: row.accountId,
      accountName: row.accountName,
      spend: money(row.spend),
      budget: money(row.budget),
      campaignCount: row.campaignCount
    })
  }

  for (const conn of input.connections) {
    const { health } = classifyConnectionHealth({
      status: conn.status,
      tokenExpiresAt: conn.tokenExpiresAt,
      refreshToken: conn.refreshToken,
      lastSyncedAt: conn.lastSyncedAt,
      now
    })
    const issue = HEALTH_ISSUE[health]
    if (!issue) continue
    issues.push({
      id: `${issue.type}:${conn.id}`,
      type: issue.type,
      severity: issue.severity,
      title: issue.title,
      detail: `${platformLabel(conn.platform)} account ${conn.accountName || conn.accountId || 'Unknown'} is ${health.replace('_', ' ')}.`,
      action: issue.action,
      platform: normalizePlatform(conn.platform),
      accountId: conn.accountId,
      accountName: conn.accountName,
      affectedConnections: [conn.id],
      spend: money(conn.spend),
      budget: money(conn.budget),
      campaignCount: conn.campaignCount
    })
  }

  issues.sort((a, b) => severityRank(a.severity) - severityRank(b.severity) || issueRank(a.type) - issueRank(b.type))

  const summary = {
    connectedAccounts: input.connections.length,
    mappedConnections: input.connections.filter(conn => Boolean(conn.clientId)).length,
    duplicateConnectionGroups: duplicateGroups.length,
    unmappedSpendGroups: input.unmappedSpend.filter(row => row.spend > 0 || row.budget > 0 || row.campaignCount > 0).length,
    staleConnections: issues.filter(issue => issue.type === 'stale_connection').length,
    expiredConnections: issues.filter(issue => issue.type === 'expired_connection').length,
    disconnectedConnections: issues.filter(issue => issue.type === 'disconnected_connection').length,
    issueCount: issues.length
  }

  return {
    overallStatus: issues.some(issue => issue.severity === 'critical')
      ? 'critical'
      : issues.some(issue => issue.severity === 'warning')
        ? 'warning'
        : 'healthy',
    summary,
    issues
  }
}

function groupedDuplicates(connections: SpendDiagnosticConnectionInput[]) {
  const groups = new Map<string, SpendDiagnosticConnectionInput[]>()
  for (const conn of connections) {
    const identity = conn.accountId || conn.accountName
    if (!identity) continue
    const key = `${normalizePlatform(conn.platform)}:${identity.toLowerCase()}`
    const existing = groups.get(key) || []
    existing.push(conn)
    groups.set(key, existing)
  }
  return Array.from(groups.values()).filter(group => group.length > 1)
}

function severityRank(status: Exclude<SpendControlStatus, 'healthy'>) {
  return status === 'critical' ? 0 : 1
}

function issueRank(type: SpendControlIssueType) {
  const rank: Record<SpendControlIssueType, number> = {
    duplicate_connection: 0,
    unmapped_spend: 1,
    expired_connection: 2,
    disconnected_connection: 3,
    stale_connection: 4
  }
  return rank[type]
}

function normalizePlatform(platform: string) {
  return platform === 'google_ads' ? 'google' : platform
}

function platformLabel(platform: string) {
  const normalized = normalizePlatform(platform)
  if (normalized === 'google') return 'Google Ads'
  if (normalized === 'meta') return 'Meta'
  if (normalized === 'microsoft_ads') return 'Microsoft Ads'
  return normalized.charAt(0).toUpperCase() + normalized.slice(1).replace(/_/g, ' ')
}

function money(value: number) {
  return Math.round((Number(value) || 0) * 100) / 100
}
