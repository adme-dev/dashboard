/**
 * L2 answer synthesis (spec §4). PURE prompt builder + injected LLM: merge the specialist sub-run
 * results into ONE grounded answer. The synthesizer only combines what the specialists already
 * returned (each RBAC-filtered) — it introduces no new data, so the composed answer can never exceed
 * what the user could retrieve directly (spec §5.1). Fail-safe: on a model error it returns a plain
 * concatenation of the specialist findings so the turn still produces an answer.
 */

export interface SpecialistResult {
  /** The skill-pack (persona key) that produced this. */
  persona: string
  /** That specialist's answer text. */
  text: string
}

export interface SynthesizeDeps {
  complete: (prompt: string) => Promise<string>
}

export function buildSynthesisPrompt(question: string, results: SpecialistResult[]): string {
  const blocks = results.map(r => `### ${r.persona}\n${r.text.trim() || '(no findings)'}`).join('\n\n')
  return [
    'You are the agency co-pilot combining findings from several specialist assistants into ONE answer.',
    'Use ONLY the findings below — do not invent data or add anything a specialist did not report.',
    'Resolve overlaps, connect the dots across domains, and answer the user directly and concisely.',
    'If the findings do not actually answer the question, say so honestly.',
    '',
    `User question: ${question}`,
    '',
    'Specialist findings:',
    blocks,
  ].join('\n')
}

/** Plain fallback when the synthesis model is unavailable — still grounded only in specialist output. */
export function concatFallback(results: SpecialistResult[]): string {
  const usable = results.filter(r => r.text.trim())
  if (usable.length === 0) return 'I looked across the relevant areas but didn’t find anything to report.'
  return usable.map(r => `**${r.persona}:** ${r.text.trim()}`).join('\n\n')
}

export async function synthesizeAnswer(question: string, results: SpecialistResult[], deps: SynthesizeDeps): Promise<string> {
  const usable = results.filter(r => r.text.trim())
  if (usable.length === 0) return concatFallback(results)
  if (usable.length === 1) return usable[0]!.text.trim() // nothing to merge — return the single answer verbatim
  try {
    const out = await deps.complete(buildSynthesisPrompt(question, usable))
    return out.trim() || concatFallback(usable)
  } catch {
    return concatFallback(usable)
  }
}
