import { describe, expect, it, vi } from 'vitest'
import { lockPageStudioHistoryAuthority } from '~~/server/utils/pageStudio/historyAuthority'
import { mutatePageStudioHistory } from '~~/server/utils/pageStudio/draftHistory'

const ACTOR = '30000000-0000-4000-8000-000000000601'
const scope = { tenantId: 'test', clientId: '10000000-0000-4000-8000-000000000601', siteId: '10000000-0000-4000-8000-000000000602' }
const actor = { role: 'agency' as const, actorId: ACTOR, tenantId: 'test', canEdit: true }
const login = (over: Record<string, unknown> = {}) => ({
  role: 'agency' as const, userId: ACTOR, tokenHash: 'a'.repeat(64), issuedAt: new Date(Date.now() - 1000), expiresAt: new Date(Date.now() + 60_000), ...over
})
// No cookie or authorization header: a supplied proof must never fall back to reading the request.
const event = { node: { req: { headers: {} } }, context: {} } as never

describe('native history authority with a supplied original login', () => {
  it('binds the supplied login and still runs the native session/role/entitlement recheck', async () => {
    const query = vi.fn(async (sql: string) => ({ rows: sql.includes('INSERT INTO page_studio_login_sessions') || sql.includes('FROM page_studio_login_sessions login') ? [{ token_hash: 'a'.repeat(64) }] : [] }))
    const result = await lockPageStudioHistoryAuthority({ query } as never, event, actor, scope, login())
    expect(result.login.tokenHash).toBe('a'.repeat(64))
    const sql = query.mock.calls.map(call => call[0] as string)
    expect(sql.some(s => s.includes('INSERT INTO page_studio_login_sessions'))).toBe(true)
    expect(sql.some(s => s.includes('login.revoked_at IS NULL') && s.includes('sessions_invalidated_at'))).toBe(true)
  })

  it('refuses a revoked or invalidated supplied login through the same SQL', async () => {
    const query = vi.fn(async (sql: string) => ({ rows: sql.includes('INSERT INTO page_studio_login_sessions') ? [{ token_hash: 'a'.repeat(64) }] : [] }))
    await expect(lockPageStudioHistoryAuthority({ query } as never, event, actor, scope, login())).rejects.toMatchObject({ statusCode: 403 })
  })

  it('refuses a supplied login for another user or a client role before any database access', async () => {
    const query = vi.fn()
    for (const bad of [login({ userId: '30000000-0000-4000-8000-000000000699' }), login({ role: 'client' })]) {
      await expect(lockPageStudioHistoryAuthority({ query } as never, event, actor, scope, bad as never)).rejects.toMatchObject({ statusCode: 401 })
    }
    expect(query).not.toHaveBeenCalled()
  })

  it('never accepts a supplied login for restore', async () => {
    const runTransaction = vi.fn()
    await expect(mutatePageStudioHistory({
      actor, siteId: scope.siteId, event, login: login(),
      body: { action: 'restore', checkpointId: 'older', expectedCheckpointId: 'current', requestId: '20000000-0000-4000-8000-000000000601' }
    }, { runTransaction })).rejects.toMatchObject({ statusCode: 403 })
    expect(runTransaction).not.toHaveBeenCalled()
  })
})
