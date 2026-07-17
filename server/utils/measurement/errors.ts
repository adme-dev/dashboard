export type MeasurementErrorCode
  = 'MEASUREMENT_VALIDATION_ERROR'
    | 'MEASUREMENT_NOT_FOUND'
    | 'MEASUREMENT_FORBIDDEN'
    | 'MEASUREMENT_VERSION_CONFLICT'
    | 'MEASUREMENT_DISABLED'
    | 'MEASUREMENT_DUPLICATE'
    | 'MEASUREMENT_POLICY_SKIP'
    | 'MEASUREMENT_RATE_LIMITED'
    | 'MEASUREMENT_CACHE_STALE'

export class MeasurementError extends Error {
  readonly code: MeasurementErrorCode
  readonly statusCode: number

  constructor(code: MeasurementErrorCode, statusCode: number, message: string) {
    super(message)
    this.name = 'MeasurementError'
    this.code = code
    this.statusCode = statusCode
  }
}
