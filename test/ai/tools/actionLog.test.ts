import { describe, expect, it, vi } from 'vitest'
import { getActionLog } from '~~/server/utils/ai/tools/actionLog'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const owner = { userId: '11111111-1111-4111-8111-111111111111', userRole: 'owner', source: 'mcp', event: {} as any } as ToolContext

describe('get_action_log', () => {
  it('returns the immutable God Mode MCP ledger with standalone filters', async () => {
    const inspect = vi.fn().mockResolvedValue([{
      correlationId: 'c1', toolName: 'generate_banner_image', arguments: { clientId: '[redacted]' },
      clientId: 'client-1', clientName: 'Acme', outcome: 'succeeded', actorEmail: 'paul@example.com',
      timestamp: '2026-08-19T10:00:00Z',
    }])
    const result = await getActionLog({
      clientName: 'Acme', actorEmail: 'paul@example.com', toolName: 'generate_banner_image',
      outcome: 'succeeded', limit: 20,
    }, owner, { inspect }) as any

    expect(result.ok).toBe(true)
    expect(result.data).toMatchObject({ immutable: true, source: 'god_mode_audit_events', total: 1 })
    expect(result.data.actions[0]).toMatchObject({ toolName: 'generate_banner_image', clientName: 'Acme' })
    expect(inspect).toHaveBeenCalledWith(owner, expect.objectContaining({
      clientName: 'Acme', actorEmail: 'paul@example.com', toolName: 'generate_banner_image',
      outcome: 'succeeded', limit: 1001,
    }))
  })

  it('restricts non-owner queries to the authenticated actor', async () => {
    const inspect = vi.fn().mockResolvedValue([])
    const admin = { ...owner, userRole: 'admin' }
    await getActionLog({ limit: 20 }, admin, { inspect })
    expect(inspect).toHaveBeenCalledWith(admin, expect.objectContaining({ limit: 1001 }))
  })

  it('declares source truncation instead of reporting the cap as the total (P-03)', async () => {
    const rows = Array.from({ length: 1001 }, (_, i) => ({ tool: `t${i}`, outcome: 'succeeded' }))
    const inspect = vi.fn().mockResolvedValue(rows)
    const res = await getActionLog({ limit: 20 }, { userId: 'u1', userRole: 'owner', event: {} as any } as any, { inspect })
    const d = (res as any).data
    expect(d.truncatedAtSource).toBe(true)
    expect(d.sourceCap).toBe(1000)
    expect(d.total).toBe(1000)
    expect(d.actions).toHaveLength(20)
  })
})
