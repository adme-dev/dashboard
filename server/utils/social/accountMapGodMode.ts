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

const SOCIAL_ACCOUNT_MAP_ROUTE = '/api/agency/social/spend/map-account'

const SOCIAL_ACCOUNT_MAP = defineGodModeTransactionOperation({
  routeOrTool: `POST ${SOCIAL_ACCOUNT_MAP_ROUTE}`,
  mutationName: 'social account mapping',
  missingResultMessage: 'Social account mapping did not produce a durable result',
  retryableInProgress: true
})

export function isSocialAccountMapPath(path: string): boolean {
  return path === SOCIAL_ACCOUNT_MAP_ROUTE
}

async function prepareSocialAccountMap(event: H3Event) {
  return await prepareGodModeTransactionMutation(event, SOCIAL_ACCOUNT_MAP, {
    transaction,
    appendAudit: appendGodModeAuditEvent,
    digestRequest: async request => await digestMcpRequestBody(await readBody(request))
  })
}

export async function executeGodModeSocialAccountMap<T extends { id: string }>(
  event: H3Event,
  mutate: (db: GodModeTransactionDb) => Promise<T>,
  replay: (db: GodModeTransactionDb, resultReference: string) => Promise<T>
): Promise<T> {
  if (!getGodModeRouteAuditState(event)) return await transaction(mutate)
  return await executeGodModeTransactionMutation(
    event,
    SOCIAL_ACCOUNT_MAP,
    transaction,
    mutate,
    replay
  )
}

export function registerGodModeSocialAccountMapMutationFamily(): () => void {
  return registerGodModeMutationFamily({
    family: 'social-account-map',
    method: 'POST',
    matchesPath: isSocialAccountMapPath,
    prepare: prepareSocialAccountMap
  })
}
