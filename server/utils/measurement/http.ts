import { createError } from 'h3'
import { MeasurementError } from '~~/server/utils/measurement/errors'

export function throwMeasurementHttpError(error: unknown): never {
  if (error instanceof MeasurementError) {
    throw createError({
      statusCode: error.statusCode,
      statusMessage: error.message,
      data: {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details === undefined ? {} : { details: error.details })
        }
      }
    })
  }

  throw createError({
    statusCode: 500,
    statusMessage: 'Measurement service unavailable',
    data: {
      error: {
        code: 'MEASUREMENT_SERVICE_UNAVAILABLE',
        message: 'Measurement service unavailable'
      }
    }
  })
}
