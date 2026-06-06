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

interface TestSendErrorDetail {
  code?: unknown
  label?: unknown
  status?: unknown
  message?: unknown
}

function labelForDetail(detail: TestSendErrorDetail): string {
  if (typeof detail.label === 'string' && detail.label.trim()) return detail.label.trim()
  return ''
}

function messageForDetail(detail: TestSendErrorDetail): string | null {
  if (typeof detail.message !== 'string' || !detail.message.trim()) return null
  const label = labelForDetail(detail)
  return label ? `${label}: ${detail.message.trim()}` : detail.message.trim()
}

function collectTestSendDetails(payload: unknown): string[] {
  const data = payload as {
    preflight?: { checks?: TestSendErrorDetail[] }
    errors?: TestSendErrorDetail[]
    warnings?: TestSendErrorDetail[]
  } | null | undefined
  if (Array.isArray(payload)) {
    return payload
      .map(messageForDetail)
      .filter((message): message is string => !!message)
  }
  const checks = Array.isArray(data?.preflight?.checks)
    ? data.preflight.checks.filter(check => check.status !== 'pass')
    : []
  const errors = Array.isArray(data?.errors) ? data.errors : []
  return [...checks, ...errors]
    .map(messageForDetail)
    .filter((message): message is string => !!message)
}

export function describeEmailBuilderTestSendError(error: unknown): string {
  const payload = error as {
    data?: {
      message?: unknown
      statusMessage?: unknown
      data?: unknown
    }
    message?: unknown
  } | null | undefined
  const responseData = payload?.data
  const base = typeof responseData?.message === 'string' && responseData.message.trim()
    ? responseData.message.trim()
    : typeof responseData?.statusMessage === 'string' && responseData.statusMessage.trim()
      ? responseData.statusMessage.trim()
      : typeof payload?.message === 'string' && payload.message.trim()
        ? payload.message.trim()
        : 'Could not send the test email.'

  const details = collectTestSendDetails(responseData?.data)
  return details.length ? `${base}: ${details.slice(0, 4).join('; ')}` : base
}
