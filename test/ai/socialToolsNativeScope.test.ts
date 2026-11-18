import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const native = vi.hoisted(() => ({ value: false }))
vi.mock('~~/server/utils/ai/marketing/nativeAuthority', () => ({ isNativeMarketingContext: () => native.value }))
vi.mock('~~/server/utils/db', async importOriginal => ({ ...await importOriginal<typeof import('~~/server/utils/db')>() }))

const { executeSocialMcpTool } = await import('~~/server/utils/ai/mcp/socialTools')
const key = `mcp:${'a'.repeat(64)}`
const digest = 'b'.repeat(64)
const base = { userId: 'actor', userRole: 'staff', source: 'chat', mcpStaffAuthority: 'fresh', marketingCapabilities: ['social_draft'] } as unknown as ToolContext

type Deps = NonNullable<Parameters<typeof executeSocialMcpTool>[1]>
function deps() {
  const db = { query: vi.fn(async (sql: string) => ({ rows: sql.startsWith('INSERT') ? [{ state: 'in_progress' }] : [], rowCount: 1 })) }
  const transaction = vi.fn(async (cb: (d: typeof db) => Promise<unknown>) => cb(db))
  const run = vi.fn(async () => ({ ok: true as const, data: { postId: 'p1', clientId: 'c1' } }))
  return { transaction, run, replayView: vi.fn(), deps: { transaction, run, replayView: vi.fn() } as unknown as Deps }
}

// Native chat has no OAuth scopes; its actor-bound, click-confirmed context stands in for mcp:write.
describe('social drafts: native chat write scope', () => {
  beforeEach(() => {
    native.value = false
  })
  it('MCP callers without signed mcp:write are still refused', async () => {
    const d = deps()
    const result = await executeSocialMcpTool({ toolName: 'create_social_post_draft', args: {}, ctx: base, userId: 'actor', idempotencyKey: key, sessionDigest: digest }, d.deps)
    expect(result).toMatchObject({ ok: false, code: 'insufficient_scope' })
    expect(d.transaction).not.toHaveBeenCalled()
  })
  it('a native chat actor reaches the ledgered draft write without OAuth scopes', async () => {
    native.value = true
    const d = deps()
    const result = await executeSocialMcpTool({ toolName: 'create_social_post_draft', args: {}, ctx: base, userId: 'actor', idempotencyKey: key, sessionDigest: digest }, d.deps)
    expect(result).toMatchObject({ ok: true })
    expect(d.run).toHaveBeenCalledTimes(1)
  })
  it('a read-only native actor is still refused', async () => {
    native.value = true
    const d = deps()
    const result = await executeSocialMcpTool({ toolName: 'create_social_post_draft', args: {}, ctx: { ...base, assistantReadOnly: true } as ToolContext, userId: 'actor', idempotencyKey: key, sessionDigest: digest }, d.deps)
    expect(result).toMatchObject({ ok: false, code: 'read_only' })
    expect(d.transaction).not.toHaveBeenCalled()
  })
})
