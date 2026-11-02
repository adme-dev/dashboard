import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createConditionDefinition,
  updateConditionDefinition,
  deleteConditionDefinition,
  listConditionDefinitions
} from '../../server/utils/email-marketing/conditionDefinitions'

const mocks = vi.hoisted(() => ({ one: vi.fn(), rows: vi.fn() }))
vi.mock('~~/server/utils/db', () => ({
  queryOne: mocks.one,
  queryRows: mocks.rows
}))
beforeEach(() => vi.clearAllMocks())
describe('client-bound condition catalog storage', () => {
  it('scopes all SQL and stores typed JSON independently of recipients and snapshots', async () => {
    const predicate = { field: 'name', op: 'exists' } as const
    await listConditionDefinitions('client')
    await createConditionDefinition({
      client_id: 'client',
      name: 'Rule',
      predicate
    })
    await updateConditionDefinition('definition', 'client', {
      name: 'Changed',
      predicate
    })
    await deleteConditionDefinition('definition', 'client')
    expect(mocks.rows.mock.calls[0][0]).toContain('WHERE client_id=$1')
    expect(mocks.one.mock.calls[0][1]).toEqual([
      'client',
      'Rule',
      JSON.stringify(predicate)
    ])
    expect(mocks.one.mock.calls[1][0]).toContain('WHERE id=$1 AND client_id=$2')
    expect(mocks.one.mock.calls[1][1]).toEqual([
      'definition',
      'client',
      'Changed',
      JSON.stringify(predicate)
    ])
    expect(mocks.one.mock.calls[2][1]).toEqual(['definition', 'client'])
    for (const call of [...mocks.one.mock.calls, ...mocks.rows.mock.calls])
      expect(call[0]).not.toMatch(/campaign|recipient|subscriber/)
  })
})
