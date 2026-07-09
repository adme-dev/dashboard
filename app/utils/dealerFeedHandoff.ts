export type DealerFeedHandoffPlatform = 'google' | 'facebook'

export type DealerFeedHandoffIssueGroup = {
  label: string
  count: number
  fixMode: 'source_required' | 'ai_assisted' | 'mapping_required' | 'manual_review'
}

export type DealerFeedHandoffReadiness = {
  status?: 'unknown' | 'empty' | 'ready' | 'partial' | 'blocked'
  matchedTotal?: number
  validatedTotal?: number
  invalidTotal?: number
  issueGroups?: DealerFeedHandoffIssueGroup[]
}

export type DealerFeedHandoffInput = {
  clientName: string
  clientId?: string
  feedName?: string
  platform: DealerFeedHandoffPlatform
  storeCode?: string
  workbookName?: string
  workbookUrl?: string
  workbookStatus?: string
  externalOrgId?: string
  sellerRefs?: string[]
  filterChips?: string[]
  stockListMode?: 'off' | 'include' | 'exclude'
  stockRefCount?: number
  readiness?: DealerFeedHandoffReadiness
  generatedFeedUrl?: string
}

const platformLabel: Record<DealerFeedHandoffPlatform, string> = {
  google: 'Google Merchant',
  facebook: 'Facebook Catalog'
}

const stockListModeLabel = {
  off: 'No stock list',
  include: 'Only listed stock',
  exclude: 'Exclude listed stock'
} as const

const readinessStatusLabel = {
  unknown: 'Checking',
  empty: 'No matches',
  ready: 'Ready',
  partial: 'Partial',
  blocked: 'Blocked'
} as const

const fixModeLabel = {
  source_required: 'Source fix',
  ai_assisted: 'AI assist',
  mapping_required: 'Mapping',
  manual_review: 'Manual review'
} as const

function formatNumber(value: number | null | undefined) {
  return new Intl.NumberFormat('en-AU').format(Number(value) || 0)
}

function line(label: string, value: string | number | null | undefined) {
  const normalized = String(value ?? '').trim()
  return normalized ? `- ${label}: ${normalized}` : ''
}

function section(title: string, lines: string[]) {
  const visible = lines.filter(Boolean)
  return visible.length ? [`${title}`, ...visible] : []
}

export function formatDealerFeedHandoffSummary(input: DealerFeedHandoffInput) {
  const filters = input.filterChips?.length
    ? input.filterChips.map(chip => `- ${chip}`)
    : ['- No campaign filter']
  const sellerRefs = input.sellerRefs?.filter(Boolean) || []
  const readiness = input.readiness
  const issueGroups = readiness?.issueGroups?.filter(group => group.count > 0) || []
  const stockListMode = input.stockListMode || 'off'

  return [
    ...section('Dealer Feed Handoff', [
      line('Client', input.clientName),
      line('Client ID', input.clientId),
      line('Feed', input.feedName || 'Draft feed'),
      line('Platform', platformLabel[input.platform]),
      input.platform === 'google' ? line('Google store code', input.storeCode || 'Not set') : '',
      line('Workbook', input.workbookName),
      line('Workbook status', input.workbookStatus),
      line('Workbook link', input.workbookUrl),
      line('Feed workspace', input.externalOrgId),
      sellerRefs.length ? line('Seller refs', sellerRefs.join(', ')) : ''
    ]),
    '',
    ...section('Campaign Scope', [
      '- Saleable inventory only: locked',
      line('Stock list mode', stockListModeLabel[stockListMode]),
      stockListMode !== 'off' ? line('Stock refs', formatNumber(input.stockRefCount)) : '',
      ...filters
    ]),
    '',
    ...section('Catalog Readiness', [
      line('Status', readinessStatusLabel[readiness?.status || 'unknown']),
      line('Matched vehicles', formatNumber(readiness?.matchedTotal)),
      line('Feed-ready vehicles', formatNumber(readiness?.validatedTotal)),
      line('Blocked vehicles', formatNumber(readiness?.invalidTotal)),
      ...issueGroups.map(group => `- ${group.label}: ${formatNumber(group.count)} (${fixModeLabel[group.fixMode]})`)
    ]),
    '',
    ...section('Feed URL', [
      input.generatedFeedUrl ? input.generatedFeedUrl : '- Not generated yet'
    ]),
    '',
    ...section('Next Steps', [
      '- Confirm scope in the Feed Workbook',
      '- Paste this summary into Slack or the Monday item',
      '- Resolve source-required rows before platform import',
      '- Import the feed URL into Meta or Google once readiness is accepted'
    ])
  ].join('\n').replace(/\n{3,}/g, '\n\n').trim()
}
