import {
  hashCanonicalLaunchJson,
  serializeCanonicalLaunchJson
} from '~~/server/utils/googlePmaxLaunchHash'

export const GOOGLE_PMAX_EVIDENCE_SOURCES = [
  'brief',
  'feed',
  'merchant',
  'measurement',
  'onboarding',
  'audiences',
  'personas',
  'knowledge',
  'boards',
  'monday',
  'performance',
  'anomalies',
  'tasks'
] as const

export type GooglePmaxEvidenceSource = typeof GOOGLE_PMAX_EVIDENCE_SOURCES[number]
export type GooglePmaxEvidenceAuthority = 'approved' | 'operational' | 'draft' | 'external_readback'
export type GooglePmaxEvidenceStatus = 'available' | 'partial' | 'unavailable'

export interface GooglePmaxEvidenceIdentity {
  tenantId: string
  clientId: string
  briefId: string
  configVersion: number
  configHash: string
}

export interface GooglePmaxEvidenceReference {
  kind: string
  id: string
}

export interface GooglePmaxEvidenceSectionInput {
  source: GooglePmaxEvidenceSource
  tenantId: string
  clientId: string
  authority: GooglePmaxEvidenceAuthority
  status: GooglePmaxEvidenceStatus
  observedAt: string
  freshUntil: string
  references: GooglePmaxEvidenceReference[]
  facts: Record<string, unknown>
}

export interface GooglePmaxEvidenceSection extends GooglePmaxEvidenceSectionInput {
  stale: boolean
  decisionEligible: boolean
}

export interface GooglePmaxEvidenceIssue {
  code: string
  source: GooglePmaxEvidenceSource
  severity: 'blocker' | 'advisory'
  message: string
}

export interface GooglePmaxDecisionEvidence {
  schemaVersion: 1
  identity: GooglePmaxEvidenceIdentity
  collectedAt: string
  sections: GooglePmaxEvidenceSection[]
  issues: GooglePmaxEvidenceIssue[]
  blockerCount: number
  advisoryCount: number
  readyForDeterministicPreflight: boolean
  evidenceHash: string
}

export interface GooglePmaxEvidenceCollectorContext {
  identity: GooglePmaxEvidenceIdentity
  collectedAt: string
}

export type GooglePmaxEvidenceCollectorResult = Omit<
  GooglePmaxEvidenceSectionInput,
  'source' | 'tenantId' | 'clientId'
>

export type GooglePmaxEvidenceCollector = (
  context: GooglePmaxEvidenceCollectorContext
) => Promise<GooglePmaxEvidenceCollectorResult>

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HASH_PATTERN = /^[a-f0-9]{64}$/
const CRITICAL_SOURCES = new Set<GooglePmaxEvidenceSource>([
  'brief',
  'feed',
  'merchant',
  'measurement',
  'onboarding'
])
const SENSITIVE_KEY_PARTS = [
  'token',
  'authorization',
  'password',
  'secret',
  'credential',
  'apikey',
  'privatekey',
  'cookie',
  'bearer'
]

function timestamp(value: string, label: string): number {
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) throw new Error(`${label} must be an ISO timestamp.`)
  return parsed
}

function normalizedKey(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '')
}

function assertNoSensitiveKeys(value: unknown): void {
  if (Array.isArray(value)) {
    value.forEach(assertNoSensitiveKeys)
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, nested] of Object.entries(value)) {
    const normalized = normalizedKey(key)
    if (SENSITIVE_KEY_PARTS.some(part => normalized.includes(part))) {
      throw new Error('Decision evidence contains a prohibited sensitive field.')
    }
    assertNoSensitiveKeys(nested)
  }
}

function sourceCode(source: GooglePmaxEvidenceSource): string {
  return source.toUpperCase().replace(/[^A-Z0-9]+/g, '_')
}

function issue(
  source: GooglePmaxEvidenceSource,
  suffix: 'MISSING' | 'UNAVAILABLE' | 'PARTIAL' | 'STALE',
  severity: GooglePmaxEvidenceIssue['severity']
): GooglePmaxEvidenceIssue {
  const readable = source === 'monday' ? 'Monday' : source.charAt(0).toUpperCase() + source.slice(1)
  return {
    code: `PMAX_EVIDENCE_${sourceCode(source)}_${suffix}`,
    source,
    severity,
    message: `${readable} evidence is ${suffix.toLowerCase()} for this decision snapshot.`
  }
}

function normalizedReferences(references: GooglePmaxEvidenceReference[]): GooglePmaxEvidenceReference[] {
  const seen = new Map<string, GooglePmaxEvidenceReference>()
  for (const reference of references) {
    const kind = String(reference.kind || '').trim()
    const id = String(reference.id || '').trim()
    if (!kind || !id) throw new Error('Decision evidence references require kind and id.')
    seen.set(`${kind}\u0000${id}`, { kind, id })
  }
  return [...seen.values()].sort((left, right) => {
    const leftKey = `${left.kind}\u0000${left.id}`
    const rightKey = `${right.kind}\u0000${right.id}`
    return leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0
  })
}

function validateIdentity(identity: GooglePmaxEvidenceIdentity): GooglePmaxEvidenceIdentity {
  const normalized = {
    ...identity,
    tenantId: identity.tenantId.toLowerCase(),
    clientId: identity.clientId.toLowerCase(),
    briefId: identity.briefId.toLowerCase()
  }
  if (!UUID_PATTERN.test(normalized.tenantId) || !UUID_PATTERN.test(normalized.clientId) || !UUID_PATTERN.test(normalized.briefId)) {
    throw new Error('Decision evidence identity must use UUID tenant, client, and brief IDs.')
  }
  if (!Number.isInteger(normalized.configVersion) || normalized.configVersion <= 0) {
    throw new Error('Decision evidence config version must be a positive integer.')
  }
  if (!HASH_PATTERN.test(normalized.configHash)) {
    throw new Error('Decision evidence config hash must be a canonical SHA-256 hash.')
  }
  return normalized
}

export function buildGooglePmaxDecisionEvidence(input: {
  identity: GooglePmaxEvidenceIdentity
  collectedAt: string
  sections: GooglePmaxEvidenceSectionInput[]
}): GooglePmaxDecisionEvidence {
  const identity = validateIdentity(input.identity)
  const collectedAtMs = timestamp(input.collectedAt, 'collectedAt')
  const bySource = new Map<GooglePmaxEvidenceSource, GooglePmaxEvidenceSection>()

  for (const raw of input.sections) {
    if (!GOOGLE_PMAX_EVIDENCE_SOURCES.includes(raw.source)) {
      throw new Error('Decision evidence contains an unsupported source.')
    }
    if (bySource.has(raw.source)) {
      throw new Error(`Decision evidence source ${raw.source} is duplicated.`)
    }
    if (raw.tenantId.toLowerCase() !== identity.tenantId || raw.clientId.toLowerCase() !== identity.clientId) {
      throw new Error('Decision evidence scope does not match the launch tenant and client.')
    }
    const observedAtMs = timestamp(raw.observedAt, `${raw.source}.observedAt`)
    const freshUntilMs = timestamp(raw.freshUntil, `${raw.source}.freshUntil`)
    if (freshUntilMs < observedAtMs) throw new Error(`${raw.source} evidence freshness precedes observation.`)
    assertNoSensitiveKeys(raw.facts)
    const stale = collectedAtMs > freshUntilMs
    const decisionEligible = raw.status === 'available'
      && !stale
      && raw.authority !== 'draft'
      && (raw.source !== 'knowledge' || raw.authority === 'approved')
    bySource.set(raw.source, {
      ...raw,
      tenantId: identity.tenantId,
      clientId: identity.clientId,
      references: normalizedReferences(raw.references),
      stale,
      decisionEligible
    })
  }

  const sections = [...bySource.values()].sort((left, right) => left.source < right.source ? -1 : left.source > right.source ? 1 : 0)
  const issues: GooglePmaxEvidenceIssue[] = []
  for (const source of GOOGLE_PMAX_EVIDENCE_SOURCES) {
    const section = bySource.get(source)
    const severity = CRITICAL_SOURCES.has(source) ? 'blocker' : 'advisory'
    if (!section) issues.push(issue(source, 'MISSING', severity))
    else if (section.status === 'unavailable') issues.push(issue(source, 'UNAVAILABLE', severity))
    else if (section.status === 'partial') issues.push(issue(source, 'PARTIAL', severity))
    else if (section.stale) issues.push(issue(source, 'STALE', severity))
  }

  const blockerCount = issues.filter(item => item.severity === 'blocker').length
  const advisoryCount = issues.length - blockerCount
  const snapshot = {
    schemaVersion: 1 as const,
    identity,
    collectedAt: new Date(collectedAtMs).toISOString(),
    sections,
    issues,
    blockerCount,
    advisoryCount,
    readyForDeterministicPreflight: blockerCount === 0
  }
  const serialized = serializeCanonicalLaunchJson(snapshot)
  if (new TextEncoder().encode(serialized).byteLength > 262_144) {
    throw new Error('Decision evidence exceeds the 256 KiB snapshot limit.')
  }
  return {
    ...snapshot,
    evidenceHash: hashCanonicalLaunchJson(snapshot)
  }
}

function unavailableAuthority(source: GooglePmaxEvidenceSource): GooglePmaxEvidenceAuthority {
  if (source === 'brief' || source === 'knowledge') return 'approved'
  if (source === 'merchant' || source === 'measurement' || source === 'onboarding') return 'external_readback'
  return 'operational'
}

export async function collectGooglePmaxDecisionEvidence(input: {
  identity: GooglePmaxEvidenceIdentity
  collectors: Partial<Record<GooglePmaxEvidenceSource, GooglePmaxEvidenceCollector>>
  now?: () => Date
}): Promise<GooglePmaxDecisionEvidence> {
  const collectedAt = (input.now || (() => new Date()))().toISOString()
  const context = { identity: input.identity, collectedAt }
  const sections = await Promise.all(GOOGLE_PMAX_EVIDENCE_SOURCES.map(async (source): Promise<GooglePmaxEvidenceSectionInput> => {
    const collector = input.collectors[source]
    if (!collector) {
      return {
        source,
        tenantId: input.identity.tenantId,
        clientId: input.identity.clientId,
        authority: unavailableAuthority(source),
        status: 'unavailable',
        observedAt: collectedAt,
        freshUntil: collectedAt,
        references: [],
        facts: { errorCode: 'COLLECTOR_NOT_CONFIGURED' }
      }
    }
    try {
      const result = await collector(context)
      return {
        source,
        tenantId: input.identity.tenantId,
        clientId: input.identity.clientId,
        ...result
      }
    } catch {
      return {
        source,
        tenantId: input.identity.tenantId,
        clientId: input.identity.clientId,
        authority: unavailableAuthority(source),
        status: 'unavailable',
        observedAt: collectedAt,
        freshUntil: collectedAt,
        references: [],
        facts: { errorCode: 'SOURCE_READ_FAILED' }
      }
    }
  }))

  return buildGooglePmaxDecisionEvidence({
    identity: input.identity,
    collectedAt,
    sections
  })
}
