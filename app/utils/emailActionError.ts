interface EmailActionErrorIssue {
  message?: unknown
}

interface EmailActionErrorPayload {
  data?: {
    message?: unknown
    statusMessage?: unknown
    data?: unknown
  }
  message?: unknown
  statusMessage?: unknown
}

function stringValue(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

function collectIssueMessages(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value
    .map((issue: EmailActionErrorIssue) => stringValue(issue?.message))
    .filter(Boolean)
}

export function describeEmailActionError(error: unknown, fallback = 'Something went wrong.'): string {
  const payload = error as EmailActionErrorPayload | null | undefined
  const responseData = payload?.data
  const base = stringValue(responseData?.message)
    || stringValue(responseData?.statusMessage)
    || stringValue(payload?.message)
    || stringValue(payload?.statusMessage)
    || fallback
  const details = collectIssueMessages(responseData?.data)

  return details.length ? `${base}: ${details.slice(0, 4).join('; ')}` : base
}
