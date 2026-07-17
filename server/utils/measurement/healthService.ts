import {
  RecordDestinationValidationEvidenceSchema
} from '~~/server/utils/measurement/contracts'
import { MeasurementError } from '~~/server/utils/measurement/errors'
import type {
  MeasurementHealthRepository
} from '~~/server/utils/measurement/healthRepository'

export interface MeasurementHealthServiceDeps {
  repository: MeasurementHealthRepository
}

function validationError() {
  return new MeasurementError(
    'MEASUREMENT_VALIDATION_ERROR',
    422,
    'Invalid measurement validation evidence'
  )
}

export function createMeasurementHealthService(deps: MeasurementHealthServiceDeps) {
  return {
    async recordValidation(rawInput: unknown) {
      const inputResult = RecordDestinationValidationEvidenceSchema.safeParse(rawInput)
      if (!inputResult.success) throw validationError()

      const result = await deps.repository.recordValidation(inputResult.data)
      if (result.status === 'not_found') {
        throw new MeasurementError(
          'MEASUREMENT_NOT_FOUND',
          404,
          'Measurement configuration not found'
        )
      }
      if (result.status === 'invalid_capability') throw validationError()
      if (result.status === 'version_conflict') {
        throw new MeasurementError(
          'MEASUREMENT_VERSION_CONFLICT',
          409,
          'Measurement configuration changed; discard stale validation evidence'
        )
      }
      return result.evidence
    }
  }
}
