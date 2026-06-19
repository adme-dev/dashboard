import { describe, it, expect, vi } from 'vitest'
import {
  upsertMemory, getMemoriesByIds, listRecentMemories, stampUsed, deleteUserMemory, markEmbedded,
  REINFORCE_STEP, type MemoryDb,
} from '~~/server/utils/ai/memory/store'

const fakeDb = (over: Partial<MemoryDb> = {}): MemoryDb => ({
  queryOne: vi.fn().mockResolvedValue({ id: 'm1' }),
  queryRows: vi.fn().mockResolvedValue([]),
  execute: vi.fn().mockResolvedValue(undefined),
  ...over,
})

describe('upsertMemory', () => {
  it('inserts with defaults and returns the id', async () => {
    const db = fakeDb()
    const id = await upsertMemory({ userId: 'u1', memType: 'semantic', content: 'prefers ROAS' }, db)
    expect(id).toBe('m1')
    const params = (db.queryOne as any).mock.calls[0][1]
    // [userId, scope, memType, content, source, salience, metadata, reinforceStep]
    expect(params[0]).toBe('u1')
    expect(params[1]).toBe('user')          // default scope
    expect(params[2]).toBe('semantic')
    expect(params[3]).toBe('prefers ROAS')
    expect(params[4]).toBe('inferred')      // default source
    expect(params[5]).toBe(0.5)             // default salience
    expect(params[7]).toBe(REINFORCE_STEP)  // reinforcement on conflict
  })

  it('honors explicit scope/source/salience', async () => {
    const db = fakeDb()
    await upsertMemory({ userId: 'u1', memType: 'procedural', content: 'monday routine', scope: 'org', source: 'explicit', salience: 0.9 }, db)
    const params = (db.queryOne as any).mock.calls[0][1]
    expect(params[1]).toBe('org')
    expect(params[4]).toBe('explicit')
    expect(params[5]).toBe(0.9)
  })

  it('throws if the insert returns no row', async () => {
    const db = fakeDb({ queryOne: vi.fn().mockResolvedValue(null) })
    await expect(upsertMemory({ userId: 'u1', memType: 'semantic', content: 'x' }, db)).rejects.toThrow()
  })
})

describe('getMemoriesByIds', () => {
  it('short-circuits on empty ids without querying', async () => {
    const db = fakeDb()
    expect(await getMemoriesByIds([], db)).toEqual([])
    expect(db.queryRows).not.toHaveBeenCalled()
  })
  it('queries by id array scoped to the owner (uuid-cast + user_id predicate)', async () => {
    const db = fakeDb({ queryRows: vi.fn().mockResolvedValue([{ id: 'm1' }]) })
    const rows = await getMemoriesByIds(['m1', 'm2'], 'u1', db)
    expect(rows).toHaveLength(1)
    expect((db.queryRows as any).mock.calls[0][0]).toContain('user_id = $2')
    expect((db.queryRows as any).mock.calls[0][0]).toContain('$1::uuid[]')
    expect((db.queryRows as any).mock.calls[0][1]).toEqual([['m1', 'm2'], 'u1'])
  })

  it('returns [] without querying when userId is missing (never an unscoped read)', async () => {
    const db = fakeDb()
    expect(await getMemoriesByIds(['m1'], '', db)).toEqual([])
    expect(db.queryRows).not.toHaveBeenCalled()
  })
})

describe('listRecentMemories', () => {
  it('scopes by user and passes the limit', async () => {
    const db = fakeDb()
    await listRecentMemories('u7', 5, db)
    expect((db.queryRows as any).mock.calls[0][1]).toEqual(['u7', 5])
    expect((db.queryRows as any).mock.calls[0][0]).toContain('user_id = $1')
  })
})

describe('stampUsed', () => {
  it('no-ops on empty ids', async () => {
    const db = fakeDb()
    await stampUsed([], db)
    expect(db.execute).not.toHaveBeenCalled()
  })
  it('updates last_used_at for the given ids', async () => {
    const db = fakeDb()
    await stampUsed(['m1'], db)
    expect((db.execute as any).mock.calls[0][1]).toEqual([['m1']])
  })
})

describe('markEmbedded', () => {
  it('stamps the embedding_id on the row', async () => {
    const db = fakeDb()
    await markEmbedded('m1', 'm1', db)
    expect((db.execute as any).mock.calls[0][0]).toContain('embedding_id = $2')
    expect((db.execute as any).mock.calls[0][1]).toEqual(['m1', 'm1'])
  })
})

describe('deleteUserMemory', () => {
  it('deletes scoped strictly to the user', async () => {
    const db = fakeDb()
    await deleteUserMemory('u1', db)
    expect((db.execute as any).mock.calls[0][0]).toContain('WHERE user_id = $1')
    expect((db.execute as any).mock.calls[0][1]).toEqual(['u1'])
  })
})
