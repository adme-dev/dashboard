import { createError, type H3Event } from 'h3'
import { registerGodModeMutationFamily } from '~~/server/utils/godMode/featureGate'
import { executeGodModeExternalMutation, prepareGodModeExternalMutation } from '~~/server/utils/godMode/externalLedgerCoordinator'
import type { CandidateResult } from './candidates'

const family = { label: 'storyboard planning', coordinationKey: Symbol('storyboardPlanning') }
export function registerGodModeStoryboardPlanningFamily() {
  return registerGodModeMutationFamily({ family: 'video-storyboard-planning', method: 'POST',
    matchesPath: path => /^\/api\/agency\/video\/projects\/[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}\/storyboard\/plan$/i.test(path),
    prepare: event => prepareGodModeExternalMutation(event, family)
  })
}
/** Owner ledger stores only the receipt ID; canonical replay always reauthorizes. */
export async function executeStoryboardPlan(event: H3Event, work: (onDispatch: () => Promise<void>) => Promise<CandidateResult>): Promise<CandidateResult> {
  let result: CandidateResult | undefined
  await executeGodModeExternalMutation(event, family, 1, async (run) => {
    result = await work(run.markDispatched)
    if (run.replay && (run.replayResult as { id?: string } | null)?.id !== result.id) throw createError({ statusCode: 409, statusMessage: 'Storyboard planning receipt mismatch' })
    return { id: result.id }
  })
  return result!
}
