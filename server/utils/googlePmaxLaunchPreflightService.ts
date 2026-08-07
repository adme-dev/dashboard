import type { H3Event } from 'h3'
import {
  createGooglePmaxAiAdvisor,
  createGooglePmaxGatewayCompleter,
  type GooglePmaxAiAdvisoryResult
} from '~~/server/utils/googlePmaxAiAdvisor'
import {
  collectGooglePmaxDecisionEvidence,
  type GooglePmaxEvidenceCollector,
  type GooglePmaxEvidenceCollectorResult
} from '~~/server/utils/googlePmaxDecisionEvidence'
import { getSocialDashboardClient, isDealerFeedsEnabled } from '~~/server/utils/feeds/config'
import { listDealerLinks } from '~~/server/utils/feeds/dealerLinkStore'
import { linkToContext } from '~~/server/utils/feeds/dealerLinks'
import { getFeedProvider } from '~~/server/utils/feeds/registry'
import { mergedRuntimeEnv } from '~~/server/utils/feeds/serverContext'
import type { DealerLink, FeedProvider } from '~~/server/utils/feeds/types'
import {
  createGooglePmaxInternalFeedEvidenceReader,
  resolveGoogleFeedConditionsFromProviderEvidence
} from '~~/server/utils/googlePmaxInternalFeedEvidence'
import type { GooglePmaxInventoryLaunchConfig } from '~~/server/utils/googlePmaxLaunchConfig'
import { parseGooglePmaxInventoryLaunchConfig } from '~~/server/utils/googlePmaxLaunchConfigRuntime'
import { createGooglePmaxLaunchOrchestrator } from '~~/server/utils/googlePmaxLaunchOrchestrator'
import type { GooglePmaxLaunch } from '~~/server/utils/googlePmaxLaunchStore'
import {
  getLatestGooglePmaxOnboardingAttestation,
  type GooglePmaxOnboardingAttestation
} from '~~/server/utils/googlePmaxOnboardingAttestation'
import {
  evaluateGooglePmaxOnboarding,
  type GooglePmaxOnboardingResult
} from '~~/server/utils/googlePmaxOnboarding'
import { createGooglePmaxPlatformEvidenceCollectors } from '~~/server/utils/googlePmaxPlatformEvidenceCollectors'
import { createGooglePmaxPreflight, type GooglePmaxPreflightEvidence } from '~~/server/utils/googlePmaxPreflight'
import { loadGooglePmaxProviderConnection } from '~~/server/utils/googlePmaxProviderConnection'
import { createGooglePmaxProviderEvidenceReader } from '~~/server/utils/googlePmaxProviderReadback'
import { resolveGoogleAdsRuntimeConfig } from '~~/server/utils/spendSync'

type RuntimeEnv = Record<string, string | undefined>

const HOUR = 60 * 60 * 1000

function freshUntil(observedAt: string, ttlMs = HOUR): string {
  return new Date(new Date(observedAt).getTime() + ttlMs).toISOString()
}

function evidenceResult(input: {
  observedAt: string
  references: Array<{ kind: string, id: string }>
  facts: Record<string, unknown>
}): GooglePmaxEvidenceCollectorResult {
  return {
    authority: 'external_readback',
    status: 'available',
    observedAt: input.observedAt,
    freshUntil: freshUntil(input.observedAt),
    references: input.references,
    facts: input.facts
  }
}

function missingOnboarding(config: GooglePmaxInventoryLaunchConfig): GooglePmaxOnboardingResult {
  return {
    ready: false,
    identities: {
      googleAdsCustomerId: config.customerId,
      merchantCenterAccountId: config.merchantCenterId,
      businessProfileAccountId: null,
      businessProfileLocationId: null,
      dealershipLocationSource: 'business_profile',
      storeDataSourceId: null,
      storeCode: null
    },
    shopIdentity: {
      kind: 'business_profile_location_and_store_code',
      locationResourceName: null,
      storeCode: null
    },
    apiCapabilities: {
      readGoogleAds: false,
      createGoogleAdsClient: false,
      directLinkAdsMerchant: false,
      readMerchant: false,
      createMerchantAccount: false,
      linkMerchantBusinessProfile: false,
      discoverBusinessProfileLocation: false,
      createBusinessProfileLocation: false
    },
    checks: [{
      code: 'PMAX_ONBOARDING_ATTESTATION_MISSING',
      status: 'fail',
      message: 'A current, config-bound onboarding attestation is required.'
    }],
    tasks: [{
      key: 'attest-google-onboarding',
      title: 'Verify and attest Google Ads, Merchant Center, Business Profile, store code, billing, and Vehicle Ads reviews',
      execution: 'human',
      owner: 'google_admin'
    }]
  }
}

function unavailableAdvisor(): { advise: () => Promise<GooglePmaxAiAdvisoryResult> } {
  return {
    advise: async () => ({ status: 'unavailable', reason: 'GATEWAY_UNAVAILABLE' })
  }
}

function createAdvisor(runtimeEnv: RuntimeEnv) {
  try {
    return createGooglePmaxAiAdvisor({
      complete: createGooglePmaxGatewayCompleter({
        gatewayUrl: runtimeEnv.AI_GATEWAY_URL || '',
        gatewayAuthToken: runtimeEnv.AI_GATEWAY_AUTH_TOKEN,
        groqApiKey: runtimeEnv.GROQ_API_KEY || runtimeEnv.GROQ_API || ''
      })
    })
  } catch {
    return unavailableAdvisor()
  }
}

async function createFeedReader(input: {
  runtimeEnv: RuntimeEnv
  actorEmail: string
}) {
  if (!isDealerFeedsEnabled(input.runtimeEnv)) throw new Error('Dealer feeds are disabled.')
  const client = await getSocialDashboardClient({ runtimeEnv: input.runtimeEnv })
  if (!client) throw new Error('Social dashboard feed credentials are unavailable.')
  const providers = new Map<string, FeedProvider>()
  const linksByFeed = new Map<string, DealerLink>()
  const provider = (providerId: string) => {
    const existing = providers.get(providerId)
    if (existing) return existing
    const created = getFeedProvider(providerId, { socialDashboardClient: client })
    providers.set(providerId, created)
    return created
  }
  const context = (link: DealerLink) => linkToContext(link, input.actorEmail)
  return createGooglePmaxInternalFeedEvidenceReader({
    getActiveLink: async (clientId, providerId) => {
      const links = await listDealerLinks({ clientId, providerId, status: 'active' })
      return links[0] || null
    },
    listFeeds: async (link) => {
      const feeds = await provider(link.providerId).listFeeds(context(link), link)
      for (const feed of feeds) linksByFeed.set(`${link.providerId}:${feed.id}`, link)
      return feeds
    },
    getFeed: async (ref) => {
      const link = linksByFeed.get(`${ref.providerId}:${ref.feedId}`)
      if (!link) throw new Error('Dealer feed link is unavailable.')
      return provider(ref.providerId).getFeed(context(link), ref)
    },
    previewFeed: (link, ref, options) => provider(link.providerId).previewFeed(context(link), link, ref, options),
    resolveConditions: resolveGoogleFeedConditionsFromProviderEvidence
  })
}

function providerCollectors(input: {
  readProviderEvidence: (config: GooglePmaxInventoryLaunchConfig) => Promise<GooglePmaxPreflightEvidence>
  readAttestation: (launch: GooglePmaxLaunch) => Promise<GooglePmaxOnboardingAttestation | null>
  config: GooglePmaxInventoryLaunchConfig
  launch: GooglePmaxLaunch
}): Record<'feed' | 'merchant' | 'measurement' | 'onboarding', GooglePmaxEvidenceCollector> {
  const provider = () => input.readProviderEvidence(input.config)
  return {
    feed: async () => {
      const value = await provider()
      return evidenceResult({
        observedAt: value.internalFeed.fetchedAt,
        references: [{ kind: 'client_feed', id: `${value.internalFeed.linkId}:${value.internalFeed.feedId}` }],
        facts: { ...value.internalFeed }
      })
    },
    merchant: async ({ collectedAt }) => {
      const value = await provider()
      return evidenceResult({
        observedAt: collectedAt,
        references: [{ kind: 'merchant_center_account', id: input.config.merchantCenterId }],
        facts: {
          accountId: input.config.merchantCenterId,
          linkedAccountIds: value.merchant.linkedMerchantCenterIds,
          sourceStatus: value.merchant.sourceStatus,
          eligibleItemCount: value.merchant.eligibleItemCount,
          vehicleItemCount: value.merchant.vehicleItemCount,
          disapprovedItemCount: value.merchant.disapprovedItemCount
        }
      })
    },
    measurement: async ({ collectedAt }) => {
      const value = await provider()
      return evidenceResult({
        observedAt: collectedAt,
        references: value.conversions.slice(0, 50).map(item => ({
          kind: 'google_conversion_action',
          id: item.conversionActionId
        })),
        facts: {
          count: value.conversions.length,
          conversions: value.conversions.slice(0, 50)
        }
      })
    },
    onboarding: async () => {
      const attestation = await input.readAttestation(input.launch)
      if (!attestation) {
        return {
          authority: 'external_readback',
          status: 'unavailable',
          observedAt: input.launch.updatedAt,
          freshUntil: input.launch.updatedAt,
          references: [],
          facts: { errorCode: 'PMAX_ONBOARDING_ATTESTATION_MISSING' }
        }
      }
      const result = evaluateGooglePmaxOnboarding(attestation.evidence)
      return {
        authority: 'external_readback',
        status: 'available',
        observedAt: attestation.attestedAt,
        freshUntil: attestation.expiresAt,
        references: [{ kind: 'onboarding_attestation', id: attestation.id }],
        facts: {
          ready: result.ready,
          identities: result.identities,
          apiCapabilities: result.apiCapabilities,
          checks: result.checks
        }
      }
    }
  }
}

export async function runGooglePmaxLaunchPreflight(input: {
  event: H3Event
  launchId: string
  tenantId: string
  actorId: string
  actorEmail: string
}) {
  const runtimeEnv = mergedRuntimeEnv(input.event)
  const googleRuntimeConfig = resolveGoogleAdsRuntimeConfig(undefined, input.event)
  let feedReaderPromise: ReturnType<typeof createFeedReader> | undefined
  const feedReader = () => {
    feedReaderPromise ||= createFeedReader({ runtimeEnv, actorEmail: input.actorEmail })
    return feedReaderPromise
  }
  const providerReader = createGooglePmaxProviderEvidenceReader({
    readConnection: config => loadGooglePmaxProviderConnection(config, {
      getRuntimeConfig: () => googleRuntimeConfig
    }),
    readInternalFeed: async config => (await feedReader()).read(config)
  })
  let providerEvidencePromise: Promise<GooglePmaxPreflightEvidence> | undefined
  const readProviderEvidence = (config: GooglePmaxInventoryLaunchConfig) => {
    providerEvidencePromise ||= providerReader.read(config)
    return providerEvidencePromise
  }
  let attestationPromise: Promise<GooglePmaxOnboardingAttestation | null> | undefined
  const readAttestation = (launch: GooglePmaxLaunch) => {
    attestationPromise ||= getLatestGooglePmaxOnboardingAttestation({
      launchId: launch.id,
      tenantId: launch.tenantId,
      configVersion: launch.configVersion,
      configHash: launch.configHash
    })
    return attestationPromise
  }
  const preflight = createGooglePmaxPreflight({ readEvidence: readProviderEvidence })
  const advisor = createAdvisor(runtimeEnv)
  const internalCollectors = createGooglePmaxPlatformEvidenceCollectors()

  return createGooglePmaxLaunchOrchestrator({
    parseConfig: parseGooglePmaxInventoryLaunchConfig,
    collectEvidence: async (config, launch) => collectGooglePmaxDecisionEvidence({
      identity: {
        tenantId: launch.tenantId,
        clientId: launch.clientId,
        briefId: launch.briefId,
        configVersion: launch.configVersion,
        configHash: launch.configHash
      },
      collectors: {
        ...internalCollectors,
        ...providerCollectors({ readProviderEvidence, readAttestation, config, launch })
      }
    }),
    runPreflight: config => preflight.run(config),
    readOnboarding: async (config, launch) => {
      const attestation = await readAttestation(launch)
      return attestation ? evaluateGooglePmaxOnboarding(attestation.evidence) : missingOnboarding(config)
    },
    advise: value => advisor.advise(value)
  }).runPreflight({
    launchId: input.launchId,
    tenantId: input.tenantId,
    actorId: input.actorId
  })
}
