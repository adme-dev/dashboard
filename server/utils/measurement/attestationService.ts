import { z } from 'zod'
import { MeasurementError } from '~~/server/utils/measurement/errors'
import { isAttestationOnly } from '~~/shared/utils/measurementPlatform'

const AttestationCapabilitySchema = z.strictObject({
  mode: z.string().trim().min(1).max(255),
  status: z.enum(['ready', 'degraded', 'blocked']),
  blockingReason: z.string().trim().min(1).max(1000).nullable().default(null)
}).superRefine((capability, ctx) => {
  if (capability.status !== 'ready' && capability.blockingReason === null) {
    ctx.addIssue({
      code: 'custom',
      path: ['blockingReason'],
      message: 'Degraded and blocked attestations require a reason'
    })
  }
  if (capability.status === 'ready' && capability.blockingReason !== null) {
    ctx.addIssue({
      code: 'custom',
      path: ['blockingReason'],
      message: 'Ready attestations must not carry a blocking reason'
    })
  }
})

export const AttestCapabilitiesSchema = z.strictObject({
  clientId: z.string().uuid(),
  destinationId: z.string().uuid(),
  expectedConfigVersion: z.number().int().positive(),
  capabilities: z.array(AttestationCapabilitySchema).min(1),
  reason: z.string().trim().min(1).max(1000),
  confirmed: z.literal(true),
  force: z.boolean().default(false),
  actor: z.strictObject({ id: z.string().uuid() })
})

export interface MeasurementAttestationServiceDeps {
  healthService: { recordValidation(evidence: unknown): Promise<{ healthStatus: string }> }
  readDestination: (
    input: { clientId: string, destinationId: string }
  ) => Promise<{ enabled: boolean, environment: string } | null>
  now: () => Date
}

function validationError(message = 'Invalid measurement attestation') {
  return new MeasurementError('MEASUREMENT_VALIDATION_ERROR', 422, message)
}

export function createMeasurementAttestationService(deps: MeasurementAttestationServiceDeps) {
  return {
    async attest(rawInput: unknown) {
      const parsed = AttestCapabilitiesSchema.safeParse(rawInput)
      if (!parsed.success) throw validationError()
      const input = parsed.data

      const notAttestable = input.capabilities.filter(
        capability => !isAttestationOnly(capability.mode)
      )
      if (notAttestable.length > 0) {
        throw validationError(
          'These capabilities are validated by running a provider test, not by attestation'
        )
      }

      const destination = await deps.readDestination({
        clientId: input.clientId,
        destinationId: input.destinationId
      })
      if (!destination) {
        throw new MeasurementError(
          'MEASUREMENT_NOT_FOUND',
          404,
          'Measurement destination not found'
        )
      }

      // A live destination must never be taken down by accident. Blocking one
      // is still possible, but only deliberately via force.
      const isLive = destination.enabled && destination.environment === 'live'
      const capabilities = input.capabilities.map(capability => (
        isLive && capability.status === 'blocked' && !input.force
          ? { ...capability, status: 'degraded' as const }
          : capability
      ))

      const result = await deps.healthService.recordValidation({
        clientId: input.clientId,
        destinationId: input.destinationId,
        expectedConfigVersion: input.expectedConfigVersion,
        observedAt: deps.now().toISOString(),
        actor: { type: 'user', id: input.actor.id },
        reason: input.reason,
        providerRequestId: null,
        errorClass: null,
        redactedError: null,
        capabilities
      })

      return { healthStatus: result.healthStatus, capabilities }
    }
  }
}
