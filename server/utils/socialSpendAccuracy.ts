type ClientCandidate = {
  id: string
  name: string | null
}

type MatchResult = {
  clientId: string
  clientName: string
  confidence: 'exact' | 'contains'
  reason: string
}

function tokenCount(value: string) {
  return value ? value.split(/\s+/).filter(Boolean).length : 0
}

const BUSINESS_NOISE_WORDS = new Set([
  'pty',
  'ltd',
  'limited',
  'group',
  'motors',
  'motor',
  'auto',
  'automotive',
  'gwm',
  'haval',
  'kia',
  'nissan',
  'hyundai',
  'renault',
  'suzuki',
  'chery',
  'ldv',
  'mahindra',
  'isuzu',
  'ford',
  'mazda',
  'toyota',
  'honda',
  'demo',
  'new',
])

const STRICT_NOISE_WORDS = new Set([
  'pty',
  'ltd',
  'limited',
])

function normalizeStrictName(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(part => !STRICT_NOISE_WORDS.has(part))
    .join(' ')
    .trim()
}

export function normalizeSpendMatchName(value: string | null | undefined): string {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter(part => !BUSINESS_NOISE_WORDS.has(part))
    .join(' ')
    .trim()
}

export function findHighConfidenceClientMatch(
  accountName: string | null | undefined,
  clients: ClientCandidate[],
): MatchResult | null {
  const accountKey = normalizeSpendMatchName(accountName)
  const strictAccountKey = normalizeStrictName(accountName)
  if (!accountKey || !strictAccountKey) return null

  const candidates = clients
    .map(client => ({
      client,
      key: normalizeSpendMatchName(client.name),
      strictKey: normalizeStrictName(client.name),
    }))
    .filter(item => item.client.id && item.client.name && item.key && item.strictKey)

  const strictExactMatches = candidates.filter(item => item.strictKey === strictAccountKey)
  if (strictExactMatches.length === 1) {
    const exact = strictExactMatches[0]
    return {
      clientId: exact.client.id,
      clientName: exact.client.name!,
      confidence: 'exact',
      reason: 'Normalized account name exactly matches client name',
    }
  }
  if (strictExactMatches.length > 1) return null

  const exactMatches = candidates.filter(item => item.key === accountKey)
  if (exactMatches.length === 1 && tokenCount(accountKey) >= 2) {
    const exact = exactMatches[0]
    return {
      clientId: exact.client.id,
      clientName: exact.client.name!,
      confidence: 'exact',
      reason: 'Normalized account name exactly matches client name',
    }
  }
  if (exactMatches.length > 1) return null

  const contains = candidates.filter(item =>
    tokenCount(item.key) >= 2
    && tokenCount(accountKey) >= 2
    && (accountKey.includes(item.key) || item.key.includes(accountKey))
  )
  if (contains.length === 1) {
    return {
      clientId: contains[0].client.id,
      clientName: contains[0].client.name!,
      confidence: 'contains',
      reason: 'Normalized account name has one unambiguous client-name containment match',
    }
  }

  return null
}

export function labelSpendSummaryGroup(input: {
  clientName: string | null
  accountName: string | null
  campaignName: string | null
  platform: string | null
}): string {
  if (input.clientName) return input.clientName
  if (input.accountName) return `Unmapped: ${input.accountName}`
  if (input.platform) return `Unmapped: ${input.platform}`
  return 'Unmapped'
}
