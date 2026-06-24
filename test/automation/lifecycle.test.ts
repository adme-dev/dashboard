// test/automation/lifecycle.test.ts
import { describe, expect, it } from 'vitest'
import {
  resolveStage,
  classifyTransition,
  lifecycleTransitionToEscalation,
  lifecycleDedupeKey,
  filterAlreadyPendingTransitions,
} from '~~/server/utils/automation/lifecycle'

describe('resolveStage', () => {
  it('maps canonical Monday status strings to lifecycle stages + gates', () => {
    expect(resolveStage('Brief Required')).toMatchObject({ key: 'brief', gate: 'auto' })
    expect(resolveStage('Working On It')).toMatchObject({ key: 'production', gate: 'human_only' })
    expect(resolveStage('Active Graphic Design')).toMatchObject({ key: 'production', gate: 'human_only' })
    expect(resolveStage('QA New Campaign')).toMatchObject({ key: 'qa', gate: 'auto' })
    expect(resolveStage('Awaiting Creative Approval')).toMatchObject({ key: 'proofing', gate: 'human_approve' })
    expect(resolveStage('Awaiting Approval')).toMatchObject({ key: 'approval', gate: 'human_approve' })
    expect(resolveStage('Awaiting Client')).toMatchObject({ key: 'approval', gate: 'human_approve' })
    expect(resolveStage('Budget Update')).toMatchObject({ key: 'monitoring', gate: 'human_approve' })
    expect(resolveStage('Check Daily')).toMatchObject({ key: 'monitoring', gate: 'human_approve' })
    expect(resolveStage('Stop Campaign')).toMatchObject({ key: 'monitoring', gate: 'human_approve' })
    expect(resolveStage('Roll This/Next Month')).toMatchObject({ key: 'recurring', gate: 'human_approve' })
    expect(resolveStage('Approved To Be Billed')).toMatchObject({ key: 'billable', gate: 'human_approve' })
    expect(resolveStage('Done')).toMatchObject({ key: 'terminal', gate: 'auto' })
  })

  it('is case/whitespace/punctuation tolerant', () => {
    expect(resolveStage('  awaiting   approval ')).toMatchObject({ key: 'approval' })
    expect(resolveStage('STOP CAMPAIGN')).toMatchObject({ key: 'monitoring' })
    expect(resolveStage("eDM's")).toMatchObject({ key: 'production' })
  })

  it('treats "... Completed <Month>" archive statuses as terminal', () => {
    expect(resolveStage('Meta Completed June')).toMatchObject({ key: 'terminal', gate: 'auto' })
    expect(resolveStage('Google Ads Completed May')).toMatchObject({ key: 'terminal', gate: 'auto' })
  })

  it('falls back to category for generic dashboard statuses (inert — gate auto)', () => {
    expect(resolveStage('To Do', 'not_started')).toMatchObject({ gate: 'auto' })
    expect(resolveStage('In Progress', 'in_progress')).toMatchObject({ gate: 'auto' })
    expect(resolveStage('Review', 'review')).toMatchObject({ gate: 'auto' })
    expect(resolveStage('Done', 'done')).toMatchObject({ key: 'terminal', gate: 'auto' })
  })

  it('prefers the canonical name over the category', () => {
    // A board could store "Awaiting Approval" under an in_progress category — name wins.
    expect(resolveStage('Awaiting Approval', 'in_progress')).toMatchObject({ key: 'approval', gate: 'human_approve' })
  })

  it('resolves unknown strings to a no-op stage (auto, never throws)', () => {
    expect(resolveStage('Some Random Status')).toMatchObject({ key: 'unknown', gate: 'auto' })
    expect(resolveStage(null)).toMatchObject({ key: 'unknown', gate: 'auto' })
    expect(resolveStage(undefined, undefined)).toMatchObject({ key: 'unknown', gate: 'auto' })
  })
})

describe('classifyTransition', () => {
  it('flags entering a 🟡 stage as requiring escalation', () => {
    expect(classifyTransition({ name: 'Working On It' }, { name: 'Awaiting Approval' }).requiresEscalation).toBe(true)
    expect(classifyTransition({ name: 'QA' }, { name: 'Budget Update' }).requiresEscalation).toBe(true)
    expect(classifyTransition({ name: 'Done' }, { name: 'Approved To Be Billed' }).requiresEscalation).toBe(true)
  })

  it('does NOT escalate 🟢 auto or 🔴 human-only destinations', () => {
    expect(classifyTransition({ name: 'Brief Required' }, { name: 'Working On It' }).requiresEscalation).toBe(false) // → 🔴 production
    expect(classifyTransition({ name: 'Awaiting Approval' }, { name: 'Done' }).requiresEscalation).toBe(false) // → terminal
    expect(classifyTransition({ name: 'To Do', category: 'not_started' }, { name: 'In Progress', category: 'in_progress' }).requiresEscalation).toBe(false)
  })

  it('exposes the resolved destination stage', () => {
    const r = classifyTransition({ name: 'QA' }, { name: 'Awaiting Client' })
    expect(r.stage).toMatchObject({ key: 'approval', gate: 'human_approve' })
  })
})

describe('lifecycleTransitionToEscalation', () => {
  it('builds a lifecycle_gate escalation with an advance_stage proposal', () => {
    const e = lifecycleTransitionToEscalation({
      taskId: 't-1', taskTitle: 'Knox GWM EOFY — daily budget', clientId: 'cl-1',
      fromStatus: 'Working On It', toStatus: 'Budget Update',
    })
    expect(e.capability).toBe('lifecycle_gate')
    expect(e.title).toContain('Knox GWM EOFY')
    expect(e.clientId).toBe('cl-1')
    expect(e.runId).toBe('t-1::budget update') // normalized transition key
    expect(e.proposedAction).toMatchObject({ action: 'advance_stage', taskId: 't-1', toStatus: 'Budget Update', stage: 'monitoring' })
    expect(e.detail).toMatchObject({ taskId: 't-1', fromStatus: 'Working On It', toStatus: 'Budget Update', stage: 'monitoring' })
  })

  it('marks spend-touching stages (monitoring/deployment) critical, others warning', () => {
    expect(lifecycleTransitionToEscalation({ taskId: 't', taskTitle: 'x', toStatus: 'Budget Update' }).severity).toBe('critical')
    expect(lifecycleTransitionToEscalation({ taskId: 't', taskTitle: 'x', toStatus: 'Stop Campaign' }).severity).toBe('critical')
    expect(lifecycleTransitionToEscalation({ taskId: 't', taskTitle: 'x', toStatus: 'Awaiting Approval' }).severity).toBe('warning')
    expect(lifecycleTransitionToEscalation({ taskId: 't', taskTitle: 'x', toStatus: 'Approved To Be Billed' }).severity).toBe('warning')
  })

  it('carries the stage owner as the assigned role', () => {
    expect(lifecycleTransitionToEscalation({ taskId: 't', taskTitle: 'x', toStatus: 'Approved To Be Billed' }).assignedRole).toBeTruthy()
  })
})

describe('lifecycleDedupeKey + filterAlreadyPendingTransitions', () => {
  it('builds a stable key from taskId + normalized toStatus', () => {
    expect(lifecycleDedupeKey({ taskId: 't-1', toStatus: 'Budget Update' })).toBe('t-1::budget update')
    expect(lifecycleDedupeKey({ taskId: 't-1', toStatus: '  BUDGET   update ' })).toBe('t-1::budget update')
  })

  it('drops candidates whose key matches an already-pending escalation detail', () => {
    const candidates = [
      lifecycleTransitionToEscalation({ taskId: 't-1', taskTitle: 'a', toStatus: 'Budget Update' }),
      lifecycleTransitionToEscalation({ taskId: 't-2', taskTitle: 'b', toStatus: 'Awaiting Approval' }),
    ]
    const pending = [{ taskId: 't-1', toStatus: 'Budget Update' }]
    const fresh = filterAlreadyPendingTransitions(candidates, pending)
    expect(fresh).toHaveLength(1)
    expect((fresh[0].detail as any).taskId).toBe('t-2')
  })
})
