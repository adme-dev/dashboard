import type { SpecialistResult } from './synthesize'

/**
 * L2 delegation (spec §4): run each chosen specialist skill-pack as its own scoped tool-loop and
 * collect the results. The runner is injected (the engine passes a closure over `runToolLoop` bound to
 * the turn's ctx/messages, varying only the persona) so this is unit-tested without a model. Each
 * sub-run is independently RBAC-filtered inside the tool loop (defense in depth — the persona allowlist
 * is intersected with the user's permitted tools), so a specialist can never return data the user
 * couldn't get directly. Fan-out is already capped by planSpecialists (MAX_FANOUT).
 *
 * Fault isolation: a specialist that throws yields empty text rather than aborting the others — the
 * synthesizer simply works with whoever succeeded (and degrades to "didn't find anything" if none did).
 */
export interface DelegateDeps {
  runLoop: (persona: string) => Promise<{ text: string }>
}

export async function delegateToSpecialists(personas: string[], deps: DelegateDeps): Promise<SpecialistResult[]> {
  return Promise.all(
    personas.map(async (persona): Promise<SpecialistResult> => {
      try {
        const r = await deps.runLoop(persona)
        return { persona, text: r?.text ?? '' }
      } catch {
        return { persona, text: '' }
      }
    }),
  )
}
