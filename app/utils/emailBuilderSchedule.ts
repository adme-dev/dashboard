export interface EmailBuilderSchedulePreflightCheck {
  code: string
  label?: string
  status: 'pass' | 'warning' | 'blocked'
  message: string
}

export interface EmailBuilderSchedulePreflight {
  ok: boolean
  blocked: boolean
  checkedAt?: string
  checks: EmailBuilderSchedulePreflightCheck[]
}

export interface EmailBuilderScheduleRecipientSnapshot {
  listIds?: string[]
  dedupedRecipients?: number
  excludedUnsubscribed?: number
  excludedSuppressed?: number
  excludedBlocklisted?: number
  toSend?: number
  generatedAt?: string
}

export function isEmailBuilderScheduleBlocked(
  preflight: EmailBuilderSchedulePreflight | null | undefined
): boolean {
  return Boolean(
    preflight?.blocked
    || preflight?.checks?.some(check => check.status === 'blocked')
  )
}

export function buildEmailBuilderScheduleRequest(input: {
  campaignId: string
  scheduledAt: string
}) {
  return {
    url: `/api/email/campaigns/${input.campaignId}`,
    body: { scheduled_at: new Date(input.scheduledAt).toISOString() }
  }
}

export function extractEmailBuilderScheduleError(error: unknown): {
  message: string
  preflight: EmailBuilderSchedulePreflight | null
  recipientSnapshot: EmailBuilderScheduleRecipientSnapshot | null
} {
  const payload = error as {
    data?: {
      message?: unknown
      statusMessage?: unknown
      data?: {
        preflight?: EmailBuilderSchedulePreflight
        recipientSnapshot?: EmailBuilderScheduleRecipientSnapshot
      }
    }
    message?: unknown
  } | null | undefined
  const responseData = payload?.data
  const message = typeof responseData?.message === 'string' && responseData.message.trim()
    ? responseData.message.trim()
    : typeof responseData?.statusMessage === 'string' && responseData.statusMessage.trim()
      ? responseData.statusMessage.trim()
      : typeof payload?.message === 'string' && payload.message.trim()
        ? payload.message.trim()
        : 'Could not schedule the campaign.'

  return {
    message,
    preflight: responseData?.data?.preflight ?? null,
    recipientSnapshot: responseData?.data?.recipientSnapshot ?? null
  }
}
