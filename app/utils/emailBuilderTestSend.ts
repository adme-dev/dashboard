export function buildEmailBuilderTestSendRequest(input: {
  campaignId?: string | null
  to?: string | null
  subject?: string | null
  previewText?: string | null
  bodySource: unknown
}) {
  const to = input.to?.trim() || null
  if (input.campaignId) {
    return {
      url: `/api/email/campaigns/${input.campaignId}/test-send`,
      body: { to }
    }
  }

  return {
    url: '/api/email/templates/test-send',
    body: {
      to,
      subject: input.subject || null,
      preview_text: input.previewText || null,
      body_source: input.bodySource
    }
  }
}
