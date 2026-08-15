export interface CampaignLinkJob {
  mondayItemId: string
  taskId: string
  clientId: string
  clientName: string
  title: string
  platform: 'Google' | 'Meta'
  campaignType: string
  campaignId: string | null
  budget: number | null
  linkedInXeroFlow?: boolean
}

export interface CampaignSpendCandidate {
  mediaSpendId: string
  clientId: string
  platform: string
  campaignId: string
  campaignName: string
}

export type CampaignLinkResult
  = | {
    status: 'matched'
    mediaSpendId: string
    campaignId: string
    evidence: 'explicit_campaign_id' | 'unique_name_match'
    overlap: string[]
  }
  | {
    status: 'pending' | 'ambiguous'
    reason:
      | 'explicit_campaign_id_not_synced'
      | 'no_compatible_candidate'
      | 'no_distinctive_name_overlap'
      | 'tied_best_match'
  }

const GLOBAL_GENERIC_TOKENS = new Set([
  'ad', 'ads', 'campaign', 'capture', 'convert', 'fixed', 'google', 'meta',
  'rolling', 'set', 'the'
])

const TYPE_GENERIC_TOKENS: Record<string, Set<string>> = {
  G_PMaxInventory: new Set(['inventory', 'max', 'performance', 'pmax', 'pmaxinventory']),
  G_YouTube: new Set(['bumper', 'pre', 'roll', 'sec', 'youtube']),
  G_Display: new Set(['display']),
  M_AIA_Traffic: new Set(['aia', 'traffic']),
  M_Leads: new Set(['gen', 'lead', 'leads']),
  M_Traffic: new Set(['traffic']),
  M_Boosted: new Set(['boosted', 'post'])
}

function tokens(value: string): string[] {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
}

function normalizedPlatform(value: string): 'Google' | 'Meta' | null {
  const normalized = value.trim().toLowerCase()
  if (normalized === 'google' || normalized === 'google_ads') return 'Google'
  if (normalized === 'meta') return 'Meta'
  return null
}

function isCampaignTypeCompatible(campaignType: string, campaignName: string): boolean {
  const nameTokens = new Set(tokens(campaignName))
  const normalized = campaignName.toLowerCase().replace(/[^a-z0-9]+/g, '')
  switch (campaignType) {
    case 'G_PMaxInventory':
      return normalized.includes('pmaxinventory') || (
        nameTokens.has('inventory')
        && (nameTokens.has('pmax') || normalized.includes('performancemax'))
      )
    case 'G_YouTube':
      return nameTokens.has('youtube')
    case 'G_Display':
      return nameTokens.has('display')
    case 'M_AIA_Traffic':
      return nameTokens.has('aia') && nameTokens.has('traffic')
    case 'M_Leads':
      return nameTokens.has('lead') || nameTokens.has('leads')
    case 'M_Traffic':
      return nameTokens.has('traffic') && !nameTokens.has('aia')
    case 'M_Boosted':
      return nameTokens.has('boosted')
    default:
      return false
  }
}

function distinctiveTokens(value: string, job: CampaignLinkJob): Set<string> {
  const ignored = new Set([
    ...GLOBAL_GENERIC_TOKENS,
    ...(TYPE_GENERIC_TOKENS[job.campaignType] || []),
    ...tokens(job.clientName)
  ])
  return new Set(tokens(value).filter(token => !ignored.has(token)))
}

function overlapFor(job: CampaignLinkJob, candidate: CampaignSpendCandidate): string[] {
  const jobTokens = distinctiveTokens(job.title, job)
  const candidateTokens = distinctiveTokens(candidate.campaignName, job)
  return [...jobTokens].filter(token => candidateTokens.has(token)).sort()
}

export function matchMondayCampaignToSpend(
  job: CampaignLinkJob,
  candidates: CampaignSpendCandidate[]
): CampaignLinkResult {
  const sameAuthority = candidates.filter(candidate => (
    candidate.clientId === job.clientId
    && normalizedPlatform(candidate.platform) === job.platform
  ))

  if (job.campaignId) {
    const explicit = sameAuthority.filter(candidate => candidate.campaignId === job.campaignId)
    if (explicit.length === 1) {
      return {
        status: 'matched',
        mediaSpendId: explicit[0]!.mediaSpendId,
        campaignId: explicit[0]!.campaignId,
        evidence: 'explicit_campaign_id',
        overlap: []
      }
    }
    return { status: 'pending', reason: 'explicit_campaign_id_not_synced' }
  }

  const compatible = sameAuthority.filter(candidate => (
    isCampaignTypeCompatible(job.campaignType, candidate.campaignName)
  ))
  if (compatible.length === 0) return { status: 'pending', reason: 'no_compatible_candidate' }

  const ranked = compatible
    .map(candidate => ({ candidate, overlap: overlapFor(job, candidate) }))
    .filter(result => result.overlap.length > 0)
    .sort((left, right) => right.overlap.length - left.overlap.length)

  if (ranked.length === 0) return { status: 'pending', reason: 'no_distinctive_name_overlap' }
  const bestScore = ranked[0]!.overlap.length
  const best = ranked.filter(result => result.overlap.length === bestScore)
  if (best.length !== 1) return { status: 'ambiguous', reason: 'tied_best_match' }

  return {
    status: 'matched',
    mediaSpendId: best[0]!.candidate.mediaSpendId,
    campaignId: best[0]!.candidate.campaignId,
    evidence: 'unique_name_match',
    overlap: best[0]!.overlap
  }
}
