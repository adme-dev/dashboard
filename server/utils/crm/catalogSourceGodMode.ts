import type { H3Event } from 'h3'
import { readBody } from 'h3'

import { transaction } from '~~/server/utils/db'
import { appendGodModeAuditEvent } from '~~/server/utils/godMode/audit'
import {
  getGodModeRouteAuditState,
  registerGodModeMutationFamily
} from '~~/server/utils/godMode/featureGate'
import {
  defineGodModeTransactionOperation,
  executeGodModeTransactionMutation,
  prepareGodModeTransactionMutation,
  type GodModeTransactionDb
} from '~~/server/utils/godMode/transactionCoordinator'
import { digestMcpRequestBody } from '~~/shared/utils/mcpRequestClaim'

const CATALOG_SOURCE_ROUTE = '/api/crm/data-sources'

const CATALOG_SOURCE_UPSERT = defineGodModeTransactionOperation({
  routeOrTool: `POST ${CATALOG_SOURCE_ROUTE}`,
  mutationName: 'catalog source connection',
  missingResultMessage: 'Catalog source connection did not produce a durable result',
  retryableInProgress: true
})

export function isCatalogSourceUpsertPath(path: string): boolean {
  return path === CATALOG_SOURCE_ROUTE
}

async function prepareCatalogSourceUpsert(event: H3Event) {
  return await prepareGodModeTransactionMutation(event, CATALOG_SOURCE_UPSERT, {
    transaction,
    appendAudit: appendGodModeAuditEvent,
    digestRequest: async request => await digestMcpRequestBody(await readBody(request))
  })
}

export async function executeGodModeCatalogSourceUpsert<T extends { id: string }>(
  event: H3Event,
  mutate: (db: GodModeTransactionDb) => Promise<T>,
  replay: (db: GodModeTransactionDb, resultReference: string) => Promise<T>
): Promise<T> {
  if (!getGodModeRouteAuditState(event)) return await transaction(mutate)
  return await executeGodModeTransactionMutation(
    event,
    CATALOG_SOURCE_UPSERT,
    transaction,
    mutate,
    replay
  )
}

export function registerGodModeCatalogSourceMutationFamily(): () => void {
  return registerGodModeMutationFamily({
    family: 'catalog-source-upsert',
    method: 'POST',
    matchesPath: isCatalogSourceUpsertPath,
    prepare: prepareCatalogSourceUpsert
  })
}
