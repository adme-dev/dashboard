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

interface EmailBuilderScheduleErrorDetail {
  label?: unknown
  message?: unknown
}

function detailMessage(detail: EmailBuilderScheduleErrorDetail): string | null {
  if (typeof detail.message !== 'string' || !detail.message.trim()) return null
  return detail.message.trim()
}

export function isEmailBuilderScheduleBlocked(
  preflight: EmailBuilderSchedulePreflight | null | undefined
): boolean {
  return Boolean(
    preflight?.blocked
    || preflight?.checks?.some(check => check.status === 'blocked')
  )
}

export function shouldDisableEmailBuilderScheduleAction(
  preflight: EmailBuilderSchedulePreflight | null | undefined,
  scheduledAt?: string,
  now: Date = new Date()
): boolean {
  if (isEmailBuilderScheduleBlocked(preflight)) return true
  if (scheduledAt === undefined) return false
  return validateEmailBuilderScheduleAt(scheduledAt, now) !== null
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

export function validateEmailBuilderScheduleAt(
  value: string,
  now: Date = new Date()
): string | null {
  if (!value) return 'Choose a send time.'
  const scheduledDate = new Date(value)
  if (Number.isNaN(scheduledDate.getTime())) return 'Choose a valid send time.'
  if (scheduledDate.getTime() <= now.getTime()) return 'Choose a future send time.'
  return null
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
  const details = Array.isArray(responseData?.data)
    ? responseData.data
        .map(detailMessage)
        .filter((message): message is string => !!message)
    : []
  const message = typeof responseData?.message === 'string' && responseData.message.trim()
    ? responseData.message.trim()
    : typeof responseData?.statusMessage === 'string' && responseData.statusMessage.trim()
      ? responseData.statusMessage.trim()
      : typeof payload?.message === 'string' && payload.message.trim()
        ? payload.message.trim()
        : 'Could not schedule the campaign.'

  return {
    message: details.length ? `${message}: ${details.slice(0, 4).join('; ')}` : message,
    preflight: responseData?.data?.preflight ?? null,
    recipientSnapshot: responseData?.data?.recipientSnapshot ?? null
  }
}
