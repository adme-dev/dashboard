import { describe, expect, it } from 'vitest'

describe('email endpoint service', () => {
  it('generates opaque cryptographic tokens accepted by the shared recipient contract', async () => {
    const { generateEmailEndpointToken } = await import('~~/server/utils/leads/emailEndpoint')
    const { EmailStageRequestSchema } = await import('../../../../../shared/leads/email/contracts')
    const first = generateEmailEndpointToken()
    const second = generateEmailEndpointToken()

    expect(first).not.toBe(second)
    expect(EmailStageRequestSchema.shape.recipientToken.safeParse(first).success).toBe(true)
  })
})
