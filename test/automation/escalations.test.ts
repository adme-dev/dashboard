// test/automation/escalations.test.ts
import { describe, expect, it } from 'vitest'
import {
  buildEscalationInsert,
  canDecide,
  assertDecidable,
  escalationNotificationParams,
  groupEscalations,
} from '~~/server/utils/automation/escalations'

describe('buildEscalationInsert', () => {
  it('normalizes input, defaults severity to warning, JSON-encodes detail', () => {
    const r = buildEscalationInsert({ capability: ' budget_pacing ', title: ' Over-pacing on Knox ' })
    expect(r.capability).toBe('budget_pacing')
    expect(r.title).toBe('Over-pacing on Knox')
    expect(r.severity).toBe('warning')
    expect(r.detail).toBe('{}')
    expect(r.proposed_action).toBeNull()
    expect(r.assigned_role).toBe('AUTOMATION')
    expect(r.client_id).toBeNull()
  })

  it('keeps a valid severity and encodes proposed_action + detail', () => {
    const r = buildEscalationInsert({
      capability: 'budget_pacing',
      title: 'Raise daily budget',
      severity: 'critical',
      clientId: 'c-1',
      detail: { campaign: 'X' },
      proposedAction: { type: 'budget_change', from: 50, to: 80 },
    })
    expect(r.severity).toBe('critical')
    expect(r.client_id).toBe('c-1')
    expect(JSON.parse(r.detail)).toEqual({ campaign: 'X' })
    expect(JSON.parse(r.proposed_action!)).toEqual({ type: 'budget_change', from: 50, to: 80 })
  })

  it('coerces an invalid severity back to warning', () => {
    const r = buildEscalationInsert({ capability: 'c', title: 't', severity: 'bogus' as any })
    expect(r.severity).toBe('warning')
  })

  it('throws when capability or title is missing', () => {
    expect(() => buildEscalationInsert({ capability: '', title: 't' })).toThrow(/capability/)
    expect(() => buildEscalationInsert({ capability: 'c', title: '  ' })).toThrow(/title/)
  })
})

describe('canDecide / assertDecidable', () => {
  it('only pending escalations are decidable', () => {
    expect(canDecide('pending')).toBe(true)
    expect(canDecide('approved')).toBe(false)
    expect(canDecide('rejected')).toBe(false)
    expect(() => assertDecidable('pending')).not.toThrow()
    expect(() => assertDecidable('approved')).toThrow(/pending/)
  })
})

describe('escalationNotificationParams', () => {
  it('builds approval_requested notification params linking to the inbox', () => {
    const p = escalationNotificationParams({
      approverId: 'u-1', escalationId: 'e-1', capability: 'budget_pacing',
      title: 'Raise daily budget', severity: 'critical',
    })
    expect(p.userId).toBe('u-1')
    expect(p.type).toBe('approval_requested')
    expect(p.message).toBe('Raise daily budget')
    expect(p.link).toBe('/agency/automation/escalations?escalation=e-1')
    expect(p.metadata).toMatchObject({ escalationId: 'e-1', capability: 'budget_pacing', kind: 'automation_escalation' })
  })
})

describe('groupEscalations', () => {
  it('groups by severity (critical→warning→info) then client', () => {
    const groups = groupEscalations([
      { id: 'a', severity: 'warning', client_id: 'c1' },
      { id: 'b', severity: 'critical', client_id: 'c1' },
      { id: 'c', severity: 'critical', client_id: 'c2' },
    ] as any)
    expect(groups[0].severity).toBe('critical')
    expect(groups.map(g => g.severity)).toEqual(['critical', 'critical', 'warning'])
    expect(groups[0].items).toHaveLength(1)
  })
})
