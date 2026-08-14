import type { H3Event } from 'h3'
import { queryOneFresh } from '~~/server/utils/db'
import { enqueue } from '~~/server/utils/queue'
import { runGoogleMerchantCatalogReconciliation } from '~~/server/utils/googleMerchantCatalogRemote'

interface CatalogSourceMerchantConfig {
  connection_config: Record<string, unknown>
}

function object(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null
}

/**
 * Schedule the governed Merchant API publication associated with a catalog source.
 * Sources without an active, explicitly opted-in Merchant configuration remain local-only.
 */
export async function enqueueMerchantCatalogReconciliationForSource(
  event: H3Event,
  input: { clientId: string, sourceId: string }
): Promise<boolean> {
  const source = await queryOneFresh<CatalogSourceMerchantConfig>(
    `SELECT connection_config
       FROM crm_catalog_sources
      WHERE id = $1::uuid
        AND client_id = $2::uuid
        AND status = 'active'
      LIMIT 1`,
    [input.sourceId, input.clientId]
  )
  const merchant = object(source?.connection_config?.merchant)
  const tenantId = typeof merchant?.tenant_id === 'string' ? merchant.tenant_id.trim() : ''
  if (merchant?.auto_publish !== true || !tenantId || tenantId.length > 255) return false

  return await enqueue(
    event,
    'merchant.catalog.reconcile',
    { tenantId, clientId: input.clientId, sourceId: input.sourceId },
    async () => {
      await runGoogleMerchantCatalogReconciliation(event, {
        tenantId,
        clientId: input.clientId,
        sourceId: input.sourceId
      })
    }
  )
}
