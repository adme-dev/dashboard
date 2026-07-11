import { describe, expect, it } from 'vitest'
import { buildResponsibilityMap } from '../../server/utils/hr/responsibilityMap'

describe('HR responsibility map', () => {
  it('groups active role responsibilities by single, shared, and unowned responsibility', () => {
    const result = buildResponsibilityMap([
      { roleVersionId: 'role-1', roleTitle: 'Account Manager', responsibility: 'Own monthly client reporting', memberId: 'member-1', memberName: 'Alex' },
      { roleVersionId: 'role-2', roleTitle: 'Client Lead', responsibility: 'Own monthly client reporting.', memberId: 'member-2', memberName: 'Blair' },
      { roleVersionId: 'role-1', roleTitle: 'Account Manager', responsibility: 'Maintain client briefs', memberId: 'member-1', memberName: 'Alex' },
      { roleVersionId: 'role-3', roleTitle: 'Operations Lead', responsibility: 'Approve capacity changes', memberId: null, memberName: null },
    ])

    expect(result.summary).toEqual({ total: 3, singleOwner: 1, shared: 1, unowned: 1 })
    expect(result.groups.shared[0]).toMatchObject({
      responsibility: 'Own monthly client reporting',
      classification: 'shared',
      requiresHumanConfirmation: true,
    })
    expect(result.groups.shared[0]?.owners.map(owner => owner.memberName)).toEqual(['Alex', 'Blair'])
    expect(result.groups.unowned[0]?.owners).toEqual([])
  })

  it('does not emit an individual score or performance rating', () => {
    const result = buildResponsibilityMap([
      { roleVersionId: 'role-1', roleTitle: 'Producer', responsibility: 'Coordinate approvals', memberId: 'member-1', memberName: 'Casey' },
    ])

    const entryKeys = Object.values(result.groups).flat().flatMap(entry => Object.keys(entry))
    expect(entryKeys).not.toContain('score')
    expect(entryKeys).not.toContain('rating')
    expect(result.limitations).toContain('This map describes accountability architecture and does not evaluate individual performance.')
  })
})
