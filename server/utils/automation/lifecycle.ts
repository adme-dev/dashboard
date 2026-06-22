// server/utils/automation/lifecycle.ts
// Pure lifecycle taxonomy + transition classification for the Ops Autopilot spine.
// No I/O — unit-tested. Mirrors the shape of escalations.ts / pacingWatchdog.ts.
//
// The canonical source of truth for the Digital Advertising job lifecycle. Maps a
// task status (the canonical Monday "Status" string, or a generic task_statuses
// category fallback) to a lifecycle {stage, gate, owner}. See
// docs/superpowers/specs/2026-06-23-ops-autopilot-phaseA3-lifecycle-state-machine-design.md
//
// Fail-open by construction: an unknown status resolves to a no-op (gate 'auto').
// The guard that consumes this can only ADD an escalation, never reject a transition.

import type { EscalationInput, EscalationSeverity } from '~~/server/utils/automation/escalations'

export type LifecycleGate = 'auto' | 'human_approve' | 'human_only' // 🟢 / 🟡 / 🔴

export interface LifecycleStage {
  key: string
  label: string
  owner: string
  gate: LifecycleGate
}

// The 11-stage spine (parent spec §3) plus recurring/terminal/generic/unknown.
const STAGES: Record<string, LifecycleStage> = {
  brief:        { key: 'brief',        label: 'Brief / intake',   owner: 'account_manager',   gate: 'auto' },          // 🟢→🟡 C5 gatekeeper (later)
  create:       { key: 'create',       label: 'Create job',       owner: 'account_manager',   gate: 'auto' },
  traffic:      { key: 'traffic',      label: 'Traffic / assign', owner: 'traffic_controller', gate: 'auto' },
  production:   { key: 'production',   label: 'Production',        owner: 'producer',          gate: 'human_only' },    // 🔴
  qa:           { key: 'qa',           label: 'Internal QA',      owner: 'ads_ops',           gate: 'auto' },          // 🟢→🟡 C3 lint gate (later)
  proofing:     { key: 'proofing',     label: 'Proofing',         owner: 'account_manager',   gate: 'human_approve' }, // 🟡
  approval:     { key: 'approval',     label: 'Approval',         owner: 'approver',          gate: 'human_approve' }, // 🟡
  deployment:   { key: 'deployment',   label: 'Deployment',       owner: 'media_buyer',       gate: 'human_approve' }, // 🟡 spend
  monitoring:   { key: 'monitoring',   label: 'Live monitoring',  owner: 'ads_ops',           gate: 'human_approve' }, // 🟡 spend (budget/stop)
  reporting:    { key: 'reporting',    label: 'Reporting',        owner: 'account_manager',   gate: 'auto' },          // 🟢
  billable:     { key: 'billable',     label: 'Billable',         owner: 'approver',          gate: 'human_approve' }, // 🟡
  recurring:    { key: 'recurring',    label: 'Monthly roll-over', owner: 'ads_ops',          gate: 'human_approve' }, // 🟡 C6
  terminal:     { key: 'terminal',     label: 'Done',             owner: '',                  gate: 'auto' },          // 🟢
  generic:      { key: 'generic',      label: 'Generic',          owner: '',                  gate: 'auto' },          // dashboard category fallback
  unknown:      { key: 'unknown',      label: 'Unknown',          owner: '',                  gate: 'auto' },          // no-op
}

// Spend-touching stages always escalate at critical severity (mirrors C1 watchdog).
const SPEND_STAGES = new Set(['deployment', 'monitoring'])

// Canonical Monday status string (normalized) → stage key.
const STATUS_TO_STAGE: Record<string, string> = {
  // 1 Brief / intake
  'brief required': 'brief',
  'copy required': 'brief',
  'awaiting assets': 'brief',
  'awaiting oem offers': 'brief',
  // 4 Production
  'working on it': 'production',
  'active graphic design': 'production',
  'active web projects': 'production',
  'edms': 'production',
  'edm': 'production',
  'prep final file': 'production',
  'upload': 'production',
  // 5 Internal QA
  'qa': 'qa',
  'qa new campaign': 'qa',
  'designer qa': 'qa',
  'review required': 'qa',
  // 6 Proofing
  'awaiting creative approval': 'proofing',
  // 7 Approval
  'awaiting approval': 'approval',
  'awaiting client': 'approval',
  'approved': 'approval',
  // 9 Live monitoring (spend)
  'check daily': 'monitoring',
  'budget update': 'monitoring',
  'stop campaign': 'monitoring',
  // recurring
  'roll this/next month': 'recurring',
  'roll this month': 'recurring',
  'roll next month': 'recurring',
  // 11 Billable
  'approved to be billed': 'billable',
  'checked': 'billable',
  'query for alicia': 'billable',
  // terminal
  'done': 'terminal',
}

const CATEGORY_TO_STAGE: Record<string, string> = {
  not_started: 'generic',
  in_progress: 'generic',
  review: 'generic',
  done: 'terminal',
  cancelled: 'generic',
}

/** Normalize a status/name: lowercase, trim, collapse internal whitespace, strip trailing punctuation. */
export function normalizeStatus(s?: string | null): string {
  return (s ?? '')
    .toLowerCase()
    .replace(/['’]/g, '') // eDM's → edms
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/[.\s]+$/g, '')
}

const UNKNOWN_STAGE: LifecycleStage = STAGES.unknown!

/** Look a stage up by key, falling back to the no-op 'unknown' stage. Never undefined. */
function stageByKey(key?: string | null): LifecycleStage {
  if (!key) return UNKNOWN_STAGE
  return STAGES[key] ?? UNKNOWN_STAGE
}

/**
 * Resolve a status to its lifecycle stage. Name (canonical Monday string) wins;
 * falls back to the coarse task_statuses category; else 'unknown' (no-op, gate auto).
 * Never throws.
 */
export function resolveStage(statusName?: string | null, category?: string | null): LifecycleStage {
  const norm = normalizeStatus(statusName)
  if (norm) {
    const direct = STATUS_TO_STAGE[norm]
    if (direct) return stageByKey(direct)
    // "<Platform> Completed <Month>" archive variants → terminal
    if (norm.includes('completed')) return stageByKey('terminal')
  }
  const cat = (category ?? '').toLowerCase().trim()
  if (cat) return stageByKey(CATEGORY_TO_STAGE[cat])
  return UNKNOWN_STAGE
}

export interface TransitionEnd { name?: string | null; category?: string | null }

/**
 * Classify a status transition. requiresEscalation is true iff the destination
 * stage is a 🟡 human-approve gate. 🟢 (auto) and 🔴 (human_only) never escalate
 * here — 🔴 is human work, not an approval gate; auto-advance of 🟢 is gap-filler G2.
 */
export function classifyTransition(
  from: TransitionEnd,
  to: TransitionEnd,
): { stage: LifecycleStage; fromStage: LifecycleStage; requiresEscalation: boolean } {
  const fromStage = resolveStage(from?.name, from?.category)
  const stage = resolveStage(to?.name, to?.category)
  return { stage, fromStage, requiresEscalation: stage.gate === 'human_approve' }
}

export interface LifecycleTransitionArgs {
  taskId: string
  taskTitle: string
  toStatus: string
  fromStatus?: string | null
  clientId?: string | null
}

/** Build the A.1 escalation for a 🟡 lifecycle transition (mirrors pacingItemToEscalation). */
export function lifecycleTransitionToEscalation(args: LifecycleTransitionArgs): EscalationInput {
  const stage = resolveStage(args.toStatus)
  const severity: EscalationSeverity = SPEND_STAGES.has(stage.key) ? 'critical' : 'warning'
  return {
    capability: 'lifecycle_gate',
    title: `${stage.label} gate: ${args.taskTitle}`,
    severity,
    clientId: args.clientId ?? null,
    runId: dedupeKey({ taskId: args.taskId, toStatus: args.toStatus }),
    detail: {
      taskId: args.taskId,
      fromStatus: args.fromStatus ?? null,
      toStatus: args.toStatus,
      stage: stage.key,
      owner: stage.owner,
    },
    proposedAction: { action: 'advance_stage', taskId: args.taskId, toStatus: args.toStatus, stage: stage.key },
    assignedRole: stage.owner || 'AUTOMATION',
  }
}

export function dedupeKey(d: { taskId?: string | null; toStatus?: string | null }): string {
  return `${d.taskId ?? ''}::${normalizeStatus(d.toStatus)}`
}

export function filterAlreadyPending(
  candidates: EscalationInput[],
  pendingDetails: Array<Record<string, any>>,
): EscalationInput[] {
  const seen = new Set(pendingDetails.map(d => dedupeKey({ taskId: d.taskId, toStatus: d.toStatus })))
  return candidates.filter((c) => {
    const det = (c.detail ?? {}) as Record<string, any>
    return !seen.has(dedupeKey({ taskId: det.taskId, toStatus: det.toStatus }))
  })
}
