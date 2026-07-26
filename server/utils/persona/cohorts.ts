import { queryOne, queryRows } from '~~/server/utils/db'
import { isPersonaIdentityEnabled } from '~~/server/utils/persona/feature'

export interface PersonaDefinition {
  id: string
  persona_key: string
  version: number
  label: string
  description: string
  positive_signals: string[]
  negative_signals: string[]
  min_confidence: number | string
  allowed_channels: string[]
  targeting_allowed: boolean
  reporting_allowed: boolean
  tier_rank: number | null
  is_exclusion: boolean
}

interface SubjectSignals {
  subject_hash: string
  profile_id: string | null
  signal_keys: string[]
  marketing_consent: 'granted' | 'denied' | 'unknown'
  event_count: number
  last_signal_at: string
}

export interface CohortFilters {
  startDate: string
  endDate: string
  platform: string | null
}

export interface PersonaScore {
  confidence: number
  qualifies: boolean
  matchedPositive: string[]
  matchedNegative: string[]
}

export function scorePersonaDefinition(
  definition: Pick<PersonaDefinition, 'positive_signals' | 'negative_signals' | 'min_confidence'>,
  signalKeys: string[]
): PersonaScore {
  const keys = new Set(signalKeys)
  const positive = [...new Set(definition.positive_signals)].filter(key => keys.has(key))
  const negative = [...new Set(definition.negative_signals)].filter(key => keys.has(key))
  const denominator = Math.max(new Set(definition.positive_signals).size, 1)
  const confidence = Number((positive.length / denominator).toFixed(4))
  return {
    confidence,
    qualifies: positive.length > 0
      && negative.length === 0
      && confidence >= Number(definition.min_confidence),
    matchedPositive: positive,
    matchedNegative: negative
  }
}

export function resolveHighestTier(
  tierDefinitions: Array<Pick<PersonaDefinition, 'persona_key' | 'positive_signals' | 'negative_signals' | 'min_confidence' | 'tier_rank'>>,
  signalKeys: string[]
): { personaKey: string, matchedSignals: string[] } | null {
  const ranked = [...tierDefinitions].sort((a, b) => Number(a.tier_rank) - Number(b.tier_rank))
  for (const definition of ranked) {
    const score = scorePersonaDefinition(definition, signalKeys)
    if (score.qualifies) {
      return { personaKey: definition.persona_key, matchedSignals: score.matchedPositive }
    }
  }
  return null
}

export function resolveIsExcluded(
  exclusionDefinitions: Array<Pick<PersonaDefinition, 'positive_signals' | 'negative_signals' | 'min_confidence'>>,
  signalKeys: string[]
): { excluded: boolean, matchedSignals: string[] } {
  const matched = new Set<string>()
  for (const definition of exclusionDefinitions) {
    const score = scorePersonaDefinition(definition, signalKeys)
    if (score.qualifies) score.matchedPositive.forEach(key => matched.add(key))
  }
  return { excluded: matched.size > 0, matchedSignals: [...matched] }
}

function isoDate(value: string | undefined, fallback: Date): string {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))) {
    return fallback.toISOString().slice(0, 10)
  }
  return value
}

export function normalizeCohortFilters(input: {
  startDate?: string
  endDate?: string
  platform?: string | null
}, now = new Date()): CohortFilters {
  const end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const start = new Date(end)
  start.setUTCDate(start.getUTCDate() - 29)
  const startDate = isoDate(input.startDate, start)
  const endDate = isoDate(input.endDate, end)
  if (startDate > endDate) throw new Error('startDate must not be after endDate')
  const platform = input.platform?.trim().toLowerCase().slice(0, 64) || null
  return { startDate, endDate, platform }
}

async function scopeHash(clientId: string, filters: CohortFilters): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(JSON.stringify({ clientId, ...filters, version: 1 }))
  )
  return [...new Uint8Array(digest)]
    .map(byte => byte.toString(16).padStart(2, '0'))
    .join('')
}

function minAudienceSize(): number {
  const configured = Number(process.env.PERSONA_MIN_AUDIENCE_SIZE)
  return Number.isInteger(configured) && configured >= 100
    ? configured
    : 1000
}

async function activeDefinitions(clientId: string): Promise<PersonaDefinition[]> {
  return queryRows<PersonaDefinition>(
    `SELECT DISTINCT ON (persona_key)
            id, persona_key, version, label, description,
            positive_signals, negative_signals, min_confidence,
            allowed_channels, targeting_allowed, reporting_allowed, tier_rank,
            is_exclusion
       FROM crm_persona_definitions
      WHERE status = 'active'
        AND vertical IN ('universal', 'automotive')
        AND tier_rank IS NULL
        AND is_exclusion = FALSE
        AND (client_id IS NULL OR client_id = $1)
      ORDER BY persona_key, (client_id IS NOT NULL) DESC, version DESC`,
    [clientId]
  )
}

export async function activeTierDefinitions(clientId: string): Promise<PersonaDefinition[]> {
  return queryRows<PersonaDefinition>(
    `SELECT DISTINCT ON (persona_key)
            id, persona_key, version, label, description,
            positive_signals, negative_signals, min_confidence,
            allowed_channels, targeting_allowed, reporting_allowed, tier_rank,
            is_exclusion
       FROM crm_persona_definitions
      WHERE status = 'active'
        AND vertical IN ('universal', 'automotive')
        AND tier_rank IS NOT NULL
        AND (client_id IS NULL OR client_id = $1)
      ORDER BY persona_key, (client_id IS NOT NULL) DESC, version DESC`,
    [clientId]
  )
}

export async function activeExclusionDefinitions(clientId: string): Promise<PersonaDefinition[]> {
  return queryRows<PersonaDefinition>(
    `SELECT DISTINCT ON (persona_key)
            id, persona_key, version, label, description,
            positive_signals, negative_signals, min_confidence,
            allowed_channels, targeting_allowed, reporting_allowed, tier_rank,
            is_exclusion
       FROM crm_persona_definitions
      WHERE status = 'active'
        AND vertical IN ('universal', 'automotive')
        AND is_exclusion = TRUE
        AND (client_id IS NULL OR client_id = $1)
      ORDER BY persona_key, (client_id IS NOT NULL) DESC, version DESC`,
    [clientId]
  )
}

async function subjectSignals(
  clientId: string,
  filters: CohortFilters
): Promise<{ rows: SubjectSignals[], capped: boolean }> {
  const rows = await queryRows<SubjectSignals>(
    `SELECT signal.subject_hash,
            (ARRAY_AGG(signal.profile_id ORDER BY signal.occurred_at DESC)
              FILTER (WHERE signal.profile_id IS NOT NULL))[1] AS profile_id,
            ARRAY_AGG(DISTINCT signal.signal_key) AS signal_keys,
            COALESCE(
              (ARRAY_AGG(signal.consent_marketing ORDER BY signal.occurred_at DESC)
                FILTER (WHERE signal.consent_marketing <> 'unknown'))[1],
              'unknown'
            ) AS marketing_consent,
            COUNT(*)::int AS event_count,
            MAX(signal.occurred_at)::text AS last_signal_at
       FROM crm_customer_signals signal
      WHERE signal.client_id = $1
        AND signal.occurred_at >= $2::date
        AND signal.occurred_at < ($3::date + INTERVAL '1 day')
        AND ($4::text IS NULL OR signal.context->>'platform' = $4)
      GROUP BY signal.subject_hash
      ORDER BY MAX(signal.occurred_at) DESC
      LIMIT 50001`,
    [clientId, filters.startDate, filters.endDate, filters.platform]
  )
  return { rows: rows.slice(0, 50000), capped: rows.length > 50000 }
}

export async function getAudienceCohortPreview(
  clientId: string,
  filtersInput: Partial<CohortFilters>
) {
  if (!await isPersonaIdentityEnabled(clientId)) {
    return {
      enabled: false,
      generatedAt: new Date().toISOString(),
      minAudienceSize: minAudienceSize(),
      filters: normalizeCohortFilters(filtersInput),
      cohorts: []
    }
  }
  const filters = normalizeCohortFilters(filtersInput)
  const hash = await scopeHash(clientId, filters)
  const cached = await queryOne<{ payload: Record<string, unknown> }>(
    `SELECT payload
       FROM crm_audience_cohort_snapshots
      WHERE client_id = $1
        AND scope_hash = $2
        AND expires_at > NOW()`,
    [clientId, hash]
  )
  if (cached?.payload) return cached.payload

  const [definitions, subjects] = await Promise.all([
    activeDefinitions(clientId),
    subjectSignals(clientId, filters)
  ])
  const minimum = minAudienceSize()
  const cohorts = definitions
    .filter(definition => definition.reporting_allowed)
    .map(definition => {
      const matches = subjects.rows.flatMap(subject => {
        const score = scorePersonaDefinition(definition, subject.signal_keys)
        return score.qualifies ? [{ subject, score }] : []
      })
      const eligible = matches.filter(match => (
        definition.targeting_allowed
        && match.subject.marketing_consent === 'granted'
      ))
      const blockedReason = subjects.capped
        ? 'Analysis limit reached; narrow the date or platform filter.'
        : !definition.targeting_allowed
          ? 'This persona is reporting-only.'
          : eligible.length < minimum
            ? `At least ${minimum.toLocaleString()} consented profiles are required.`
            : null
      const evidenceCounts = new Map<string, number>()
      for (const match of matches) {
        for (const key of match.score.matchedPositive) {
          evidenceCounts.set(key, (evidenceCounts.get(key) ?? 0) + 1)
        }
      }
      return {
        key: definition.persona_key,
        version: definition.version,
        label: definition.label,
        description: definition.description,
        allowedChannels: definition.allowed_channels,
        estimatedSize: matches.length,
        eligibleSize: eligible.length,
        suppressedSize: matches.length - eligible.length,
        knownProfileSize: matches.filter(match => Boolean(match.subject.profile_id)).length,
        targetingAllowed: definition.targeting_allowed,
        status: blockedReason ? 'blocked' : 'preview_ready',
        blockedReason,
        topEvidence: [...evidenceCounts.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([key, count]) => ({ key, count }))
      }
    })
  const payload = {
    enabled: true,
    generatedAt: new Date().toISOString(),
    minAudienceSize: minimum,
    filters,
    analysisCapped: subjects.capped,
    subjectCount: subjects.rows.length,
    cohorts
  }
  await queryOne(
    `INSERT INTO crm_audience_cohort_snapshots (
       client_id, scope_hash, filters, payload, generated_at, expires_at
     ) VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW(), NOW() + INTERVAL '15 minutes')
     ON CONFLICT (client_id, scope_hash) DO UPDATE
       SET filters = EXCLUDED.filters,
           payload = EXCLUDED.payload,
           generated_at = EXCLUDED.generated_at,
           expires_at = EXCLUDED.expires_at,
           updated_at = NOW()
     RETURNING id`,
    [clientId, hash, JSON.stringify(filters), JSON.stringify(payload)]
  )
  return payload
}
