// Validates that the DA pilot status set seeded by migration
// 194_ops_autopilot_da_status_pilot.sql aligns with the lifecycle taxonomy — i.e. each
// seeded status NAME resolves to the intended stage + gate, so once LIFECYCLE_GUARD_ENABLED
// is on, moving a task into a 🟡 status raises the right escalation. Keep in sync with the SQL.
import { describe, it, expect } from 'vitest'
import { resolveStage } from '~~/server/utils/automation/lifecycle'

const PILOT: Array<[name: string, stageKey: string, gate: string]> = [
  ['Brief Required', 'brief', 'auto'],
  ['Copy Required', 'brief', 'auto'],
  ['Working on it', 'production', 'human_only'], // 🔴 human work — not an approval gate, no escalation
  ['QA', 'qa', 'auto'],
  ['Awaiting Creative Approval', 'proofing', 'human_approve'], // 🟡
  ['Awaiting Approval', 'approval', 'human_approve'], // 🟡
  ['Awaiting Client', 'approval', 'human_approve'], // 🟡
  ['Approved', 'approval', 'human_approve'], // 🟡
  ['Check Daily', 'monitoring', 'human_approve'], // 🟡 spend (critical)
  ['Budget Update', 'monitoring', 'human_approve'], // 🟡 spend (critical)
  ['Roll This/Next Month', 'recurring', 'human_approve'], // 🟡
  ['Approved To Be Billed', 'billable', 'human_approve'] // 🟡
]

describe('DA pilot status seed ↔ lifecycle taxonomy', () => {
  it.each(PILOT)('%s → stage "%s" / gate "%s"', (name, stageKey, gate) => {
    const stage = resolveStage(name)
    expect(stage.key).toBe(stageKey)
    expect(stage.gate).toBe(gate)
  })

  it('the legacy triad "Done" still resolves to terminal (not re-seeded)', () => {
    expect(resolveStage('Done').key).toBe('terminal')
  })

  it('seeded "Cancelled" is inert (no escalation): resolves to a non-approve gate', () => {
    expect(resolveStage('Cancelled').gate).not.toBe('human_approve')
  })
})
