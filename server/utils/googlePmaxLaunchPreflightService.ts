import type { H3Event } from 'h3'
import {
  collectGooglePmaxDecisionEvidence,
  type GooglePmaxEvidenceCollector
} from '~~/server/utils/googlePmaxDecisionEvidence'
import { getSocialDashboardClient, isDealerFeedsEnabled } from '~~/server/utils/feeds/config'
import { listDealerLinks } from '~~/server/utils/feeds/dealerLinkStore'
import { linkToContext } from '~~/server/utils/feeds/dealerLinks'
import { getFeedProvider } from '~~/server/utils/feeds/registry'
import { mergedRuntimeEnv } from '~~/server/utils/feeds/serverContext'
import type { DealerLink, FeedDetail, FeedPreviewResult, FeedProvider, FeedSummary } from '~~/server/utils/feeds/types'
import type { GooglePmaxInventoryLaunchConfig } from '~~/server/utils/googlePmaxLaunchConfig'
import { createGooglePmaxLaunchOrchestrator } from '~~/server/utils/googlePmaxLaunchOrchestrator'
import type { GooglePmaxLaunch } from '~~/server/utils/googlePmaxLaunchStore'
import {
  getLatestGooglePmaxOnboardingAttestation,
  type GooglePmaxOnboardingAttestation
} from '~~/server/utils/googlePmaxOnboardingAttestation'
import type { GooglePmaxPreflightEvidence } from '~~/server/utils/googlePmaxPreflight'
import { loadGooglePmaxProviderConnection } from '~~/server/utils/googlePmaxProviderConnection'
import { createGooglePmaxRemoteDecisionEngine } from '~~/server/utils/googlePmaxRemoteDecisionEngine'
import { resolveGoogleAdsRuntimeConfig } from '~~/server/utils/spendSync'

type RuntimeEnv = Record<string, string | undefined>

async function createFeedReader(input: {
  runtimeEnv: RuntimeEnv
  actorEmail: string
  evaluate: ReturnType<typeof createGooglePmaxRemoteDecisionEngine>['internalFeedEvidence']
}) {
  if (!isDealerFeedsEnabled(input.runtimeEnv)) throw new Error('Dealer feeds are disabled.')
  const client = await getSocialDashboardClient({ runtimeEnv: input.runtimeEnv })
  if (!client) throw new Error('Social dashboard feed credentials are unavailable.')
  const providers = new Map<string, FeedProvider>()
  const provider = (providerId: string) => {
    const existing = providers.get(providerId)
    if (existing) return existing
    const created = getFeedProvider(providerId, { socialDashboardClient: client })
    providers.set(providerId, created)
    return created
  }
  const context = (link: DealerLink) => linkToContext(link, input.actorEmail)
  return {
    async read(config: GooglePmaxInventoryLaunchConfig) {
      const links = await listDealerLinks({
        clientId: config.clientId,
        providerId: config.inventorySource.providerId,
        status: 'active'
      })
      const link = links[0] || null
      let feeds: FeedSummary[] = []
      let detail: FeedDetail | null = null
      let preview: FeedPreviewResult | null = null
      if (link) {
        feeds = await provider(link.providerId).listFeeds(context(link), link)
        const feed = feeds.find(item => item.id === config.inventorySource.feedId)
        if (feed?.isActive && feed.platform === 'google') {
          const ref = { providerId: link.providerId, feedId: feed.id, platform: feed.platform }
          detail = await provider(link.providerId).getFeed(context(link), ref)
          if (detail.id === feed.id && detail.platform === feed.platform && detail.isActive) {
            preview = await provider(link.providerId).previewFeed(context(link), link, ref, { limit: 100, offset: 0 })
          }
        }
      }
      return input.evaluate({
        config,
        link,
        feeds,
        detail,
        preview,
        fetchedAt: new Date().toISOString()
      })
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
  const decisionEngine = createGooglePmaxRemoteDecisionEngine(input.event)
  const googleRuntimeConfig = resolveGoogleAdsRuntimeConfig(undefined, input.event)
  let feedReaderPromise: ReturnType<typeof createFeedReader> | undefined
  const feedReader = () => {
    feedReaderPromise ||= createFeedReader({
      runtimeEnv,
      actorEmail: input.actorEmail,
      evaluate: decisionEngine.internalFeedEvidence
    })
    return feedReaderPromise
  }
  let providerEvidencePromise: Promise<GooglePmaxPreflightEvidence> | undefined
  const readProviderEvidence = (config: GooglePmaxInventoryLaunchConfig) => {
    providerEvidencePromise ||= Promise.all([
      loadGooglePmaxProviderConnection(config, { getRuntimeConfig: () => googleRuntimeConfig }),
      feedReader().then(reader => reader.read(config))
    ]).then(([connection, internalFeed]) => decisionEngine.providerEvidence({
      config,
      connection,
      internalFeed
    }))
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
  const platformSources = [
    'brief', 'audiences', 'personas', 'knowledge', 'boards', 'monday',
    'performance', 'anomalies', 'tasks'
  ] as const
  let platformEvidencePromise: ReturnType<typeof decisionEngine.platformEvidence> | undefined
  const internalCollectors = Object.fromEntries(platformSources.map(source => [
    source,
    async (context: Parameters<GooglePmaxEvidenceCollector>[0]) => {
      platformEvidencePromise ||= decisionEngine.platformEvidence(context)
      const evidence = (await platformEvidencePromise)[source]
      if (!evidence) throw new Error('Platform evidence source failed closed.')
      return evidence
    }
  ])) as Record<typeof platformSources[number], GooglePmaxEvidenceCollector>
  let providerSectionsPromise: ReturnType<typeof decisionEngine.providerSections> | undefined
  const readProviderSections = (config: GooglePmaxInventoryLaunchConfig, launch: GooglePmaxLaunch) => {
    providerSectionsPromise ||= Promise.all([
      readProviderEvidence(config),
      readAttestation(launch)
    ]).then(([providerEvidence, attestation]) => decisionEngine.providerSections({
      config,
      launch,
      providerEvidence,
      attestation,
      collectedAt: new Date().toISOString()
    }))
    return providerSectionsPromise
  }
  const providerSectionCollectors = (
    config: GooglePmaxInventoryLaunchConfig,
    launch: GooglePmaxLaunch
  ): Record<'feed' | 'merchant' | 'measurement' | 'onboarding', GooglePmaxEvidenceCollector> => ({
    feed: async () => (await readProviderSections(config, launch)).sections.feed,
    merchant: async () => (await readProviderSections(config, launch)).sections.merchant,
    measurement: async () => (await readProviderSections(config, launch)).sections.measurement,
    onboarding: async () => (await readProviderSections(config, launch)).sections.onboarding
  })

  return createGooglePmaxLaunchOrchestrator({
    parseConfig: decisionEngine.parseConfig,
    persistEvidence: decisionEngine.persistEvidence,
    syncTasks: decisionEngine.syncTasks,
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
        ...providerSectionCollectors(config, launch)
      },
      build: decisionEngine.buildDecisionEvidence
    }),
    runPreflight: async config => decisionEngine.preflight(config, await readProviderEvidence(config)),
    readOnboarding: async (config, launch) => (await readProviderSections(config, launch)).onboarding,
    advise: value => decisionEngine.advise({
      ...value,
      gatewayUrl: runtimeEnv.AI_GATEWAY_URL || '',
      gatewayAuthToken: runtimeEnv.AI_GATEWAY_AUTH_TOKEN,
      groqApiKey: runtimeEnv.GROQ_API_KEY || runtimeEnv.GROQ_API || ''
    })
  }).runPreflight({
    launchId: input.launchId,
    tenantId: input.tenantId,
    actorId: input.actorId
  })
}
