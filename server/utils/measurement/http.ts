import { createError } from 'h3'
import { MeasurementError } from '~~/server/utils/measurement/errors'

export function throwMeasurementHttpError(error: unknown): never {
  if (error instanceof MeasurementError) {
    throw createError({
      statusCode: error.statusCode,
      statusMessage: error.message
    })
  }

  throw createError({
    statusCode: 500,
    statusMessage: 'Measurement service unavailable'
  })
}
