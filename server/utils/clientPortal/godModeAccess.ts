import type { H3Event } from 'h3'
import { readBody } from 'h3'

import {
  prepareGodModeBannerProjectCreation,
  type GodModeBannerProjectCreationDependencies
} from '~~/server/utils/banner/godModeProjectCreation'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { appendGodModeAuditEvent } from '~~/server/utils/godMode/audit'
import { registerGodModeMutationFamily } from '~~/server/utils/godMode/featureGate'
import { digestMcpRequestBody } from '~~/shared/utils/mcpRequestClaim'

const ROUTE = '/api/agency/client-portal/access'

export type GodModeClientPortalAccessDependencies = GodModeBannerProjectCreationDependencies

const defaultDependencies: GodModeClientPortalAccessDependencies = {
  transaction: transactionWithoutRetry,
  appendAudit: appendGodModeAuditEvent,
  digestRequest: async event => await digestMcpRequestBody(await readBody(event))
}

export async function prepareGodModeClientPortalAccess(
  event: H3Event,
  dependencies: GodModeClientPortalAccessDependencies = defaultDependencies
) {
  return await prepareGodModeBannerProjectCreation(event, dependencies)
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
