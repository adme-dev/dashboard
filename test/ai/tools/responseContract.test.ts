import { describe, expect, it } from 'vitest'
import {
  buildDataHealth,
  paginateWithCursor,
} from '~~/server/utils/ai/tools/responseContract'

describe('MCP response contract helpers', () => {
  it('distinguishes populated, partial, not-configured, and unavailable data', () => {
    expect(buildDataHealth({ configured: false, expected: 22, withData: 0 })).toEqual({
      dataStatus: 'not_configured',
      coverage: { expected: 22, withData: 0 },
    })
    expect(buildDataHealth({ configured: true, expected: 22, withData: 4 }).dataStatus).toBe('partial')
    expect(buildDataHealth({ configured: true, expected: 22, withData: 22 }).dataStatus).toBe('populated')
    expect(buildDataHealth({ configured: true, available: false, expected: 22, withData: 0 }).dataStatus).toBe('unavailable')
  })

  it('paginates with an opaque cursor and exact totals', () => {
    const rows = Array.from({ length: 25 }, (_, i) => `row-${i}`)
    const first = paginateWithCursor(rows, undefined, 20)
    expect(first.items).toEqual(rows.slice(0, 20))
    expect(first.total).toBe(25)
    expect(first.more).toBe(5)
    expect(first.nextCursor).toBeTruthy()

    const second = paginateWithCursor(rows, first.nextCursor, 20)
    expect(second.items).toEqual(rows.slice(20))
    expect(second.total).toBe(25)
    expect(second.more).toBe(0)
    expect(second.nextCursor).toBeNull()
  })

  it('rejects malformed cursors instead of silently restarting at page one', () => {
    expect(() => paginateWithCursor(['a'], 'not-a-cursor', 20)).toThrow(/cursor/i)
  })
})
