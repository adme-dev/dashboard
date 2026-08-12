import type { H3Event } from 'h3'
import { queryOne } from '~~/server/utils/db'
import { loadGooglePmaxProviderConnection } from '~~/server/utils/googlePmaxProviderConnection'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

interface ServiceBinding {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>
}

interface SourceRow {
  id: string
  client_id: string
  connection_config: Record<string, unknown>
}

export class GoogleMerchantCatalogRemoteError extends Error {
  constructor(public readonly code:
    | 'MERCHANT_CATALOG_SCOPE_INVALID'
    | 'MERCHANT_CATALOG_PROVIDER_UNAVAILABLE'
    | 'MERCHANT_CATALOG_PROVIDER_FAILED') {
    super(code)
    this.name = 'GoogleMerchantCatalogRemoteError'
  }
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

function binding(event: H3Event): ServiceBinding | null {
  const value = (event.context as {
    cloudflare?: { env?: Record<string, unknown> }
  }).cloudflare?.env?.GOOGLE_PMAX_PROVIDER
  return value && typeof value === 'object' && typeof (value as ServiceBinding).fetch === 'function'
    ? value as ServiceBinding
    : null
}

async function runGoogleMerchantCatalogAction(event: H3Event, action: 'merchant_catalog_reconcile' | 'merchant_catalog_readback', input: {
  tenantId: string
  clientId: string
  sourceId: string
}) {
  if (
    !input.tenantId || input.tenantId.length > 255
    || !UUID.test(input.clientId) || !UUID.test(input.sourceId)
  ) throw new GoogleMerchantCatalogRemoteError('MERCHANT_CATALOG_SCOPE_INVALID')
  const source = await queryOne<SourceRow>(`
    SELECT id, client_id, connection_config
      FROM crm_catalog_sources
     WHERE id = $1::uuid AND client_id = $2::uuid AND status = 'active'
     LIMIT 1
  `, [input.sourceId, input.clientId])
  const merchant = object(source?.connection_config?.merchant)
  const connectionId = typeof merchant?.ads_connection_id === 'string' ? merchant.ads_connection_id : ''
  const customerId = typeof merchant?.ads_customer_id === 'string' ? merchant.ads_customer_id : ''
  if (
    !source || source.id !== input.sourceId || source.client_id !== input.clientId
    || merchant?.auto_publish !== true
    || merchant?.tenant_id !== input.tenantId
    || !UUID.test(connectionId) || !/^\d{10}$/.test(customerId)
  ) throw new GoogleMerchantCatalogRemoteError('MERCHANT_CATALOG_SCOPE_INVALID')
  const provider = binding(event)
  if (!provider) throw new GoogleMerchantCatalogRemoteError('MERCHANT_CATALOG_PROVIDER_UNAVAILABLE')
  const connection = await loadGooglePmaxProviderConnection({
    tenantId: input.tenantId,
    clientId: input.clientId,
    connectionId,
    customerId
  })
  let response: Response
  try {
    response = await provider.fetch('https://google-pmax-provider.internal/v1/decision', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-xeroflow-service': 'google-pmax-provider-v1'
      },
      body: JSON.stringify({
        action,
        input: { ...input, connection }
      })
    })
  } catch {
    throw new GoogleMerchantCatalogRemoteError('MERCHANT_CATALOG_PROVIDER_UNAVAILABLE')
  }
  const body = object(await response.json().catch(() => null))
  if (!response.ok || body?.ok !== true || !object(body.result)) {
    throw new GoogleMerchantCatalogRemoteError('MERCHANT_CATALOG_PROVIDER_FAILED')
  }
  return body.result
}

export async function runGoogleMerchantCatalogReconciliation(event: H3Event, input: {
  tenantId: string
  clientId: string
  sourceId: string
}) {
  return await runGoogleMerchantCatalogAction(event, 'merchant_catalog_reconcile', input)
}

export async function runGoogleMerchantCatalogReadback(event: H3Event, input: {
  tenantId: string
  clientId: string
  sourceId: string
}) {
  return await runGoogleMerchantCatalogAction(event, 'merchant_catalog_readback', input)
}
