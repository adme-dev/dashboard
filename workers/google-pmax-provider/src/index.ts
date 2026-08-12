import { createGooglePmaxGoogleAdsProvider } from '../../../server/utils/googlePmaxGoogleAdsProvider'
import { z } from 'zod'
import { normalizeGooglePmaxInventoryLaunchConfig } from '../../../server/utils/googlePmaxLaunchConfig'
import { parseGooglePmaxInventoryLaunchConfig } from '../../../server/utils/googlePmaxLaunchConfigRuntime'
import { evaluateGooglePmaxOnboarding } from '../../../server/utils/googlePmaxOnboarding'
import { createGooglePmaxPreflight } from '../../../server/utils/googlePmaxPreflight'
import { createGooglePmaxProviderEvidenceReader } from '../../../server/utils/googlePmaxProviderReadback'
import {
  createGooglePmaxAiAdvisor,
  createGooglePmaxGatewayCompleter
} from '../../../server/utils/googlePmaxAiAdvisor'
import { buildGooglePmaxDecisionEvidence } from './decisionEvidencePolicy'
import { AttestationPolicyError, parseAttestationRow, prepareAttestation } from './attestationPolicy'
import { createGooglePmaxPlatformEvidenceCollectors } from '../../../server/utils/googlePmaxPlatformEvidenceCollectors'
import { queryRows as queryDatabaseRows, withTransaction } from './db'
import { persistGooglePmaxDecisionEvidence } from '../../../server/utils/googlePmaxDecisionEvidenceStore'
import {
  createGooglePmaxRemediationPostgresStore,
  syncGooglePmaxRemediationTasks
} from '../../../server/utils/googlePmaxRemediationTaskSync'
import { buildGooglePmaxRemediationTaskDrafts } from '../../../server/utils/googlePmaxRemediationTasks'
import { evaluateGooglePmaxInternalFeedEvidence } from '../../../server/utils/googlePmaxInternalFeedEvidence'
import {
  createProductionMerchantCatalogReadback,
  createProductionMerchantCatalogReconciler
} from './merchantCatalogReconciler'
import type {
  GooglePmaxInventoryLaunchConfig,
  GooglePmaxProviderConnection,
  GooglePmaxProviderResources
} from './contracts'

interface ProviderRequest {
  action: 'validate' | 'create_paused' | 'verify' | 'pause' | 'enable'
  config: GooglePmaxInventoryLaunchConfig
  resources?: GooglePmaxProviderResources
  expectedStatus?: 'PAUSED' | 'ENABLED'
  connection: GooglePmaxProviderConnection
}

interface WorkerEnv {
  HYPERDRIVE?: { connectionString?: string }
}

const PLATFORM_EVIDENCE_SOURCES = [
  'brief', 'audiences', 'personas', 'knowledge', 'boards', 'monday',
  'performance', 'anomalies', 'tasks'
] as const

function providerSections(input: Record<string, unknown>) {
  const config = object(input.config)
  const launch = object(input.launch)
  const evidence = object(input.providerEvidence)
  const internalFeed = object(evidence?.internalFeed)
  const merchant = object(evidence?.merchant)
  const conversions = evidence?.conversions
  const attestation = input.attestation === null ? null : object(input.attestation)
  if (!config || !launch || !evidence || !internalFeed || !merchant || !Array.isArray(conversions)) {
    throw new Error('invalid provider sections')
  }
  const hourAfter = (value: string) => new Date(new Date(value).getTime() + 60 * 60 * 1000).toISOString()
  const available = (observedAt: string, references: unknown[], facts: Record<string, unknown>) => ({
    authority: 'external_readback', status: 'available', observedAt,
    freshUntil: hourAfter(observedAt), references, facts
  })
  const collectedAt = typeof input.collectedAt === 'string' ? input.collectedAt : new Date().toISOString()
  const onboarding = attestation
    ? evaluateGooglePmaxOnboarding(attestation.evidence as never)
    : {
        ready: false,
        identities: {
          googleAdsCustomerId: config.customerId, merchantCenterAccountId: config.merchantCenterId,
          businessProfileAccountId: null, businessProfileLocationId: null,
          dealershipLocationSource: 'business_profile', storeDataSourceId: null, storeCode: null
        },
        shopIdentity: { kind: 'business_profile_location_and_store_code', locationResourceName: null, storeCode: null },
        apiCapabilities: {
          readGoogleAds: false, createGoogleAdsClient: false, directLinkAdsMerchant: false,
          readMerchant: false, createMerchantAccount: false, linkMerchantBusinessProfile: false,
          discoverBusinessProfileLocation: false, createBusinessProfileLocation: false
        },
        checks: [{
          code: 'PMAX_ONBOARDING_ATTESTATION_MISSING', status: 'fail',
          message: 'A current, config-bound onboarding attestation is required.'
        }],
        tasks: [{
          key: 'attest-google-onboarding',
          title: 'Verify and attest Google Ads, Merchant Center, Business Profile, store code, billing, and Vehicle Ads reviews',
          execution: 'human', owner: 'google_admin'
        }]
      }
  return {
    sections: {
      feed: available(String(internalFeed.fetchedAt || collectedAt), [{
        kind: 'client_feed', id: `${String(internalFeed.linkId || '')}:${String(internalFeed.feedId || '')}`
      }], { ...internalFeed }),
      merchant: available(collectedAt, [{ kind: 'merchant_center_account', id: String(config.merchantCenterId || '') }], {
        accountId: config.merchantCenterId,
        linkedAccountIds: merchant.linkedMerchantCenterIds,
        sourceStatus: merchant.sourceStatus,
        eligibleItemCount: merchant.eligibleItemCount,
        vehicleItemCount: merchant.vehicleItemCount,
        disapprovedItemCount: merchant.disapprovedItemCount
      }),
      measurement: available(collectedAt, conversions.slice(0, 50).map(item => ({
        kind: 'google_conversion_action', id: String(object(item)?.conversionActionId || '')
      })), { count: conversions.length, conversions: conversions.slice(0, 50) }),
      onboarding: attestation
        ? {
            authority: 'external_readback', status: 'available',
            observedAt: String(attestation.attestedAt || collectedAt),
            freshUntil: String(attestation.expiresAt || collectedAt),
            references: [{ kind: 'onboarding_attestation', id: String(attestation.id || '') }],
            facts: {
              ready: onboarding.ready, identities: onboarding.identities,
              apiCapabilities: onboarding.apiCapabilities, checks: onboarding.checks
            }
          }
        : {
            authority: 'external_readback', status: 'unavailable',
            observedAt: String(launch.updatedAt || collectedAt), freshUntil: String(launch.updatedAt || collectedAt),
            references: [], facts: { errorCode: 'PMAX_ONBOARDING_ATTESTATION_MISSING' }
          }
    },
    onboarding
  }
}

function merchantCatalogFailure(error: unknown, fallback: string) {
  const value = object(error)
  const code = typeof value?.code === 'string' && /^[A-Z0-9_]{1,120}$/.test(value.code)
    ? value.code
    : fallback
  const httpStatus = Number.isInteger(value?.httpStatus) && Number(value?.httpStatus) >= 400
    && Number(value?.httpStatus) <= 599
    ? Number(value?.httpStatus)
    : null
  console.error('[MerchantCatalogProvider] request failed', { code, httpStatus })
  return code
}

const AccountRowsSchema = z.array(z.strictObject({
  customer: z.strictObject({
    id: z.union([z.string(), z.number()]).transform(String),
    currencyCode: z.string().trim().length(3),
    timeZone: z.string().trim().min(1).max(100),
    status: z.literal('ENABLED')
  })
})).length(1)

const ConversionRowsSchema = z.array(z.strictObject({
  conversionAction: z.strictObject({
    id: z.union([z.string(), z.number()]).transform(String),
    resourceName: z.string(),
    status: z.literal('ENABLED'),
    type: z.enum(['UPLOAD_CLICKS', 'WEBPAGE']),
    category: z.string().regex(/^[A-Z][A-Z0-9_]*$/),
    origin: z.string().regex(/^[A-Z][A-Z0-9_]*$/)
  })
}))

const GeoSuggestionsSchema = z.object({
  geoTargetConstantSuggestions: z.array(z.object({
    geoTargetConstant: z.object({
      resourceName: z.string().regex(/^geoTargetConstants\/\d+$/),
      name: z.string().trim().min(1),
      canonicalName: z.string().trim().min(1),
      countryCode: z.string().length(2),
      targetType: z.string().trim().min(1),
      status: z.literal('ENABLED')
    }).passthrough(),
    searchTerm: z.string().trim().min(1),
    locale: z.string().optional(),
    reach: z.union([z.string(), z.number()]).optional()
  }).passthrough()).default([])
}).passthrough()

async function prepareProvider(input: Record<string, unknown>) {
  const connection = object(input.connection)
  const conversionIds = input.selectedConversionActionIds
  const requestedLocations = input.requestedLocations
  if (
    !connection
    || connection.status !== 'active'
    || typeof connection.customerId !== 'string'
    || !/^\d{10}$/.test(connection.customerId)
    || typeof connection.accessToken !== 'string'
    || !connection.accessToken
    || typeof connection.developerToken !== 'string'
    || !connection.developerToken
    || !Array.isArray(conversionIds)
    || conversionIds.some(id => typeof id !== 'string' || !/^\d+$/.test(id))
    || !Array.isArray(requestedLocations)
    || requestedLocations.some(name => typeof name !== 'string' || !name.trim())
  ) throw new Error('invalid provider preparation')

  const typedConnection = connection as unknown as GooglePmaxProviderConnection
  const [accountPayload, conversionPayload, geoResponse] = await Promise.all([
    queryAds(typedConnection, 'SELECT customer.id, customer.currency_code, customer.time_zone, customer.status FROM customer LIMIT 1'),
    conversionIds.length
      ? queryAds(typedConnection, `SELECT conversion_action.id, conversion_action.resource_name, conversion_action.status, conversion_action.type, conversion_action.category, conversion_action.origin FROM conversion_action WHERE conversion_action.id IN (${conversionIds.join(', ')}) AND conversion_action.status = 'ENABLED' AND conversion_action.type IN ('UPLOAD_CLICKS', 'WEBPAGE')`)
      : Promise.resolve([]),
    requestedLocations.length
      ? fetch('https://googleads.googleapis.com/v23/geoTargetConstants:suggest', {
          method: 'POST',
          headers: {
            'authorization': `Bearer ${typedConnection.accessToken}`,
            'developer-token': typedConnection.developerToken,
            'content-type': 'application/json',
            ...(typedConnection.loginCustomerId ? { 'login-customer-id': typedConnection.loginCustomerId } : {})
          },
          body: JSON.stringify({ locale: 'en', countryCode: 'AU', locationNames: { names: requestedLocations } })
        })
      : Promise.resolve(null)
  ])
  if (geoResponse && !geoResponse.ok) throw new Error('Google Ads geo query failed')
  const accountRows = AccountRowsSchema.parse(accountPayload)
  const conversions = ConversionRowsSchema.parse(conversionPayload)
  const suggestions = GeoSuggestionsSchema.parse(geoResponse ? await geoResponse.json() : { geoTargetConstantSuggestions: [] })
  const account = accountRows[0]!.customer
  if (account.id !== typedConnection.customerId) throw new Error('Google Ads account identity mismatch')
  const locations = requestedLocations.map((sourceText) => {
    const candidates = suggestions.geoTargetConstantSuggestions.filter(item => (
      item.searchTerm === sourceText
      && item.geoTargetConstant.countryCode === 'AU'
      && item.geoTargetConstant.status === 'ENABLED'
    ))
    if (candidates.length !== 1) throw new Error('Google Ads geo target ambiguous')
    const candidate = candidates[0]!.geoTargetConstant
    return {
      criterionId: candidate.resourceName.replace('geoTargetConstants/', ''),
      displayName: candidate.canonicalName,
      sourceText
    }
  })
  return {
    account: { id: account.id, currencyCode: account.currencyCode, timeZone: account.timeZone },
    conversionGoals: conversions.map(row => ({
      conversionActionId: row.conversionAction.id,
      resourceName: row.conversionAction.resourceName,
      category: row.conversionAction.category,
      origin: row.conversionAction.origin
    })),
    locations
  }
}

function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: { 'cache-control': 'no-store' }
  })
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function parseRequest(value: unknown): ProviderRequest {
  const body = object(value)
  const connection = object(body?.connection)
  if (
    !body
    || !['validate', 'create_paused', 'verify', 'pause', 'enable'].includes(String(body.action))
    || !object(body.config)
    || !connection
    || connection.status !== 'active'
    || typeof connection.customerId !== 'string'
    || !/^\d{10}$/.test(connection.customerId)
    || typeof connection.accessToken !== 'string'
    || !connection.accessToken
    || typeof connection.developerToken !== 'string'
    || !connection.developerToken
  ) throw new Error('invalid request')
  return body as unknown as ProviderRequest
}

async function queryAds(
  connection: GooglePmaxProviderConnection,
  query: string
): Promise<unknown[]> {
  const results: unknown[] = []
  let pageToken: string | undefined
  for (let page = 0; page < 100; page += 1) {
    const response = await fetch(
      `https://googleads.googleapis.com/v23/customers/${connection.customerId}/googleAds:search`,
      {
        method: 'POST',
        headers: {
          'authorization': `Bearer ${connection.accessToken}`,
          'developer-token': connection.developerToken,
          'content-type': 'application/json',
          ...(connection.loginCustomerId
            ? { 'login-customer-id': connection.loginCustomerId.replaceAll('-', '') }
            : {})
        },
        body: JSON.stringify({ query, pageSize: 10_000, ...(pageToken ? { pageToken } : {}) })
      }
    )
    if (!response.ok) throw new Error('Google Ads query failed')
    const payload = object(await response.json())
    if (!payload || (payload.results !== undefined && !Array.isArray(payload.results))) {
      throw new Error('Google Ads response invalid')
    }
    results.push(...(payload.results as unknown[] || []))
    if (typeof payload.nextPageToken !== 'string' || !payload.nextPageToken) return results
    pageToken = payload.nextPageToken
  }
  throw new Error('Google Ads pagination exceeded')
}

export function createGooglePmaxProviderWorker() {
  return {
    async fetch(request: Request, env: WorkerEnv = {}): Promise<Response> {
      const path = new URL(request.url).pathname
      if (
        request.method !== 'POST'
        || !['/v1/execute', '/v1/decision'].includes(path)
        || request.headers.get('x-xeroflow-service') !== 'google-pmax-provider-v1'
      ) return json({ ok: false }, 404)

      if (path === '/v1/decision') {
        const body = object(await request.json().catch(() => null))
        if (!body || !['normalize', 'parse_config', 'preflight', 'onboarding', 'provider_evidence', 'provider_sections', 'prepare_provider', 'decision_evidence', 'platform_evidence', 'internal_feed_evidence', 'persist_evidence', 'sync_tasks', 'attestation_prepare', 'attestation_parse', 'advise', 'merchant_catalog_reconcile', 'merchant_catalog_readback'].includes(String(body.action))) {
          return json({ ok: false }, 400)
        }
        try {
          if (body.action === 'normalize') {
            return json({ ok: true, result: normalizeGooglePmaxInventoryLaunchConfig(body.input as never) })
          }
          if (body.action === 'parse_config') {
            return json({ ok: true, result: parseGooglePmaxInventoryLaunchConfig(body.input) })
          }
          if (body.action === 'onboarding') {
            return json({ ok: true, result: evaluateGooglePmaxOnboarding(body.input as never) })
          }
          if (body.action === 'decision_evidence') {
            const input = object(body.input)
            if (!input || !object(input.identity) || !Array.isArray(input.sections)) return json({ ok: false }, 400)
            return json({ ok: true, result: buildGooglePmaxDecisionEvidence(input as never) })
          }
          if (body.action === 'platform_evidence') {
            const input = object(body.input)
            const identity = object(input?.identity)
            const collectedAt = input?.collectedAt
            const connectionString = env.HYPERDRIVE?.connectionString
            if (!input || !identity || typeof collectedAt !== 'string' || !connectionString) return json({ ok: false }, 400)
            const collectors = createGooglePmaxPlatformEvidenceCollectors({
              queryRows: (sql, params) => queryDatabaseRows(connectionString, sql, params)
            })
            const results = Object.fromEntries(await Promise.all(PLATFORM_EVIDENCE_SOURCES.map(async (source) => {
              try {
                return [source, await collectors[source]({ identity: identity as never, collectedAt })]
              } catch {
                return [source, null]
              }
            })))
            return json({ ok: true, result: results })
          }
          if (body.action === 'internal_feed_evidence') {
            const input = object(body.input)
            if (!input || !object(input.config) || !Array.isArray(input.feeds)) return json({ ok: false }, 400)
            return json({ ok: true, result: evaluateGooglePmaxInternalFeedEvidence(input as never) })
          }
          if (body.action === 'merchant_catalog_reconcile') {
            const connectionString = env.HYPERDRIVE?.connectionString
            if (!connectionString || !object(body.input)) return json({ ok: false }, 400)
            try {
              const result = await createProductionMerchantCatalogReconciler(connectionString)(body.input)
              return json({ ok: true, result })
            } catch (error) {
              return json({
                ok: false,
                errorCode: merchantCatalogFailure(error, 'MERCHANT_CATALOG_RECONCILE_FAILED')
              }, 422)
            }
          }
          if (body.action === 'merchant_catalog_readback') {
            const connectionString = env.HYPERDRIVE?.connectionString
            if (!connectionString || !object(body.input)) return json({ ok: false }, 400)
            try {
              const result = await createProductionMerchantCatalogReadback(connectionString)(body.input)
              return json({ ok: true, result })
            } catch (error) {
              return json({
                ok: false,
                errorCode: merchantCatalogFailure(error, 'MERCHANT_CATALOG_READBACK_FAILED')
              }, 422)
            }
          }
          if (body.action === 'persist_evidence') {
            const input = object(body.input)
            const evidence = object(input?.evidence)
            const connectionString = env.HYPERDRIVE?.connectionString
            if (!input || !evidence || !connectionString) return json({ ok: false }, 400)
            const result = await persistGooglePmaxDecisionEvidence(input as never, {
              build: async value => buildGooglePmaxDecisionEvidence(value),
              transaction: callback => withTransaction(connectionString, callback as never)
            })
            return json({ ok: true, result })
          }
          if (body.action === 'sync_tasks') {
            const input = object(body.input)
            const connectionString = env.HYPERDRIVE?.connectionString
            if (!input || !Array.isArray(input.preflightChecks) || !Array.isArray(input.onboardingTasks) || !connectionString) {
              return json({ ok: false }, 400)
            }
            const drafts = buildGooglePmaxRemediationTaskDrafts({
              preflightChecks: input.preflightChecks as never,
              onboardingTasks: input.onboardingTasks as never
            })
            const result = await withTransaction(connectionString, db => syncGooglePmaxRemediationTasks({
              launchId: String(input.launchId || ''),
              tenantId: String(input.tenantId || ''),
              actorId: String(input.actorId || ''),
              drafts
            }, { store: createGooglePmaxRemediationPostgresStore(db) }))
            return json({ ok: true, result: { ...result, taskCount: drafts.length } })
          }
          if (body.action === 'attestation_prepare') {
            const input = object(body.input)
            if (!input || !object(input.config)) return json({ ok: false }, 400)
            try {
              return json({ ok: true, result: prepareAttestation(input as never) })
            } catch (error) {
              return json({
                ok: true,
                result: {
                  errorCode: error instanceof AttestationPolicyError
                    ? error.code
                    : 'PMAX_ONBOARDING_ATTESTATION_INVALID'
                }
              })
            }
          }
          if (body.action === 'attestation_parse') {
            const input = object(body.input)
            if (!input || !object(input.row) || typeof input.now !== 'string') return json({ ok: false }, 400)
            return json({ ok: true, result: parseAttestationRow(input.row, input.now) })
          }
          if (body.action === 'prepare_provider') {
            const input = object(body.input)
            if (!input) return json({ ok: false }, 400)
            try {
              return json({ ok: true, result: await prepareProvider(input) })
            } catch (error) {
              return json({
                ok: true,
                result: {
                  errorCode: error instanceof Error && error.message === 'Google Ads geo target ambiguous'
                    ? 'PMAX_PREPARATION_GEO_AMBIGUOUS'
                    : 'PMAX_PREPARATION_PROVIDER_RESPONSE_INVALID'
                }
              })
            }
          }
          const input = object(body.input)
          if (!input) return json({ ok: false }, 400)
          if (body.action === 'advise') {
            if (!object(input.evidence) || !object(input.preflight)) return json({ ok: false }, 400)
            try {
              const advisor = createGooglePmaxAiAdvisor({
                complete: createGooglePmaxGatewayCompleter({
                  gatewayUrl: typeof input.gatewayUrl === 'string' ? input.gatewayUrl : '',
                  gatewayAuthToken: typeof input.gatewayAuthToken === 'string' ? input.gatewayAuthToken : undefined,
                  groqApiKey: typeof input.groqApiKey === 'string' ? input.groqApiKey : ''
                })
              })
              return json({
                ok: true,
                result: await advisor.advise({
                  evidence: input.evidence as never,
                  preflight: input.preflight as never
                })
              })
            } catch {
              return json({ ok: true, result: { status: 'unavailable', reason: 'GATEWAY_UNAVAILABLE' } })
            }
          }
          if (!object(input.config)) return json({ ok: false }, 400)
          if (body.action === 'provider_evidence') {
            const connection = object(input.connection)
            const internalFeed = object(input.internalFeed)
            if (
              !connection
              || !internalFeed
              || connection.status !== 'active'
              || typeof connection.customerId !== 'string'
              || !/^\d{10}$/.test(connection.customerId)
              || typeof connection.accessToken !== 'string'
              || !connection.accessToken
              || typeof connection.developerToken !== 'string'
              || !connection.developerToken
            ) return json({ ok: false }, 400)
            const reader = createGooglePmaxProviderEvidenceReader({
              readConnection: async () => connection as never,
              readInternalFeed: async () => internalFeed as never,
              queryAds
            })
            return json({ ok: true, result: await reader.read(input.config as never) })
          }
          if (body.action === 'provider_sections') {
            return json({ ok: true, result: providerSections(input) })
          }
          if (!object(input.evidence)) return json({ ok: false }, 400)
          const engine = createGooglePmaxPreflight({ readEvidence: async () => input.evidence as never })
          return json({ ok: true, result: await engine.run(input.config as never) })
        } catch {
          return json({ ok: false, errorCode: 'PMAX_DECISION_FAILED' }, 422)
        }
      }

      let input: ProviderRequest
      try {
        input = parseRequest(await request.json())
      } catch {
        return json({ ok: false }, 400)
      }

      const provider = createGooglePmaxGoogleAdsProvider({
        loadConnection: async () => input.connection,
        queryAds,
        fetch: globalThis.fetch.bind(globalThis)
      })
      try {
        let result: unknown
        switch (input.action) {
          case 'validate':
            result = await provider.validateCreate(input.config)
            break
          case 'create_paused':
            result = await provider.createPaused(input.config)
            break
          case 'verify':
            if (!input.resources || !input.expectedStatus) throw new Error('missing verification input')
            result = await provider.verify(input.config, input.resources, input.expectedStatus)
            break
          case 'pause':
            if (!input.resources) throw new Error('missing pause input')
            result = await provider.emergencyPause(input.resources, input.config)
            break
          case 'enable':
            if (!input.resources) throw new Error('missing enable input')
            result = await provider.enable(input.resources, input.config)
            break
        }
        return json({ ok: true, result })
      } catch (error: unknown) {
        const code = object(error)?.code
        return json({
          ok: false,
          errorCode: typeof code === 'string' && /^PMAX_[A-Z0-9_]+$/.test(code)
            ? code
            : 'PMAX_PROVIDER_FAILED'
        }, 502)
      }
    }
  }
}

export default createGooglePmaxProviderWorker()
