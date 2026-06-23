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

// --- Action planner (consumed by the flag-gated briefGatekeeperRunner) ---------
// Pure: turns a gate decision + brief context into the concrete actions to take.
// The runner executes these; this stays I/O-free and unit-tested.

export interface GatekeeperPlanInput {
  decision: BriefGateDecision
  currentStatus: string
  /** template auto-assign target (brief_templates.auto_assign_to), if any. */
  autoAssignTo?: string | null
  /** brief's current assignee, if any. */
  currentAssignee?: string | null
  /**
   * Whether the brief has any scorable fields. A template with zero real fields scores
   * 100% by vacuous truth — guard against auto-acting (esp. auto-assigning) an empty brief.
   * Defaults true for back-compat.
   */
  hasScorableFields?: boolean
}

export interface GatekeeperPlan {
  /** set the brief to needs_info (null = leave status unchanged). */
  setStatus: 'needs_info' | null
  /** a "request more info" comment body (null = no comment). */
  comment: string | null
  notifySubmitter: boolean
  /** team_member id to auto-assign on pass (null = no assignment). */
  assignTo: string | null
  /** true = nothing to do. */
  noop: boolean
}

const NOOP_PLAN: GatekeeperPlan = { setStatus: null, comment: null, notifySubmitter: false, assignTo: null, noop: true }

export function planGatekeeperActions(input: GatekeeperPlanInput): GatekeeperPlan {
  const { decision, currentStatus } = input

  // A brief with no scorable fields scores 100% vacuously — never auto-act on it.
  if (input.hasScorableFields === false) return { ...NOOP_PLAN }

  if (decision.gate === 'needs_info') {
    const lines = [decision.message]
    if (decision.recommendations.length) {
      lines.push('', 'Suggestions:', ...decision.recommendations.slice(0, 8).map(r => `• ${r}`))
    }
    return {
      setStatus: currentStatus === 'needs_info' ? null : 'needs_info',
      comment: lines.join('\n'),
      notifySubmitter: true,
      assignTo: null,
      noop: false,
    }
  }

  // pass: auto-assign to the template target only if the brief is currently unassigned.
  const assignTo = input.autoAssignTo && !input.currentAssignee ? input.autoAssignTo : null
  return { setStatus: null, comment: null, notifySubmitter: false, assignTo, noop: assignTo === null }
}
