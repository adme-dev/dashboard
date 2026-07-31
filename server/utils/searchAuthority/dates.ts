const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
const DAY_MS = 86_400_000
const MAX_MANUAL_DAYS = 90

export interface SearchConsoleWindow {
  startDate: string
  endDate: string
  mode: 'initial' | 'refresh' | 'manual'
}

interface SearchConsoleWindowInput {
  now?: Date
  baselineCompleted?: boolean
  startDate?: string
  endDate?: string
  maxManualDays?: number
}

function parseIsoDate(value: string): Date {
  if (!ISO_DATE.test(value)) {
    throw new Error('Search Console dates must be valid YYYY-MM-DD values')
  }
  const date = new Date(`${value}T00:00:00.000Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error('Search Console dates must be valid YYYY-MM-DD values')
  }
  return date
}

function addDays(value: string, days: number): string {
  const date = parseIsoDate(value)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

function inclusiveDays(startDate: string, endDate: string): number {
  return Math.floor(
    (parseIsoDate(endDate).getTime() - parseIsoDate(startDate).getTime()) / DAY_MS
  ) + 1
}

export function searchConsoleProviderDate(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find(part => part.type === type)?.value
  return `${value('year')}-${value('month')}-${value('day')}`
}

export function searchConsoleOpportunityWindow(now = new Date()): {
  startDate: string
  endDate: string
} {
  const endDate = searchConsoleProviderDate(now)
  return {
    startDate: addDays(endDate, -27),
    endDate
  }
}

export function searchConsoleSyncWindow(
  input: SearchConsoleWindowInput = {}
): SearchConsoleWindow {
  if (input.startDate || input.endDate) {
    if (!input.startDate || !input.endDate) {
      throw new Error('Search Console manual sync requires both startDate and endDate')
    }
    parseIsoDate(input.startDate)
    parseIsoDate(input.endDate)
    if (input.startDate > input.endDate) {
      throw new Error('Search Console startDate must be on or before endDate')
    }
    const maxManualDays = input.maxManualDays ?? MAX_MANUAL_DAYS
    if (inclusiveDays(input.startDate, input.endDate) > maxManualDays) {
      throw new Error(
        `Search Console manual sync cannot exceed ${maxManualDays} days`
      )
    }
    return {
      startDate: input.startDate,
      endDate: input.endDate,
      mode: 'manual'
    }
  }

  const endDate = searchConsoleProviderDate(input.now)
  const days = input.baselineCompleted ? 3 : 90
  return {
    startDate: addDays(endDate, -(days - 1)),
    endDate,
    mode: input.baselineCompleted ? 'refresh' : 'initial'
  }
}

export function listSearchConsoleDates(
  startDate: string,
  endDate: string
): string[] {
  const count = inclusiveDays(startDate, endDate)
  if (count < 1) throw new Error('Search Console startDate must be on or before endDate')
  return Array.from({ length: count }, (_, index) => addDays(startDate, index))
}
