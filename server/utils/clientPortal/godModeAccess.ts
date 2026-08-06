import type { H3Event } from 'h3'
import { readBody } from 'h3'

import { transactionWithoutRetry } from '~~/server/utils/db'
import { appendGodModeAuditEvent } from '~~/server/utils/godMode/audit'
import { registerGodModeMutationFamily } from '~~/server/utils/godMode/featureGate'
import {
  defineGodModeTransactionOperation,
  executeGodModeTransactionMutation,
  prepareGodModeTransactionMutation,
  type GodModeTransactionCoordinatorDependencies,
  type GodModeTransactionDb
} from '~~/server/utils/godMode/transactionCoordinator'
import { digestMcpRequestBody } from '~~/shared/utils/mcpRequestClaim'

const ROUTE = '/api/agency/client-portal/access'
export const CLIENT_PORTAL_ACCESS_UNREPLAYABLE_CODE = 'client_portal_access_unreplayable'
const CLIENT_PORTAL_ACCESS = defineGodModeTransactionOperation({
  routeOrTool: `POST ${ROUTE}`,
  mutationName: 'client portal access',
  missingResultMessage: 'Client portal access mutation did not produce a durable result',
  unreplayableErrorCode: CLIENT_PORTAL_ACCESS_UNREPLAYABLE_CODE,
  retryableInProgress: true
})

export type GodModeClientPortalAccessDependencies = GodModeTransactionCoordinatorDependencies

const defaultDependencies: GodModeClientPortalAccessDependencies = {
  transaction: transactionWithoutRetry,
  appendAudit: appendGodModeAuditEvent,
  digestRequest: async event => await digestMcpRequestBody(await readBody(event))
}

export async function prepareGodModeClientPortalAccess(
  event: H3Event,
  dependencies: GodModeClientPortalAccessDependencies = defaultDependencies
) {
  return await prepareGodModeTransactionMutation(event, CLIENT_PORTAL_ACCESS, dependencies)
}

export async function executeGodModeClientPortalAccess<T extends { id: string }>(
  event: H3Event,
  create: (db: GodModeTransactionDb) => Promise<T>,
  replay?: (db: GodModeTransactionDb, resultReference: string) => Promise<T>
): Promise<T> {
  return await executeGodModeTransactionMutation(
    event,
    CLIENT_PORTAL_ACCESS,
    transactionWithoutRetry,
    create,
    replay
  )
}

export function registerGodModeClientPortalAccessFamily(
  dependencies?: GodModeClientPortalAccessDependencies
): () => void {
  return registerGodModeMutationFamily({
    family: 'client-portal-access',
    method: 'POST',
    matchesPath: path => path === ROUTE,
    prepare: event => prepareGodModeClientPortalAccess(event, dependencies)
  })
}
