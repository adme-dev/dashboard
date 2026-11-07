import { describe, expect, it, vi } from 'vitest'
import { resolveChatPersona, parseChatPersona } from '~~/server/utils/ai/chatPersona'

describe('personal focus inheritance', () => {
  it.each([
    [undefined, 'finance', 'marketing', 'finance'],
    [null, 'finance', 'marketing', 'marketing'],
    ['general', 'finance', 'marketing', 'general'],
    [undefined, null, 'marketing', 'marketing'],
    [null, 'finance', null, null]
  ])('resolves requested %s with stored %s and personal %s to %s', async (requested, stored, personal, expected) => {
    const db = { queryOne: vi.fn(async () => ({ system_context: { persona: stored } })), execute: vi.fn() }
    expect(await resolveChatPersona({ conversationId: 'conversation', userId: 'staff', requested, personal, persist: true }, db as unknown as NonNullable<Parameters<typeof resolveChatPersona>[1]>)).toBe(expected)
    if (requested === null) {
      expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('- \'persona\''), ['conversation', 'staff'])
    } else if (requested === 'general') {
      expect(db.execute).toHaveBeenCalledWith(expect.stringContaining('jsonb_build_object'), ['conversation', 'general', 'staff'])
    } else {
      expect(db.execute).not.toHaveBeenCalled()
    }
    if (requested === undefined) expect(db.queryOne).toHaveBeenCalledWith(expect.stringContaining('user_id = $2'), ['conversation', 'staff'])
  })
  it.each([null, 'general'])('does not persist requested %s for evaluation turns', async (requested) => {
    const db = { queryOne: vi.fn(), execute: vi.fn() }
    expect(await resolveChatPersona({ conversationId: 'c', userId: 'u', requested, personal: 'marketing', persist: false }, db as unknown as NonNullable<Parameters<typeof resolveChatPersona>[1]>)).toBe(requested ?? 'marketing')
    expect(db.execute).not.toHaveBeenCalled()
  })
  it('distinguishes absent, inherit and explicit General at the transport boundary', () => {
    expect(parseChatPersona(undefined)).toBeUndefined()
    expect(parseChatPersona(null)).toBeNull()
    expect(parseChatPersona('general')).toBe('general')
    for (const invalid of [false, 2, {}, [], '']) expect(() => parseChatPersona(invalid)).toThrow()
  })
})
