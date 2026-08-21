import type { H3Event } from 'h3'
import { readBody } from 'h3'

import { transaction } from '~~/server/utils/db'
import { appendGodModeAuditEvent } from '~~/server/utils/godMode/audit'
import { registerGodModeMutationFamily } from '~~/server/utils/godMode/featureGate'
import {
  defineGodModeTransactionOperation,
  executeGodModeTransactionMutation,
  prepareGodModeTransactionMutation,
  type GodModeTransactionDb
} from '~~/server/utils/godMode/transactionCoordinator'
import { digestMcpRequestBody } from '~~/shared/utils/mcpRequestClaim'

const TRACKING_SITE_CREATE_ROUTE = '/api/agency/tracking'

const TRACKING_SITE_CREATE = defineGodModeTransactionOperation({
  routeOrTool: `POST ${TRACKING_SITE_CREATE_ROUTE}`,
  mutationName: 'tracking site creation',
  missingResultMessage: 'Tracking site creation did not produce a durable result',
  retryableInProgress: true
})

export function isTrackingSiteCreatePath(path: string): boolean {
  return path === TRACKING_SITE_CREATE_ROUTE
}

async function prepare(event: H3Event) {
  return await prepareGodModeTransactionMutation(event, TRACKING_SITE_CREATE, {
    transaction,
    appendAudit: appendGodModeAuditEvent,
    digestRequest: async request => await digestMcpRequestBody(await readBody(request))
  })
}

export async function executeGodModeTrackingSiteCreate<T extends { id: string }>(
  event: H3Event,
  mutate: (db: GodModeTransactionDb) => Promise<T>,
  replay: (db: GodModeTransactionDb, resultReference: string) => Promise<T>
): Promise<T> {
  return await executeGodModeTransactionMutation(
    event,
    TRACKING_SITE_CREATE,
    transaction,
    mutate,
    replay
  )
}

export function registerGodModeTrackingSiteMutationFamily(): () => void {
  return registerGodModeMutationFamily({
    family: 'tracking-site-create',
    method: 'POST',
    matchesPath: isTrackingSiteCreatePath,
    prepare
  })
}
