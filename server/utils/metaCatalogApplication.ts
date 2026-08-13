import { getDealerLink as dbGetDealerLink, linkToContext } from '~~/server/utils/feeds/dealerLinks'
import {
  getSocialDashboardClient,
  resolveSocialDashboardBaseUrl
} from '~~/server/utils/feeds/config'
import { getFeedProvider } from '~~/server/utils/feeds/registry'
import type { DealerLink, FeedSummary } from '~~/server/utils/feeds/types'
import {
  ensureMetaCatalogFeed,
  inspectMetaCatalogReadiness,
  type MetaCatalogConnectionAuthority,
  type MetaCatalogEvidenceInput,
  type MetaCatalogFeedBindingSummary,
  type MetaCatalogProvider
} from '~~/server/utils/metaCatalogPlatform'
import { createMetaCatalogProvider } from '~~/server/utils/metaCatalogProvider'
import {
  getMetaCatalogConnectionAuthority,
  listMetaCatalogFeedBindings,
  persistMetaCatalogFeedEvidence,
  type MetaCatalogConnectionRecord
} from '~~/server/utils/metaCatalogRepository'

type RuntimeEnv = Record<string, string | undefined>

interface BaseInput {
  clientId: string
  connectionId: string
  actorEmail: string
  runtimeEnv?: RuntimeEnv
}

export interface MetaCatalogApplicationDeps {
  getConnectionAuthority(
    clientId: string,
    connectionId: string,
  ): Promise<MetaCatalogConnectionRecord | null>
  listBindings(clientId: string, connectionId: string): Promise<MetaCatalogFeedBindingSummary[]>
  getDealerLink(clientId: string): Promise<DealerLink | null>
  listSourceFeeds(input: {
    link: DealerLink
    actorEmail: string
    externalOrgId: string
    runtimeEnv?: RuntimeEnv
  }): Promise<FeedSummary[]>
  resolveFeedBaseUrl(input: { runtimeEnv?: RuntimeEnv }): Promise<string>
  createProvider(input: { accessToken: string }): MetaCatalogProvider
  persistEvidence(input: MetaCatalogEvidenceInput): Promise<void>
}

const defaultDeps: MetaCatalogApplicationDeps = {
  getConnectionAuthority: getMetaCatalogConnectionAuthority,
  listBindings: listMetaCatalogFeedBindings,
  getDealerLink: dbGetDealerLink,
  async listSourceFeeds(input) {
    const client = await getSocialDashboardClient({ runtimeEnv: input.runtimeEnv })
    if (!client) throw createError({ statusCode: 503, statusMessage: 'Dealer feed provider is not configured' })
    const provider = getFeedProvider(input.link.providerId, { socialDashboardClient: client })
    return provider.listFeeds(linkToContext(input.link, input.actorEmail), input.link)
  },
  resolveFeedBaseUrl: input => resolveSocialDashboardBaseUrl({ runtimeEnv: input.runtimeEnv }),
  createProvider: input => createMetaCatalogProvider(input),
  persistEvidence: persistMetaCatalogFeedEvidence
}

function dependencies(overrides?: MetaCatalogApplicationDeps): MetaCatalogApplicationDeps {
  return overrides || defaultDeps
}

async function loadContext(input: BaseInput, deps: MetaCatalogApplicationDeps) {
  const connection = await deps.getConnectionAuthority(input.clientId, input.connectionId)
  if (!connection || !connection.accessToken) {
    throw createError({ statusCode: 404, statusMessage: 'Active mapped Meta connection not found' })
  }
  const link = await deps.getDealerLink(input.clientId)
  const sourceFeeds = link
    ? await deps.listSourceFeeds({
        link,
        actorEmail: input.actorEmail,
        externalOrgId: link.externalOrgId,
        runtimeEnv: input.runtimeEnv
      })
    : []
  const facebookFeeds = sourceFeeds
    .filter(feed => feed.platform === 'facebook' && feed.isActive)
    .map(feed => ({ id: feed.id, name: feed.name, platform: 'facebook' as const }))
  const bindings = await deps.listBindings(input.clientId, input.connectionId)
  return { connection, link, sourceFeeds: facebookFeeds, bindings }
}

export async function getMetaCatalogReadinessForClient(
  input: BaseInput,
  overrides?: MetaCatalogApplicationDeps
) {
  const deps = dependencies(overrides)
  const context = await loadContext(input, deps)
  return inspectMetaCatalogReadiness({
    connection: context.connection,
    bindings: context.bindings,
    sourceFeeds: context.sourceFeeds
  }, deps.createProvider({ accessToken: context.connection.accessToken }))
}

export async function attachMetaCatalogFeedForClient(
  input: BaseInput & {
    catalogId: string
    sourceFeedId: string
    actorId: string
  },
  overrides?: MetaCatalogApplicationDeps
) {
  const deps = dependencies(overrides)
  const context = await loadContext(input, deps)
  const sourceFeed = context.sourceFeeds.find(feed => feed.id === input.sourceFeedId)
  if (!sourceFeed) {
    throw createError({ statusCode: 400, statusMessage: 'Source feed is not linked to this client' })
  }
  const baseUrl = await deps.resolveFeedBaseUrl({ runtimeEnv: input.runtimeEnv })

  return ensureMetaCatalogFeed({
    connection: context.connection as MetaCatalogConnectionAuthority,
    clientId: input.clientId,
    clientName: context.connection.clientName,
    catalogId: input.catalogId,
    sourceFeedId: sourceFeed.id,
    sourceFeedName: sourceFeed.name,
    allowedSourceFeedIds: context.sourceFeeds.map(feed => feed.id),
    feedBaseUrl: baseUrl,
    actorId: input.actorId
  }, {
    ...deps.createProvider({ accessToken: context.connection.accessToken }),
    persistEvidence: deps.persistEvidence
  })
}
