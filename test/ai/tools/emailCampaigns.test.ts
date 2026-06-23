import { describe, it, expect, vi } from 'vitest'
import { getEmailCampaignPerformance, rate, campaignFlags, emailCampaignsTool, type EmailCampaignsDeps, type CampaignRow } from '~~/server/utils/ai/tools/emailCampaigns'
import type { ToolContext } from '~~/server/utils/ai/toolContext'

const ctx: ToolContext = { userId: 'u1', userRole: 'owner', event: {} as any }
const resolveClient = vi.fn().mockResolvedValue({ id: 'c1', name: 'Acme' })
const camp = (over: Partial<CampaignRow> = {}): CampaignRow => ({
  id: 'k1', name: 'Winter', subject: 'Hi', status: 'sent', client_id: 'c1',
  to_send: 1000, sent: 1000, delivered: 950, opened: 400, clicked: 80, bounced: 20, complained: 1, unsubscribed: 5, ...over,
})

describe('rate / campaignFlags (pure)', () => {
  it('rate guards divide-by-zero with null', () => {
    expect(rate(50, 100)).toBe(0.5)
    expect(rate(1, 0)).toBeNull()
  })
  it('flags high bounce and low open', () => {
    const flags = campaignFlags(camp({ delivered: 100, opened: 2, bounced: 60, sent: 1000 }))
    expect(flags).toContain('high_bounce')
    expect(flags).toContain('low_open')
  })
})

describe('get_email_campaign_performance', () => {
  it('lists the client’s campaigns with computed rates, capped', async () => {
    const list = [camp({ id: 'k1', client_id: 'c1' }), camp({ id: 'k2', client_id: 'c1' }), camp({ id: 'kx', client_id: 'OTHER' })]
    const deps: EmailCampaignsDeps = { resolveClient, campaigns: vi.fn().mockResolvedValue({ campaigns: list }), events: vi.fn() }
    const res = await getEmailCampaignPerformance({ clientName: 'Acme', limit: 10 }, ctx, deps)
    expect(res.ok).toBe(true)
    const data = (res as any).data
    expect(data.campaigns.map((c: any) => c.id)).toEqual(['k1', 'k2']) // OTHER client filtered out
    expect(data.campaigns[0].openRate).toBeCloseTo(400 / 950)
  })

  it('drills into a named campaign and includes its event summary', async () => {
    const deps: EmailCampaignsDeps = {
      resolveClient,
      campaigns: vi.fn().mockResolvedValue({ campaigns: [camp({ id: 'k1', name: 'Winter', client_id: 'c1' })] }),
      events: vi.fn().mockResolvedValue({ summary: { delivered: 950, opened: 400, clicked: 80 }, events: [] }),
    }
    const res = await getEmailCampaignPerformance({ clientName: 'Acme', campaignName: 'Winter', limit: 10 }, ctx, deps)
    expect(res.ok).toBe(true)
    expect((res as any).data.campaign.eventSummary.delivered).toBe(950)
    expect((deps.events as any).mock.calls[0][0]).toBe('k1')
  })

  it('fails (no fetch) on unknown client; is read-only/untrusted/MANAGEMENT', async () => {
    const campaignsFn = vi.fn()
    const deps: EmailCampaignsDeps = { resolveClient: vi.fn().mockResolvedValue(null), campaigns: campaignsFn, events: vi.fn() }
    const res = await getEmailCampaignPerformance({ clientName: 'Nope', limit: 10 }, ctx, deps)
    expect(res.ok).toBe(false)
    expect(campaignsFn).not.toHaveBeenCalled()
    expect(emailCampaignsTool.mutates).toBeUndefined()
    expect(emailCampaignsTool.returnsUntrusted).toBe(true)
    expect(emailCampaignsTool.requiredPermission).toBe('MANAGEMENT')
  })
})
