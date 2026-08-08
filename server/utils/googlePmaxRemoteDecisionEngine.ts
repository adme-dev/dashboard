import type { H3Event } from 'h3'
import type {
  GooglePmaxInventoryLaunchConfig,
  GooglePmaxLaunchNormalizationInput,
  GooglePmaxLaunchNormalizationResult
} from '~~/server/utils/googlePmaxLaunchConfig'
import { hashCanonicalLaunchJson } from '~~/server/utils/googlePmaxLaunchHash'
import type {
  GooglePmaxOnboardingEvidence,
  GooglePmaxOnboardingResult
} from '~~/server/utils/googlePmaxOnboarding'
import type { GooglePmaxOnboardingAttestation } from '~~/server/utils/googlePmaxOnboardingAttestation'
import type {
  GooglePmaxPreflightEvidence,
  GooglePmaxPreflightResult
} from '~~/server/utils/googlePmaxPreflight'
import type { GooglePmaxProviderConnection } from '~~/server/utils/googlePmaxProviderReadback'
import type { GooglePmaxAiAdvisoryResult } from '~~/server/utils/googlePmaxAiAdvisor'
import type {
  GooglePmaxDecisionEvidence,
  GooglePmaxEvidenceCollectorResult,
  GooglePmaxEvidenceIdentity,
  GooglePmaxEvidenceSectionInput
} from '~~/server/utils/googlePmaxDecisionEvidence'
import type { GooglePmaxPlatformEvidenceSource } from '~~/server/utils/googlePmaxPlatformEvidenceCollectors'
import type {
  GooglePmaxBoundInventoryConfig,
  GooglePmaxEvidenceDealerLink
} from '~~/server/utils/googlePmaxInternalFeedEvidence'
import type { FeedDetail, FeedPreviewResult, FeedSummary } from '~~/server/utils/feeds/types'

interface ServiceBinding {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

export class GooglePmaxRemoteDecisionError extends Error {
  constructor(public readonly code:
    | 'PMAX_DECISION_SERVICE_UNAVAILABLE'
    | 'PMAX_DECISION_SERVICE_RESPONSE_INVALID'
    | 'PMAX_PREPARATION_GEO_AMBIGUOUS'
    | 'PMAX_PREPARATION_PROVIDER_RESPONSE_INVALID'
    | 'PMAX_ONBOARDING_ATTESTATION_INVALID'
    | 'PMAX_ONBOARDING_ATTESTATION_IDENTITY_MISMATCH') {
    super('The private Google PMax decision engine failed closed.')
    this.name = 'GooglePmaxRemoteDecisionError'
  }
}

function serviceBinding(event: H3Event): ServiceBinding | null {
  const value = (event.context as {
    cloudflare?: { env?: Record<string, unknown> }
  }).cloudflare?.env?.GOOGLE_PMAX_PROVIDER
  return value && typeof value === 'object' && typeof (value as ServiceBinding).fetch === 'function'
    ? value as ServiceBinding
    : null
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

export function createGooglePmaxRemoteDecisionEngine(
  event: H3Event,
  bindingOverride?: ServiceBinding
) {
  const binding = bindingOverride || serviceBinding(event)

  async function call(
    action: 'normalize' | 'parse_config' | 'preflight' | 'onboarding' | 'provider_evidence' | 'provider_sections' | 'prepare_provider' | 'decision_evidence' | 'platform_evidence' | 'internal_feed_evidence' | 'persist_evidence' | 'sync_tasks' | 'attestation_prepare' | 'attestation_parse' | 'advise',
    input: unknown
  ): Promise<unknown> {
    if (!binding) throw new GooglePmaxRemoteDecisionError('PMAX_DECISION_SERVICE_UNAVAILABLE')
    let response: Response
    try {
      response = await binding.fetch('https://google-pmax-provider.internal/v1/decision', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-xeroflow-service': 'google-pmax-provider-v1'
        },
        body: JSON.stringify({ action, input })
      })
    } catch {
      throw new GooglePmaxRemoteDecisionError('PMAX_DECISION_SERVICE_UNAVAILABLE')
    }
    if (!response.ok) throw new GooglePmaxRemoteDecisionError('PMAX_DECISION_SERVICE_UNAVAILABLE')
    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new GooglePmaxRemoteDecisionError('PMAX_DECISION_SERVICE_RESPONSE_INVALID')
    }
    const envelope = record(body)
    if (!envelope || envelope.ok !== true || !('result' in envelope)) {
      throw new GooglePmaxRemoteDecisionError('PMAX_DECISION_SERVICE_RESPONSE_INVALID')
    }
    return envelope.result
  }

  return {
    async providerSections(input: {
      config: GooglePmaxInventoryLaunchConfig
      launch: { updatedAt: string }
      providerEvidence: GooglePmaxPreflightEvidence
      attestation: GooglePmaxOnboardingAttestation | null
      collectedAt: string
    }): Promise<{
      sections: Record<'feed' | 'merchant' | 'measurement' | 'onboarding', GooglePmaxEvidenceCollectorResult>
      onboarding: GooglePmaxOnboardingResult
    }> {
      const result = record(await call('provider_sections', input))
      const sections = record(result?.sections)
      const onboarding = record(result?.onboarding)
      if (!result || !sections || !onboarding || typeof onboarding.ready !== 'boolean') {
        throw new GooglePmaxRemoteDecisionError('PMAX_DECISION_SERVICE_RESPONSE_INVALID')
      }
      for (const source of ['feed', 'merchant', 'measurement', 'onboarding']) {
        const section = record(sections[source])
        if (!section || typeof section.status !== 'string' || !record(section.facts)) {
          throw new GooglePmaxRemoteDecisionError('PMAX_DECISION_SERVICE_RESPONSE_INVALID')
        }
      }
      return result as never
    },

    async internalFeedEvidence(input: {
      config: GooglePmaxBoundInventoryConfig
      link: GooglePmaxEvidenceDealerLink | null
      feeds: FeedSummary[]
      detail: FeedDetail | null
      preview: FeedPreviewResult | null
      fetchedAt: string
    }): Promise<GooglePmaxPreflightEvidence['internalFeed']> {
      const result = record(await call('internal_feed_evidence', input))
      if (
        !result
        || typeof result.linkId !== 'string'
        || typeof result.feedId !== 'string'
        || !['google', 'facebook'].includes(String(result.platform))
        || !Array.isArray(result.conditions)
        || typeof result.fetchedAt !== 'string'
      ) throw new GooglePmaxRemoteDecisionError('PMAX_DECISION_SERVICE_RESPONSE_INVALID')
      return result as never
    },

    async persistEvidence(input: {
      launchId: string
      tenantId: string
      actorId: string
      evidence: GooglePmaxDecisionEvidence
    }): Promise<{ id: string, evidenceHash: string, collectedAt: string, isReplay: boolean }> {
      const result = record(await call('persist_evidence', input))
      if (
        !result
        || typeof result.id !== 'string'
        || typeof result.evidenceHash !== 'string'
        || typeof result.collectedAt !== 'string'
        || typeof result.isReplay !== 'boolean'
      ) throw new GooglePmaxRemoteDecisionError('PMAX_DECISION_SERVICE_RESPONSE_INVALID')
      return result as never
    },

    async syncTasks(input: {
      launchId: string
      tenantId: string
      actorId: string
      preflightChecks: GooglePmaxPreflightResult['checks']
      onboardingTasks: GooglePmaxOnboardingResult['tasks']
    }): Promise<{
      status: 'synced' | 'project_required'
      created: number
      reopened: number
      cleared: number
      taskCount: number
    }> {
      const result = record(await call('sync_tasks', input))
      if (
        !result
        || !['synced', 'project_required'].includes(String(result.status))
        || !Number.isInteger(result.created)
        || !Number.isInteger(result.reopened)
        || !Number.isInteger(result.cleared)
        || !Number.isInteger(result.taskCount)
      ) throw new GooglePmaxRemoteDecisionError('PMAX_DECISION_SERVICE_RESPONSE_INVALID')
      return result as never
    },

    async platformEvidence(input: {
      identity: GooglePmaxEvidenceIdentity
      collectedAt: string
    }): Promise<Partial<Record<GooglePmaxPlatformEvidenceSource, GooglePmaxEvidenceCollectorResult | null>>> {
      const result = record(await call('platform_evidence', input))
      if (!result) throw new GooglePmaxRemoteDecisionError('PMAX_DECISION_SERVICE_RESPONSE_INVALID')
      for (const value of Object.values(result)) {
        if (value === null) continue
        const item = record(value)
        if (
          !item
          || typeof item.authority !== 'string'
          || typeof item.status !== 'string'
          || typeof item.observedAt !== 'string'
          || typeof item.freshUntil !== 'string'
          || !Array.isArray(item.references)
          || !record(item.facts)
        ) throw new GooglePmaxRemoteDecisionError('PMAX_DECISION_SERVICE_RESPONSE_INVALID')
      }
      return result as never
    },

    async prepareAttestation(input: {
      launchId: string
      configVersion: number
      configHash: string
      config: GooglePmaxInventoryLaunchConfig
      evidence: unknown
    }): Promise<{ evidence: GooglePmaxOnboardingEvidence, snapshotHash: string, serializedSnapshot: string }> {
      const result = record(await call('attestation_prepare', input))
      if (result?.errorCode === 'PMAX_ONBOARDING_ATTESTATION_INVALID') {
        throw new GooglePmaxRemoteDecisionError('PMAX_ONBOARDING_ATTESTATION_INVALID')
      }
      if (result?.errorCode === 'PMAX_ONBOARDING_ATTESTATION_IDENTITY_MISMATCH') {
        throw new GooglePmaxRemoteDecisionError('PMAX_ONBOARDING_ATTESTATION_IDENTITY_MISMATCH')
      }
      if (
        !result
        || !record(result.evidence)
        || typeof result.snapshotHash !== 'string'
        || !/^[a-f0-9]{64}$/.test(result.snapshotHash)
        || typeof result.serializedSnapshot !== 'string'
      ) throw new GooglePmaxRemoteDecisionError('PMAX_DECISION_SERVICE_RESPONSE_INVALID')
      return result as never
    },

    async parseAttestation(row: Record<string, unknown>, now: string): Promise<GooglePmaxOnboardingAttestation> {
      const result = record(await call('attestation_parse', { row, now }))
      if (
        !result
        || typeof result.id !== 'string'
        || typeof result.snapshotHash !== 'string'
        || !record(result.evidence)
        || typeof result.active !== 'boolean'
      ) throw new GooglePmaxRemoteDecisionError('PMAX_DECISION_SERVICE_RESPONSE_INVALID')
      return result as unknown as GooglePmaxOnboardingAttestation
    },

    async buildDecisionEvidence(input: {
      identity: GooglePmaxEvidenceIdentity
      collectedAt: string
      sections: GooglePmaxEvidenceSectionInput[]
    }): Promise<GooglePmaxDecisionEvidence> {
      const result = record(await call('decision_evidence', input))
      if (
        !result
        || result.schemaVersion !== 1
        || !record(result.identity)
        || !Array.isArray(result.sections)
        || !Array.isArray(result.issues)
        || typeof result.evidenceHash !== 'string'
        || !/^[a-f0-9]{64}$/.test(result.evidenceHash)
      ) throw new GooglePmaxRemoteDecisionError('PMAX_DECISION_SERVICE_RESPONSE_INVALID')
      return result as unknown as GooglePmaxDecisionEvidence
    },

    async advise(input: {
      evidence: GooglePmaxDecisionEvidence
      preflight: GooglePmaxPreflightResult
      gatewayUrl: string
      gatewayAuthToken?: string
      groqApiKey: string
    }): Promise<GooglePmaxAiAdvisoryResult> {
      const result = record(await call('advise', input))
      if (!result || !['available', 'unavailable'].includes(String(result.status))) {
        throw new GooglePmaxRemoteDecisionError('PMAX_DECISION_SERVICE_RESPONSE_INVALID')
      }
      return result as unknown as GooglePmaxAiAdvisoryResult
    },

    async parseConfig(value: Record<string, unknown>): Promise<GooglePmaxInventoryLaunchConfig> {
      const result = record(await call('parse_config', value))
      if (!result || hashCanonicalLaunchJson(result) !== hashCanonicalLaunchJson(value)) {
        throw new GooglePmaxRemoteDecisionError('PMAX_DECISION_SERVICE_RESPONSE_INVALID')
      }
      return result as unknown as GooglePmaxInventoryLaunchConfig
    },

    async providerEvidence(input: {
      config: GooglePmaxInventoryLaunchConfig
      connection: GooglePmaxProviderConnection
      internalFeed: GooglePmaxPreflightEvidence['internalFeed']
    }): Promise<GooglePmaxPreflightEvidence> {
      const result = record(await call('provider_evidence', input))
      if (
        !result
        || !record(result.connection)
        || !record(result.merchant)
        || !record(result.internalFeed)
        || !Array.isArray(result.conversions)
        || !record(result.assets)
        || !record(result.destinations)
      ) throw new GooglePmaxRemoteDecisionError('PMAX_DECISION_SERVICE_RESPONSE_INVALID')
      return result as unknown as GooglePmaxPreflightEvidence
    },

    async prepareProvider(input: {
      connection: GooglePmaxProviderConnection
      selectedConversionActionIds: string[]
      requestedLocations: string[]
    }): Promise<{
      account: { id: string, currencyCode: string, timeZone: string }
      conversionGoals: Array<{
        conversionActionId: string
        resourceName: string
        category: string
        origin: string
      }>
      locations: Array<{ criterionId: string, displayName: string, sourceText: string }>
    }> {
      const result = record(await call('prepare_provider', input))
      if (result?.errorCode === 'PMAX_PREPARATION_GEO_AMBIGUOUS') {
        throw new GooglePmaxRemoteDecisionError('PMAX_PREPARATION_GEO_AMBIGUOUS')
      }
      if (result?.errorCode === 'PMAX_PREPARATION_PROVIDER_RESPONSE_INVALID') {
        throw new GooglePmaxRemoteDecisionError('PMAX_PREPARATION_PROVIDER_RESPONSE_INVALID')
      }
      if (!result || !record(result.account) || !Array.isArray(result.conversionGoals) || !Array.isArray(result.locations)) {
        throw new GooglePmaxRemoteDecisionError('PMAX_DECISION_SERVICE_RESPONSE_INVALID')
      }
      return result as never
    },

    async normalize(input: GooglePmaxLaunchNormalizationInput): Promise<GooglePmaxLaunchNormalizationResult> {
      const result = record(await call('normalize', input))
      if (!result || typeof result.ok !== 'boolean') {
        throw new GooglePmaxRemoteDecisionError('PMAX_DECISION_SERVICE_RESPONSE_INVALID')
      }
      if (result.ok === false) {
        if (!Array.isArray(result.issues) || result.issues.some(issue => !record(issue))) {
          throw new GooglePmaxRemoteDecisionError('PMAX_DECISION_SERVICE_RESPONSE_INVALID')
        }
        return result as unknown as GooglePmaxLaunchNormalizationResult
      }
      const value = record(result.value)
      const config = record(value?.config)
      if (
        !value
        || !config
        || typeof value.configHash !== 'string'
        || !/^[a-f0-9]{64}$/.test(value.configHash)
        || hashCanonicalLaunchJson(config) !== value.configHash
      ) throw new GooglePmaxRemoteDecisionError('PMAX_DECISION_SERVICE_RESPONSE_INVALID')
      return result as unknown as GooglePmaxLaunchNormalizationResult
    },

    async preflight(
      config: GooglePmaxInventoryLaunchConfig,
      evidence: GooglePmaxPreflightEvidence
    ): Promise<GooglePmaxPreflightResult> {
      const result = record(await call('preflight', { config, evidence }))
      if (
        !result
        || typeof result.ready !== 'boolean'
        || !Number.isInteger(result.blockerCount)
        || !Number.isInteger(result.warningCount)
        || typeof result.checkedAt !== 'string'
        || !Array.isArray(result.checks)
      ) throw new GooglePmaxRemoteDecisionError('PMAX_DECISION_SERVICE_RESPONSE_INVALID')
      return result as unknown as GooglePmaxPreflightResult
    },

    async onboarding(evidence: GooglePmaxOnboardingEvidence): Promise<GooglePmaxOnboardingResult> {
      const result = record(await call('onboarding', evidence))
      if (
        !result
        || typeof result.ready !== 'boolean'
        || !record(result.identities)
        || !record(result.shopIdentity)
        || !record(result.apiCapabilities)
        || !Array.isArray(result.checks)
        || !Array.isArray(result.tasks)
      ) throw new GooglePmaxRemoteDecisionError('PMAX_DECISION_SERVICE_RESPONSE_INVALID')
      return result as unknown as GooglePmaxOnboardingResult
    }
  }
}
