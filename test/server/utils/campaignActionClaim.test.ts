import { describe, it, expect, vi } from 'vitest'
import { claimApprovedAction, releaseActionClaim } from '~~/server/utils/campaignActionClaim'

describe('claimApprovedAction', () => {
  it('claims an approved action and returns true (guards on action_status = approved)', async () => {
    const queryOne = vi.fn().mockResolvedValue({ id: 'a1' })
    const claimed = await claimApprovedAction({ queryOne }, 'a1')
    expect(claimed).toBe(true)
    const [sql, params] = queryOne.mock.calls[0]
    expect(sql).toMatch(/SET\s+action_status\s*=\s*'executing'/i)
    // Must only claim a row still in 'approved' — the atomic-claim guard.
    expect(sql).toMatch(/WHERE\s+id\s*=\s*\$1\s+AND\s+action_status\s*=\s*'approved'/i)
    expect(sql).toMatch(/RETURNING\s+id/i)
    expect(params).toEqual(['a1'])
  })

  it('returns false when no approved row matched (already claimed/applied/etc.)', async () => {
    const queryOne = vi.fn().mockResolvedValue(null)
    const claimed = await claimApprovedAction({ queryOne }, 'a1')
    expect(claimed).toBe(false)
  })
})

describe('releaseActionClaim', () => {
  it('releases only a row we still hold (executing → approved)', async () => {
    const execute = vi.fn().mockResolvedValue(1)
    await releaseActionClaim({ execute }, 'a1')
    const [sql, params] = execute.mock.calls[0]
    expect(sql).toMatch(/SET\s+action_status\s*=\s*'approved'/i)
    expect(sql).toMatch(/WHERE\s+id\s*=\s*\$1\s+AND\s+action_status\s*=\s*'executing'/i)
    expect(params).toEqual(['a1'])
  })
})
