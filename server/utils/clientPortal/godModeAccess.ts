import type { H3Event } from 'h3'

import {
  prepareGodModeBannerProjectCreation,
  type GodModeBannerProjectCreationDependencies
} from '~~/server/utils/banner/godModeProjectCreation'
import { registerGodModeMutationFamily } from '~~/server/utils/godMode/featureGate'

const ROUTE = '/api/agency/client-portal/access'

export type GodModeClientPortalAccessDependencies = GodModeBannerProjectCreationDependencies

export async function prepareGodModeClientPortalAccess(
  event: H3Event,
  dependencies?: GodModeClientPortalAccessDependencies
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
