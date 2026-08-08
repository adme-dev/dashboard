import type { H3Event } from 'h3'
import type { GooglePmaxInventoryLaunchConfig } from '~~/server/utils/googlePmaxLaunchConfig'
import type {
  GooglePmaxPausedProvider,
  GooglePmaxProviderResources,
  GooglePmaxProviderVerification
} from '~~/server/utils/googlePmaxPausedExecutor'
import type { GooglePmaxProviderConnection } from '~~/server/utils/googlePmaxProviderReadback'

interface ServiceBinding {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

interface RemoteProviderDependencies {
  binding?: ServiceBinding
  loadConnection: (config: GooglePmaxInventoryLaunchConfig) => Promise<GooglePmaxProviderConnection>
}

export class GooglePmaxRemoteProviderError extends Error {
  constructor(public readonly code:
    | 'PMAX_PROVIDER_SERVICE_UNAVAILABLE'
    | 'PMAX_PROVIDER_SERVICE_RESPONSE_INVALID') {
    super('The private Google PMax provider Worker failed closed.')
    this.name = 'GooglePmaxRemoteProviderError'
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

function requestId(value: unknown): string | null {
  return typeof value === 'string' && /^[A-Za-z0-9_.:-]{1,255}$/.test(value) ? value : null
}

function resources(value: unknown): GooglePmaxProviderResources {
  const item = record(value)
  if (!item || !['PAUSED', 'ENABLED'].includes(String(item.status))) {
    throw new GooglePmaxRemoteProviderError('PMAX_PROVIDER_SERVICE_RESPONSE_INVALID')
  }
  for (const key of ['customerId', 'campaignResourceName', 'campaignId', 'budgetResourceName', 'assetGroupResourceName']) {
    if (typeof item[key] !== 'string' || !item[key]) {
      throw new GooglePmaxRemoteProviderError('PMAX_PROVIDER_SERVICE_RESPONSE_INVALID')
    }
  }
  return {
    customerId: item.customerId as string,
    campaignResourceName: item.campaignResourceName as string,
    campaignId: item.campaignId as string,
    budgetResourceName: item.budgetResourceName as string,
    assetGroupResourceName: item.assetGroupResourceName as string,
    status: item.status as 'PAUSED' | 'ENABLED',
    requestId: requestId(item.requestId)
  }
}

function verification(value: unknown): GooglePmaxProviderVerification {
  const item = record(value)
  if (
    !item
    || !['PAUSED', 'ENABLED', 'REMOVED', 'UNKNOWN'].includes(String(item.status))
    || typeof item.matchesConfig !== 'boolean'
    || !record(item.details)
  ) throw new GooglePmaxRemoteProviderError('PMAX_PROVIDER_SERVICE_RESPONSE_INVALID')
  return {
    status: item.status as GooglePmaxProviderVerification['status'],
    matchesConfig: item.matchesConfig,
    requestId: requestId(item.requestId),
    details: item.details as Record<string, unknown>
  }
}

export function createGooglePmaxRemoteProvider(
  event: H3Event,
  dependencies: RemoteProviderDependencies
): GooglePmaxPausedProvider {
  const binding = dependencies.binding || serviceBinding(event)

  async function call(
    action: 'validate' | 'create_paused' | 'verify' | 'pause' | 'enable',
    config: GooglePmaxInventoryLaunchConfig,
    providerResources?: GooglePmaxProviderResources,
    expectedStatus?: 'PAUSED' | 'ENABLED'
  ): Promise<unknown> {
    if (!binding) throw new GooglePmaxRemoteProviderError('PMAX_PROVIDER_SERVICE_UNAVAILABLE')
    const connection = await dependencies.loadConnection(config)
    let response: Response
    try {
      response = await binding.fetch('https://google-pmax-provider.internal/v1/execute', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-xeroflow-service': 'google-pmax-provider-v1'
        },
        body: JSON.stringify({ action, config, resources: providerResources, expectedStatus, connection })
      })
    } catch {
      throw new GooglePmaxRemoteProviderError('PMAX_PROVIDER_SERVICE_UNAVAILABLE')
    }
    if (!response.ok) throw new GooglePmaxRemoteProviderError('PMAX_PROVIDER_SERVICE_UNAVAILABLE')
    let body: unknown
    try {
      body = await response.json()
    } catch {
      throw new GooglePmaxRemoteProviderError('PMAX_PROVIDER_SERVICE_RESPONSE_INVALID')
    }
    const envelope = record(body)
    if (!envelope || envelope.ok !== true || !('result' in envelope)) {
      throw new GooglePmaxRemoteProviderError('PMAX_PROVIDER_SERVICE_RESPONSE_INVALID')
    }
    return envelope.result
  }

  return {
    async validateCreate(config) {
      const result = record(await call('validate', config))
      if (!result) throw new GooglePmaxRemoteProviderError('PMAX_PROVIDER_SERVICE_RESPONSE_INVALID')
      return { requestId: requestId(result.requestId) }
    },
    async createPaused(config) {
      return resources(await call('create_paused', config))
    },
    async verify(config, providerResources, expectedStatus) {
      return verification(await call('verify', config, providerResources, expectedStatus))
    },
    async emergencyPause(providerResources, config) {
      const result = record(await call('pause', config, providerResources))
      if (!result || !['PAUSED', 'ENABLED', 'UNKNOWN'].includes(String(result.status))) {
        throw new GooglePmaxRemoteProviderError('PMAX_PROVIDER_SERVICE_RESPONSE_INVALID')
      }
      return {
        status: result.status as 'PAUSED' | 'ENABLED' | 'UNKNOWN',
        requestId: requestId(result.requestId)
      }
    },
    async enable(providerResources, config) {
      const result = record(await call('enable', config, providerResources))
      if (!result || !['PAUSED', 'ENABLED', 'UNKNOWN'].includes(String(result.status))) {
        throw new GooglePmaxRemoteProviderError('PMAX_PROVIDER_SERVICE_RESPONSE_INVALID')
      }
      return {
        status: result.status as 'PAUSED' | 'ENABLED' | 'UNKNOWN',
        requestId: requestId(result.requestId)
      }
    }
  }
}
