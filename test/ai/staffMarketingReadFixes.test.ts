import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { z } from 'zod'

const db = vi.hoisted(() => ({ queryRowsFresh: vi.fn() }))
vi.mock('~~/server/utils/db', async orig => ({ ...(await orig<object>()), queryRowsFresh: db.queryRowsFresh }))
vi.mock('~~/server/utils/ai/marketing/readScope', async orig => ({
  ...(await orig<object>()),
  requireMarketingReadPermission: () => undefined,
  clientScopeSql: () => 'TRUE'
}))

const { resolveScopedClient } = await import('~~/server/utils/ai/marketing/clientReads')
const { runReadToolHandler } = await import('~~/server/utils/ai/mcp/project')
const { adspendTool } = await import('~~/server/utils/ai/tools/adspend')

describe('staff marketing read fixes (Garrix failures 2026-11-18/19)', () => {
  it('pacing is a media-buying read, not a FINANCE-gated one', () => {
    expect(adspendTool.requiredPermission).toBe('MEDIA_BUYING')
  })

  it('an exact client name wins over another client\'s identical alias', async () => {
    db.queryRowsFresh.mockResolvedValueOnce([
      { id: 'group', name: 'Brighton Auto Group', aliases: ['Brighton GWM'] },
      { id: 'dealer', name: 'Brighton GWM', aliases: [] }
    ])
    expect((await resolveScopedClient({} as never, 'brighton gwm'))?.id).toBe('dealer')
  })

  it('still refuses a genuinely ambiguous alias', async () => {
    db.queryRowsFresh.mockResolvedValueOnce([
      { id: 'a', name: 'Alpha Group', aliases: ['Shared'] },
      { id: 'b', name: 'Beta Group', aliases: ['Shared'] }
    ])
    await expect(resolveScopedClient({} as never, 'Shared')).rejects.toThrow('Multiple clients match')
  })

  it('bad_args names the offending field and handler failures keep their reason code', async () => {
    const tool = { name: 't', parameters: z.object({ windowDays: z.literal(30) }), handler: vi.fn(async () => ({ ok: false, error: 'none', code: 'SEARCH_TERMS_UNAVAILABLE' })) }
    const bad = await runReadToolHandler(tool as never, { windowDays: 45 }, {} as never)
    expect(bad).toMatchObject({ ok: false, code: 'bad_args' })
    expect((bad as { error: string }).error).toContain('windowDays')
    expect(await runReadToolHandler(tool as never, { windowDays: 30 }, {} as never))
      .toMatchObject({ ok: false, code: 'handler_error', reason: 'SEARCH_TERMS_UNAVAILABLE' })
  })

  it('failed MCP calls audit fixed error codes only', () => {
    const src = readFileSync('server/api/internal/mcp/call.post.ts', 'utf8')
    expect(src).toContain('...(outcome.ok ? {} : auditErrorFields(outcome))')
    expect(src).toMatch(/\[A-Za-z0-9_\.:-\]\{1,64\}/)
  })
})
