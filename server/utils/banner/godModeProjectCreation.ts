import type { H3Event } from 'h3'
import { readBody } from 'h3'

import { transaction } from '~~/server/utils/db'
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

const ROUTE = '/api/agency/banner-studio/projects'
const BANNER_PROJECT_CREATION = defineGodModeTransactionOperation({
  routeOrTool: `POST ${ROUTE}`,
  mutationName: 'project creation',
  missingResultMessage: 'Banner project mutation did not produce a durable result'
})

export type GodModeBannerProjectCreationDependencies = GodModeTransactionCoordinatorDependencies

const defaultDependencies: GodModeBannerProjectCreationDependencies = {
  transaction,
  appendAudit: appendGodModeAuditEvent,
  digestRequest: async event => await digestMcpRequestBody(await readBody(event))
}

export async function prepareGodModeBannerProjectCreation(
  event: H3Event,
  dependencies: GodModeBannerProjectCreationDependencies = defaultDependencies
) {
  return await prepareGodModeTransactionMutation(event, BANNER_PROJECT_CREATION, dependencies)
}

async function replayBannerProject<T extends { id: string }>(
  db: GodModeTransactionDb,
  resultReference: string
): Promise<T> {
  const result = await db.query(
    `SELECT id, name, client_id AS "clientId", canvas_data AS "canvasData", thumbnail_url AS "thumbnailUrl", status, tags, created_by AS "createdBy", created_at AS "createdAt", updated_at AS "updatedAt" FROM banner_projects WHERE id = $1`,
    [resultReference]
  )
  if (!result.rows[0]) throw new Error('Replayed banner project no longer exists')
  return result.rows[0] as T
}

export async function executeGodModeBannerProjectCreation<T extends { id: string }>(
  event: H3Event,
  create: (db: GodModeTransactionDb) => Promise<T>,
  replay: (db: GodModeTransactionDb, resultReference: string) => Promise<T> = replayBannerProject
): Promise<T> {
  return await executeGodModeTransactionMutation(event, BANNER_PROJECT_CREATION, transaction, create, replay)
}

export function registerGodModeBannerProjectCreationFamily(
  dependencies: GodModeBannerProjectCreationDependencies = defaultDependencies
): () => void {
  return registerGodModeMutationFamily({
    family: 'banner-project-creation',
    method: 'POST',
    matchesPath: path => path === ROUTE,
    prepare: event => prepareGodModeBannerProjectCreation(event, dependencies)
  })
}
