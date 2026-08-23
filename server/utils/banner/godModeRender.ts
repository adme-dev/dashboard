// Banner Studio render coordination — a thin adapter over the generic
// external-provider ledger (server/utils/godMode/externalLedgerCoordinator.ts).
// Kept as its own module so the route, plugin and tests keep their contract:
// one reserved job id per requested format, exact error wording unchanged.
import type { H3Event } from 'h3'

import { BannerRenderError } from '~~/server/utils/banner/renderJob'
import type { GodModeAuditEventInput } from '~~/server/utils/godMode/audit'
import {
  defaultExternalLedgerDependencies,
  executeGodModeExternalMutation,
  prepareGodModeExternalMutation,
  type GodModeExternalLedgerDependencies,
  type GodModeExternalMutation
} from '~~/server/utils/godMode/externalLedgerCoordinator'

export type GodModeBannerRenderDependencies = GodModeExternalLedgerDependencies

export const BANNER_RENDER_MUTATION: GodModeExternalMutation = {
  label: 'banner render',
  coordinationKey: Symbol('godModeBannerRender'),
  messages: {
    keyRequired: 'A valid Idempotency-Key header is required for God mode banner renders',
    notReplayable: 'God mode banner render is not safely replayable',
    claimUnavailable: 'Banner render claim unavailable',
    claimChanged: 'Banner render claim ownership changed',
    reservationUnavailable: 'Banner render reservation unavailable',
    checkpointUnavailable: 'Banner render dispatch checkpoint unavailable'
  }
}

export async function prepareGodModeBannerRender(
  event: H3Event,
  dependencies: GodModeBannerRenderDependencies = defaultExternalLedgerDependencies
): Promise<{ strategy: 'task5-execution-ledger', prepared: true, persistTerminal: (terminal: GodModeAuditEventInput) => Promise<void> }> {
  return await prepareGodModeExternalMutation(event, BANNER_RENDER_MUTATION, dependencies)
}

/**
 * Reserve one durable job id per format before any queue send. `render` must
 * mint every job id through `genId` and return them in order; a replay returns
 * the reserved ids without calling `render` at all.
 */
export async function executeGodModeBannerRender(
  event: H3Event,
  formatCount: number,
  render: (genId: () => string, markDispatched: () => Promise<void>) => Promise<{ jobIds: string[] }>
): Promise<{ jobIds: string[] }> {
  const coordinated = Boolean((event.context as Record<PropertyKey, unknown>)[BANNER_RENDER_MUTATION.coordinationKey])
  if (coordinated) {
    if (!Number.isInteger(formatCount) || formatCount < 1) throw new BannerRenderError('formats array is required')
    if (formatCount > 10) throw new BannerRenderError('Max 10 formats per export')
  }
  return await executeGodModeExternalMutation(event, BANNER_RENDER_MUTATION, Math.max(1, Math.min(10, formatCount || 1)), async (run) => {
    if (run.replay) return { jobIds: run.ids }
    let index = 0
    const result = await render(
      () => run.ids[index++] ?? (() => { throw new Error('Banner render identity exhausted') })(),
      run.markDispatched
    )
    if (coordinated && (index !== formatCount || result.jobIds.length !== run.ids.length
      || result.jobIds.some((id, resultIndex) => id !== run.ids[resultIndex]))) {
      throw new Error('Banner render returned an unexpected result')
    }
    return result
  })
}
