import { describe, it, expect, afterEach } from 'vitest'
import { addWorkingDays, isStalled, isC7Enabled, type BriefForC7 } from '~~/server/utils/automation/actionedConfirmation'

const brief = (o: Partial<BriefForC7> = {}): BriefForC7 => ({
  id: 'b1', title: 'Test brief', submitted_by: 'u1', submitted_at: '2026-06-15T00:00:00Z',
  assigned_to: null, assignee_name: null, client_id: null,
  converted_to_task_id: null, converted_to_project_id: null, requested_deadline: null,
  c7_acknowledged_at: null, c7_stall_alerted_at: null, ...o
})

describe('addWorkingDays', () => {
  it('Mon + 1 = Tue', () => { expect(addWorkingDays(new Date('2026-06-15T00:00:00Z'), 1).getUTCDate()).toBe(16) }) // 15 Jun 2026 = Monday
  it('Fri + 1 = Mon (skips weekend)', () => { expect(addWorkingDays(new Date('2026-06-19T00:00:00Z'), 1).getUTCDate()).toBe(22) }) // 19 Jun = Fri → 22 = Mon
})

describe('isC7Enabled', () => {
  const prev = process.env.C7_CONFIRMATION_ENABLED
  afterEach(() => { if (prev === undefined) delete process.env.C7_CONFIRMATION_ENABLED; else process.env.C7_CONFIRMATION_ENABLED = prev })
  it('only "true" enables', () => {
    delete process.env.C7_CONFIRMATION_ENABLED; expect(isC7Enabled()).toBe(false)
    process.env.C7_CONFIRMATION_ENABLED = 'true'; expect(isC7Enabled()).toBe(true)
  })
})

describe('isStalled', () => {
  const now = new Date('2026-06-17T09:00:00Z') // Wed, 2 days after Mon submit
  it('stalled when past 1 working day and untouched', () => { expect(isStalled(brief(), now)).toBe(true) })
  it('not stalled before SLA', () => { expect(isStalled(brief({ submitted_at: '2026-06-17T08:00:00Z' }), now)).toBe(false) })
  it('not stalled once assigned', () => { expect(isStalled(brief({ assigned_to: 'x' }), now)).toBe(false) })
  it('not stalled once converted', () => { expect(isStalled(brief({ converted_to_task_id: 't' }), now)).toBe(false) })
  it('not stalled if already alerted', () => { expect(isStalled(brief({ c7_stall_alerted_at: '2026-06-16T00:00:00Z' }), now)).toBe(false) })
  it('not stalled if already acknowledged', () => { expect(isStalled(brief({ c7_acknowledged_at: '2026-06-16T00:00:00Z' }), now)).toBe(false) })
  it('uses requested_deadline if sooner', () => { expect(isStalled(brief({ submitted_at: '2026-06-16T00:00:00Z', requested_deadline: '2026-06-16T18:00:00Z' }), now)).toBe(true) })
})
