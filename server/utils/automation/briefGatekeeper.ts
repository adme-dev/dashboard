// server/utils/automation/briefGatekeeper.ts
// Pure brief-completeness GATE decision for the Ops Autopilot spine (capability C5,
// the "Elena" brief gatekeeper). No I/O — unit-tested. Mirrors the shape of
// pacingWatchdog.ts: a pure decision over an already-computed signal.
//
// The completeness SCORE is computed elsewhere (server/utils/aiBriefScoring.ts,
// scoreBriefCompleteness). This module turns that score into a pass / needs-info
// GATE decision + the list of missing required fields + a human-readable message.
// The WRITE side (auto-set needs_info / auto-assign at intake) is a deferred,
// flag-gated follow-on — this module only decides, it never writes.

import type { BriefCompletenessScore } from '~~/server/utils/aiBriefScoring'

export type BriefGate = 'pass' | 'needs_info'

export interface BriefGateDecision {
  gate: BriefGate
  threshold: number
  /** true = every required field has a non-empty value (presence, not adequacy). */
  requiredComplete: boolean
  /** required fields with no value at all (score 0). Weak-but-filled fields are NOT listed. */
  missingRequired: Array<{ fieldKey: string; fieldLabel: string }>
  /** carried through from the scorer (required + a few optional suggestions). */
  recommendations: string[]
  /** human-readable summary for a "request info" comment or a pass note. */
  message: string
}

// Overall quality floor (scorer weights required 40% + optional 20% + quality 40%).
// A brief must clear this AND have all required fields present to pass the gate.
export const DEFAULT_BRIEF_GATE = { minOverall: 70 } as const

export function decideBriefGate(
  score: BriefCompletenessScore,
  opts: { minOverall?: number } = {},
): BriefGateDecision {
  const threshold = opts.minOverall ?? DEFAULT_BRIEF_GATE.minOverall

  const missingRequired = score.fieldScores
    .filter(f => f.isRequired && f.score === 0)
    .map(f => ({ fieldKey: f.fieldKey, fieldLabel: f.fieldLabel }))

  const requiredComplete = score.breakdown.requiredFieldsScore >= 100 && missingRequired.length === 0
  const qualityMet = score.overall >= threshold
  const gate: BriefGate = requiredComplete && qualityMet ? 'pass' : 'needs_info'

  let message: string
  if (gate === 'pass') {
    message = 'Brief is complete and ready to action.'
  } else if (!requiredComplete) {
    const labels = missingRequired.map(f => `"${f.fieldLabel}"`).join(', ')
    message = `Brief needs more info before it can be actioned — ${missingRequired.length} required field(s) missing: ${labels}.`
  } else {
    message = `Brief has all required fields but its detail/quality is below the bar (overall ${score.overall}/${threshold}). Add more detail before actioning.`
  }

  return {
    gate,
    threshold,
    requiredComplete,
    missingRequired,
    recommendations: score.recommendations,
    message,
  }
}
