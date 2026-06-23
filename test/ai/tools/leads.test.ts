import { describe, it, expect, vi } from 'vitest'
import { getLeads, leadName, maskContact, leadsTool, type LeadsDeps, type LeadRow } from '~~/server/utils/ai/tools/leads'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx: ToolContext = { userId: 'u1', userRole: 'owner', event: {} as any }
const now = new Date('2026-06-22T00:00:00.000Z')
const resolveClient = vi.fn().mockResolvedValue({ id: 'c1', name: 'Acme' })
const row = (i: number): LeadRow => ({
  id: `l${i}`, submitted_at: '2026-06-20T00:00:00.000Z', source: 'meta', status: 'new',
  campaign_name: 'Winter', field_data: { full_name: `Lead ${i}`, email: `lead${i}@acme.com`, phone_number: '0400123456' },
})

describe('leadName / maskContact (pure)', () => {
  it('extracts a name from varied field_data keys', () => {
    expect(leadName({ full_name: 'Jane Doe' })).toBe('Jane Doe')
    expect(leadName({ name: 'Bob' })).toBe('Bob')
    expect(leadName(null)).toBe('Unknown')
  })
  it('masks email then phone, never returning raw PII', () => {
    expect(maskContact({ email: 'jane@acme.com' })).toBe('j***@acme.com')
    expect(maskContact({ phone_number: '0400123456' })).toBe('***456')
    expect(maskContact({})).toBeNull()
  })
})

describe('get_leads — list mode', () => {
  it('returns a compact, capped, masked lead list', async () => {
    const deps: LeadsDeps = { resolveClient, list: vi.fn().mockResolvedValue({ items: [row(0), row(1), row(2)], total: 3 }), summary: vi.fn() }
    const res = await getLeads({ clientName: 'Acme', summary: false, period: '30d', limit: 2 }, ctx, deps, now)
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data.leads).toHaveLength(2)
    expect(data.more).toBe(1)
    expect(data.leads[0]).toEqual({ id: 'l0', submittedAt: '2026-06-20T00:00:00.000Z', source: 'meta', status: 'new', name: 'Lead 0', contact: 'l***@acme.com', campaignName: 'Winter' })
    expect((deps.summary as any)).not.toHaveBeenCalled()
  })
})

describe('get_leads — summary mode', () => {
  it('rolls counts up by status and source', async () => {
    const counts = [
      { status: 'new', source: 'meta', count: 3 },
      { status: 'new', source: 'google', count: 2 },
      { status: 'contacted', source: 'meta', count: 1 },
    ]
    const deps: LeadsDeps = { resolveClient, list: vi.fn(), summary: vi.fn().mockResolvedValue(counts) }
    const res = await getLeads({ clientName: 'Acme', summary: true, period: '7d', limit: 20 }, ctx, deps, now)
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data.total).toBe(6)
    expect(data.byStatus).toContainEqual({ status: 'new', count: 5 })
    expect(data.bySource).toContainEqual({ source: 'meta', count: 4 })
    expect((deps.list as any)).not.toHaveBeenCalled()
  })
})

describe('get_leads — guards', () => {
  it('fails without any upstream call when the client is unknown', async () => {
    const list = vi.fn(); const summary = vi.fn()
    const deps: LeadsDeps = { resolveClient: vi.fn().mockResolvedValue(null), list, summary }
    const res = await getLeads({ clientName: 'Nope', summary: false, period: '30d', limit: 20 }, ctx, deps, now)
    expect(res.ok).toBe(false)
    expect(list).not.toHaveBeenCalled()
    expect(summary).not.toHaveBeenCalled()
  })
  it('is read-only, untrusted, and has no required permission (any authed user)', () => {
    expect(leadsTool.mutates).toBeUndefined()
    expect(leadsTool.returnsUntrusted).toBe(true)
    expect(leadsTool.requiredPermission).toBeUndefined()
  })
})
