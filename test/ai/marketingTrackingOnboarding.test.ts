import { describe, expect, it } from 'vitest'
import { projectTask4StaffSuite } from '~~/server/utils/ai/mcp/marketingTask4Tools'
import { isTask4WriteTool } from '~~/server/utils/ai/mcp/marketingTask4Names'
import { roleSkillDefinition } from '~~/server/utils/ai/roleSkills/definitions'
import type { McpProjectionContext } from '~~/server/utils/ai/mcp/project'
import { GtmProposalInput } from '~~/server/utils/tracking/gtmProposalSchemas'

describe('marketing tracking onboarding discovery', () => {
  it('offers onboarding as a scoped read and maps the published role skill to the marketing persona', () => {
    const tools = projectTask4StaffSuite({ suiteFlags: {} } as McpProjectionContext)
    expect(tools.find(tool => tool.name === 'get_client_tracking_onboarding')).toMatchObject({ inputSchema: { required: ['clientId'] } })
    expect(isTask4WriteTool('get_client_tracking_onboarding')).toBe(false)
    expect(roleSkillDefinition('marketing_tracking_onboarding')).toMatchObject({
      group: 'Marketing', persona: 'marketing', tools: ['get_client_tracking_onboarding']
    })
  })
  it('accepts only an explicit initial-mapping intent, not a false flag or script payload', () => {
    const input = { action: 'binding', siteId: '11111111-1111-4111-8111-111111111111',
      ownershipEvidenceId: '22222222-2222-4222-8222-222222222222', connectionId: '33333333-3333-4333-8333-333333333333',
      containerPath: 'accounts/1/containers/2', initialMapping: true }
    expect(GtmProposalInput.safeParse(input).success).toBe(true)
    expect(GtmProposalInput.safeParse({ ...input, initialMapping: false }).success).toBe(false)
    expect(GtmProposalInput.safeParse({ ...input, html: '<script>' }).success).toBe(false)
  })
})
