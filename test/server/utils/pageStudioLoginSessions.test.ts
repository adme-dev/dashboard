import type { H3Event } from 'h3'
import { describe, expect, it, vi } from 'vitest'
import { createJwt } from '~~/server/utils/auth'
import { resolvePageStudioLoginSession } from '~~/server/utils/pageStudio/loginSessions'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'

vi.mock('~~/server/utils/db', () => ({ transaction: vi.fn(), queryOne: vi.fn(), queryOneFresh: vi.fn(), execute: vi.fn(), queryRows: vi.fn() }))
const db = { query: vi.fn() }
const event = (cookie?: string, authorization?: string) => ({ node: { req: { headers: { cookie, authorization } } }, context: {} }) as unknown as H3Event
const userId = '30000000-0000-4000-8000-000000000301'

describe('Studio originating login identity', () => {
  it.each(['.ignored', '\n'])('rejects a signature-equivalent token alias %j', async (suffix) => {
    const token = await createJwt({ userId })
    await expect(resolvePageStudioLoginSession(db, event(undefined, `Bearer ${token}${suffix}`), 'agency', userId))
      .rejects.toMatchObject({ statusCode: 401 })
  })
  it('prefers the authenticated cookie over a stale bearer header', async () => {
    const token = await createJwt({ userId })
    const other = await createJwt({ userId: 'other-user' })
    const login = await resolvePageStudioLoginSession(db, event(`auth_token=${encodeURIComponent(token)}`, `Bearer ${other}`), 'agency', userId)
    expect(login.tokenHash).toBe(await digestPortalSessionToken(token))
    expect(login.userId).toBe(userId)
  })
  it('rejects another actor even with a correctly signed login', async () => {
    const token = await createJwt({ userId: 'other-user' })
    await expect(resolvePageStudioLoginSession(db, event(undefined, `Bearer ${token}`), 'agency', userId))
      .rejects.toMatchObject({ statusCode: 401 })
  })
  it('cannot mint a browser grant from trusted context alone', async () => {
    await expect(resolvePageStudioLoginSession(db, { ...event(), context: { user: { id: userId } } } as never, 'agency', userId))
      .rejects.toMatchObject({ statusCode: 401 })
  })
  it('rejects missing native portal sessions', async () => {
    db.query.mockResolvedValueOnce({ rows: [] })
    await expect(resolvePageStudioLoginSession(db, event('client_session_token=unknown'), 'client', userId))
      .rejects.toMatchObject({ statusCode: 401 })
  })
})
