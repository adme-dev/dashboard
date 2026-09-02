export type MeasurementDataStream
  = 'spend'
    | 'campaign_conversions'
    | 'conversion_actions'
    | 'website_events'
    | 'provider_calls'

export interface DateRange {
  startDate: string
  endDate: string
}

function dateOnly(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`)
}

function shiftDate(value: string, days: number): string {
  const date = dateOnly(value)
  date.setUTCDate(date.getUTCDate() + days)
  return date.toISOString().slice(0, 10)
}

export function missingDateRanges(requested: DateRange | null, covered: DateRange | null): DateRange[] {
  if (!requested) return []
  if (!covered || covered.endDate < requested.startDate || covered.startDate > requested.endDate) {
    return [requested]
  }
  const missing: DateRange[] = []
  if (covered.startDate > requested.startDate) {
    missing.push({ startDate: requested.startDate, endDate: shiftDate(covered.startDate, -1) })
  }
  if (covered.endDate < requested.endDate) {
    missing.push({ startDate: shiftDate(covered.endDate, 1), endDate: requested.endDate })
  }
  return missing
}

export function deriveMeasurementFreshness(input: {
  stream: MeasurementDataStream
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  requestedRange: DateRange | null
  coveredRange: DateRange | null
  currentJobState: string
  unavailableReasonCode: string | null
  now?: Date
  staleAfterHours?: number
}) {
  const now = input.now ?? new Date()
  const missingRanges = missingDateRanges(input.requestedRange, input.coveredRange)
  const ageHours = input.lastSuccessAt
    ? Math.max(0, now.getTime() - new Date(input.lastSuccessAt).getTime()) / 3_600_000
    : null
  const syncing = ['pending', 'running'].includes(input.currentJobState)
  const incomplete = missingRanges.length > 0

  let status: 'fresh' | 'stale' | 'syncing' | 'failed' | 'unavailable'
  let metricsAvailable: boolean
  let reason: string
  if (syncing) {
    status = 'syncing'
    metricsAvailable = !incomplete
    reason = input.stream === 'campaign_conversions' && incomplete
      ? 'Conversion totals unavailable while historical resync is pending.'
      : `${input.stream.replaceAll('_', ' ')} synchronization is in progress.`
  } else if (input.currentJobState === 'failed') {
    status = 'failed'
    metricsAvailable = false
    reason = `${input.stream.replaceAll('_', ' ')} synchronization failed.`
  } else if (!input.lastSuccessAt) {
    status = 'unavailable'
    metricsAvailable = false
    reason = `${input.stream.replaceAll('_', ' ')} has not completed a successful synchronization.`
  } else if (ageHours !== null && ageHours > (input.staleAfterHours ?? 48)) {
    status = 'stale'
    metricsAvailable = true
    reason = `${input.stream.replaceAll('_', ' ')} data is stale.`
  } else {
    status = 'fresh'
    metricsAvailable = true
    reason = `${input.stream.replaceAll('_', ' ')} data is fresh.`
  }
  return {
    stream: input.stream,
    status,
    metricsAvailable,
    reason,
    unavailableReasonCode: input.unavailableReasonCode,
    lastAttemptAt: input.lastAttemptAt,
    lastSuccessAt: input.lastSuccessAt,
    requestedRange: input.requestedRange,
    coveredRange: input.coveredRange,
    missingRanges,
    currentJobState: input.currentJobState
  }
}
