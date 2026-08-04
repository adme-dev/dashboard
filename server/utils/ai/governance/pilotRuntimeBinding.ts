import type { PersonalAssistantContext } from '~~/server/utils/ai/personalAssistantContext'

export class PilotUatRuntimeBindingError extends Error {
  readonly code = 'pilot_uat_release_binding_unavailable'

  constructor() {
    super('The exact admitted pilot release is unavailable for this turn.')
    this.name = 'PilotUatRuntimeBindingError'
  }
}

/** Narrow a re-admitted actor context to the one release admitted by durable pilot evidence. */
export function bindPilotUatContext(
  context: PersonalAssistantContext,
  releaseId: string
): PersonalAssistantContext {
  const catalogRows = context.catalogRows.filter(row => row.releaseId === releaseId)
  const activePacks = context.activePacks.filter(pack => pack.releaseId === releaseId && pack.releaseState === 'pilot')
  if (catalogRows.length === 0 || activePacks.length !== 1) throw new PilotUatRuntimeBindingError()
  if (catalogRows.some(row => row.releaseState !== 'pilot' || row.packVersionId !== activePacks[0]!.packVersionId)) {
    throw new PilotUatRuntimeBindingError()
  }
  const catalogInstructionsPreamble = [...new Set(catalogRows
    .map(row => row.instructionsPreamble.trim())
    .filter(Boolean))]
    .join('\n\n')
  return { ...context, activePacks, catalogRows, catalogInstructionsPreamble }
}
