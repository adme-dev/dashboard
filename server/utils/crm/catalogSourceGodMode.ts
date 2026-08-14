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
const UUID = '[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}'
const CATALOG_SOURCE_SYNC_ROUTE = new RegExp(
  `^${CATALOG_SOURCE_ROUTE}/${UUID}/sync$`,
  'i'
)

const CATALOG_SOURCE_UPSERT = defineGodModeTransactionOperation({
  routeOrTool: `POST ${CATALOG_SOURCE_ROUTE}`,
  mutationName: 'catalog source connection',
  missingResultMessage: 'Catalog source connection did not produce a durable result',
  retryableInProgress: true
})

export function isCatalogSourceUpsertPath(path: string): boolean {
  return path === CATALOG_SOURCE_ROUTE
}

export function isCatalogSourceSyncPath(path: string): boolean {
  return CATALOG_SOURCE_SYNC_ROUTE.test(path)
}

async function prepareCatalogSourceUpsert(event: H3Event) {
  return await prepareGodModeTransactionMutation(event, CATALOG_SOURCE_UPSERT, {
    transaction,
    appendAudit: appendGodModeAuditEvent,
    digestRequest: async request => await digestMcpRequestBody(await readBody(request))
  })
}

async function prepareCatalogSourceSync() {
  return {
    strategy: 'task5-execution-ledger' as const,
    prepared: true as const,
    persistTerminal: async (terminal: Parameters<typeof appendGodModeAuditEvent>[0]) => {
      await appendGodModeAuditEvent(terminal)
    }
  }
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
  const unregisterUpsert = registerGodModeMutationFamily({
    family: 'catalog-source-upsert',
    method: 'POST',
    matchesPath: isCatalogSourceUpsertPath,
    prepare: prepareCatalogSourceUpsert
  })
  const unregisterSync = registerGodModeMutationFamily({
    family: 'catalog-source-sync',
    method: 'POST',
    matchesPath: isCatalogSourceSyncPath,
    prepare: prepareCatalogSourceSync
  })
  return () => {
    unregisterSync()
    unregisterUpsert()
  }
}
