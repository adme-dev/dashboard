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

function unavailableAuthority(source: GooglePmaxEvidenceSource): GooglePmaxEvidenceAuthority {
  if (source === 'brief' || source === 'knowledge') return 'approved'
  if (source === 'merchant' || source === 'measurement' || source === 'onboarding') return 'external_readback'
  return 'operational'
}

export async function collectGooglePmaxDecisionEvidence(input: {
  identity: GooglePmaxEvidenceIdentity
  collectors: Partial<Record<GooglePmaxEvidenceSource, GooglePmaxEvidenceCollector>>
  build: (input: {
    identity: GooglePmaxEvidenceIdentity
    collectedAt: string
    sections: GooglePmaxEvidenceSectionInput[]
  }) => Promise<GooglePmaxDecisionEvidence>
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

  return input.build({
    identity: input.identity,
    collectedAt,
    sections
  })
}
