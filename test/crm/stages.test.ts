import { describe, it, expect } from 'vitest'
import { resolveStages, type StageRow } from '~~/server/utils/crm/stages'

const globals: StageRow[] = [
  { id: 'g1', client_id: null, code: 'new', sort_order: 1 },
  { id: 'g2', client_id: null, code: 'won', sort_order: 5 },
]

describe('resolveStages', () => {
  it('returns globals sorted when client has no custom stages', () => {
    expect(resolveStages(globals, []).map(s => s.code)).toEqual(['new', 'won'])
  })
  it('prefers client stages entirely when any exist', () => {
    const client: StageRow[] = [{ id: 'c1', client_id: 'X', code: 'lead', sort_order: 1 }]
    expect(resolveStages(globals, client).map(s => s.code)).toEqual(['lead'])
  })
  it('sorts by sort_order', () => {
    const unsorted: StageRow[] = [
      { id: 'a', client_id: null, code: 'b', sort_order: 2 },
      { id: 'c', client_id: null, code: 'a', sort_order: 1 },
    ]
    expect(resolveStages(unsorted, []).map(s => s.code)).toEqual(['a', 'b'])
  })
})
