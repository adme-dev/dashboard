import { describe, expect, it, vi } from 'vitest'
import type { ToolContext } from '~~/server/utils/ai/toolContext'
import type { GoogleAdsActionPlan } from '~~/server/utils/googleAds/contracts'
import { persistGoogleAdsMcpProposal } from '~~/server/utils/ai/mcp/googleAdsServer'

const ACTOR_ID = '11111111-1111-4111-8111-111111111111'
const PLAN_ID = '22222222-2222-4222-8222-222222222222'
const APPROVAL_ID = '33333333-3333-4333-8333-333333333333'

const context: ToolContext = {
  userId: ACTOR_ID,
  userRole: 'media_buyer',
  event: {} as never,
  source: 'mcp'
}

const plan = {
  id: PLAN_ID,
  actorId: ACTOR_ID,
  status: 'pending_approval'
} as GoogleAdsActionPlan

describe('Google Ads MCP server proposal persistence', () => {
  it('persists, links, and audits a proposal in order', async () => {
    const insertPending = vi.fn().mockResolvedValue({ id: APPROVAL_ID })
    const linkApproval = vi.fn().mockResolvedValue({ ...plan, approvalId: APPROVAL_ID })
    const event = vi.fn().mockResolvedValue(undefined)

    await expect(persistGoogleAdsMcpProposal(plan, context, {
      insertPending,
      linkApproval,
      event
    })).resolves.toEqual({ proposalId: APPROVAL_ID })

    expect(insertPending).toHaveBeenCalledBefore(linkApproval)
    expect(linkApproval).toHaveBeenCalledBefore(event)
    expect(linkApproval).toHaveBeenCalledWith(plan, APPROVAL_ID)
  })

  it('rejects a plan bound to another actor before writing', async () => {
    const insertPending = vi.fn()

    await expect(persistGoogleAdsMcpProposal({
      ...plan,
      actorId: '44444444-4444-4444-8444-444444444444'
    }, context, {
      insertPending,
      linkApproval: vi.fn(),
      event: vi.fn()
    })).rejects.toThrow('not awaiting this actor')

    expect(insertPending).not.toHaveBeenCalled()
  })
})
