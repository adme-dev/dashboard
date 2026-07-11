export interface HrScheduleInput {
  opensAt: string
  dueAt: string
  closesAt: string
  timezone: string
}

export type HrScheduleValidation =
  | { isValid: true }
  | { isValid: false, code: 'INVALID_DATE' | 'INVALID_TIMEZONE' | 'DUE_BEFORE_OPEN' | 'DUE_AFTER_CLOSE' }

export type HrAssignmentStatus = 'not_started' | 'submitted' | 'overdue' | 'extension_granted'

export interface HrAssignmentStatusInput {
  now: string
  dueAt: string
  submittedAt: string | null
  extensionDueAt?: string | null
}

export interface HrCalendarInviteInput {
  uid: string
  method: 'REQUEST' | 'CANCEL'
  startsAt: string
  endsAt: string
  timezone: string
  summary: string
  description: string
  url: string
  sequence: number
}

export function validateHrSchedule(input: HrScheduleInput): HrScheduleValidation {
  const opensAt = Date.parse(input.opensAt)
  const dueAt = Date.parse(input.dueAt)
  const closesAt = Date.parse(input.closesAt)
  if (![opensAt, dueAt, closesAt].every(Number.isFinite)) return { isValid: false, code: 'INVALID_DATE' }

  try {
    new Intl.DateTimeFormat('en-AU', { timeZone: input.timezone }).format(new Date(opensAt))
  } catch {
    return { isValid: false, code: 'INVALID_TIMEZONE' }
  }

  if (dueAt <= opensAt) return { isValid: false, code: 'DUE_BEFORE_OPEN' }
  if (dueAt > closesAt) return { isValid: false, code: 'DUE_AFTER_CLOSE' }
  return { isValid: true }
}

export function deriveHrAssignmentStatus(input: HrAssignmentStatusInput): HrAssignmentStatus {
  if (input.submittedAt) return 'submitted'
  const now = Date.parse(input.now)
  const extensionDueAt = input.extensionDueAt ? Date.parse(input.extensionDueAt) : null
  if (extensionDueAt !== null && now <= extensionDueAt) return 'extension_granted'
  return now > Date.parse(input.dueAt) ? 'overdue' : 'not_started'
}

function toIcsUtc(value: string): string {
  return new Date(value).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z')
}

function escapeIcs(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/\r?\n/g, '\\n')
    .replace(/,/g, '\\,')
    .replace(/;/g, '\\;')
}

export function buildHrCalendarInvite(input: HrCalendarInviteInput): string {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//XeroFlow Agency//HR Business Review//EN',
    `METHOD:${input.method}`,
    'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT',
    `UID:${escapeIcs(input.uid)}`,
    `DTSTAMP:${toIcsUtc(new Date().toISOString())}`,
    `DTSTART:${toIcsUtc(input.startsAt)}`,
    `DTEND:${toIcsUtc(input.endsAt)}`,
    `SEQUENCE:${input.sequence}`,
    `STATUS:${input.method === 'CANCEL' ? 'CANCELLED' : 'CONFIRMED'}`,
    `SUMMARY:${escapeIcs(input.summary)}`,
    `DESCRIPTION:${escapeIcs(input.description)}`,
    `URL:${escapeIcs(input.url)}`,
    `X-HR-TIMEZONE:${escapeIcs(input.timezone)}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return `${lines.join('\r\n')}\r\n`
}
