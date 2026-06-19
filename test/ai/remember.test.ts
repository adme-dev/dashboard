import { describe, it, expect, vi } from 'vitest'
import { remember, rememberTool, type RememberDeps } from '~~/server/utils/ai/tools/remember'
import { registry } from '~~/server/utils/ai/tools'

const ctx = (userId = 'u1') => ({ userId, userRole: 'media_buyer', conversationId: 'c1', event: {} as any })

describe('remember tool', () => {
  it('saves an explicit, user-scoped, higher-salience memory', async () => {
    const save = vi.fn<RememberDeps['save']>().mockResolvedValue('mem-1')
    const res = await remember({ content: '  prefers ROAS over CPA  ', memType: 'semantic' }, ctx() as any, { save })
    expect(res.ok).toBe(true)
    expect((res as any).data).toMatchObject({ remembered: true, id: 'mem-1', content: 'prefers ROAS over CPA' })
    expect(save).toHaveBeenCalledTimes(1)
    expect(save.mock.calls[0][0]).toEqual({
      userId: 'u1', memType: 'semantic', content: 'prefers ROAS over CPA', source: 'explicit', salience: 0.7,
    })
  })

  it('rejects empty/whitespace content without saving', async () => {
    const save = vi.fn()
    const res = await remember({ content: '   ', memType: 'semantic' }, ctx() as any, { save })
    expect(res.ok).toBe(false)
    expect(save).not.toHaveBeenCalled()
  })

  it('passes through episodic/procedural type', async () => {
    const save = vi.fn().mockResolvedValue('m2')
    await remember({ content: 'monday recap routine', memType: 'procedural' }, ctx() as any, { save })
    expect(save.mock.calls[0][0].memType).toBe('procedural')
  })

  it('is fail-safe: a throwing save returns a recoverable fail(), never propagates (finding #6)', async () => {
    const save = vi.fn<RememberDeps['save']>().mockRejectedValue(new Error('neon blip'))
    const res = await remember({ content: 'reports in AUD', memType: 'semantic' }, ctx() as any, { save })
    expect(res.ok).toBe(false)
  })

  it('is registered and is not a write/confirm tool', () => {
    expect(registry.find(t => t.name === 'remember')).toBeDefined()
    expect(rememberTool.mutates).toBeUndefined()  // private, low-risk → no confirm card
  })
})
