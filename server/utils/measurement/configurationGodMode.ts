import type { H3Event } from 'h3'
import { getRequestURL, readBody } from 'h3'

import { transaction } from '~~/server/utils/db'
import { appendGodModeAuditEvent } from '~~/server/utils/godMode/audit'
import { registerGodModeMutationFamily } from '~~/server/utils/godMode/featureGate'
import {
  defineGodModeTransactionOperation,
  executeGodModeTransactionMutation,
  prepareGodModeTransactionMutation,
  type GodModeTransactionDb,
  type GodModeTransactionOperation
} from '~~/server/utils/godMode/transactionCoordinator'
import { digestMcpRequestBody } from '~~/shared/utils/mcpRequestClaim'

const UUID = '[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}'
const PROFILE_ROUTE = new RegExp(`^/api/agency/measurement/clients/${UUID}/profile$`, 'i')
const DESTINATION_ROUTE = new RegExp(`^/api/agency/measurement/clients/${UUID}/destinations$`, 'i')
const operationKey = Symbol('measurementConfigurationGodModeOperation')

interface ProfileResult {
  profile: { id: string }
}

interface DestinationResult {
  destination: { id: string }
}

function operationFor(event: H3Event): GodModeTransactionOperation {
  const context = event.context as Record<PropertyKey, unknown>
  const existing = context[operationKey] as GodModeTransactionOperation | undefined
  if (existing) return existing

  const path = getRequestURL(event).pathname
  const profile = isMeasurementProfileUpdatePath(path)
  const operation = defineGodModeTransactionOperation({
    routeOrTool: `${String(event.method || '').toUpperCase()} ${path}`,
    mutationName: profile ? 'measurement profile update' : 'measurement destination creation',
    missingResultMessage: profile
      ? 'Measurement profile update did not produce a durable result'
      : 'Measurement destination creation did not produce a durable result'
  })
  context[operationKey] = operation
  return operation
}

async function prepare(event: H3Event) {
  return await prepareGodModeTransactionMutation(event, operationFor(event), {
    transaction,
    appendAudit: appendGodModeAuditEvent,
    digestRequest: async request => await digestMcpRequestBody(await readBody(request))
  })
}

export function isMeasurementProfileUpdatePath(path: string): boolean {
  return PROFILE_ROUTE.test(path)
}

export function isMeasurementDestinationCreatePath(path: string): boolean {
  return DESTINATION_ROUTE.test(path)
}

export async function executeGodModeMeasurementProfileUpdate<T extends ProfileResult>(
  event: H3Event,
  mutate: (db: GodModeTransactionDb) => Promise<T>,
  replay: (db: GodModeTransactionDb, resultReference: string) => Promise<T>
): Promise<T> {
  const wrapped = await executeGodModeTransactionMutation(
    event,
    operationFor(event),
    transaction,
    async (db) => {
      const result = await mutate(db)
      return { id: result.profile.id, result }
    },
    async (db, resultReference) => {
      const result = await replay(db, resultReference)
      return { id: result.profile.id, result }
    }
  )
  return wrapped.result
}

export async function executeGodModeMeasurementDestinationCreate<T extends DestinationResult>(
  event: H3Event,
  mutate: (db: GodModeTransactionDb) => Promise<T>,
  replay: (db: GodModeTransactionDb, resultReference: string) => Promise<T>
): Promise<T> {
  const wrapped = await executeGodModeTransactionMutation(
    event,
    operationFor(event),
    transaction,
    async (db) => {
      const result = await mutate(db)
      return { id: result.destination.id, result }
    },
    async (db, resultReference) => {
      const result = await replay(db, resultReference)
      return { id: result.destination.id, result }
    }
  )
  return wrapped.result
}

export function registerGodModeMeasurementConfigurationMutationFamilies(): () => void {
  const unregisterProfile = registerGodModeMutationFamily({
    family: 'measurement-profile-update',
    method: 'PUT',
    matchesPath: isMeasurementProfileUpdatePath,
    prepare
  })
  const unregisterDestination = registerGodModeMutationFamily({
    family: 'measurement-destination-create',
    method: 'POST',
    matchesPath: isMeasurementDestinationCreatePath,
    prepare
  })
  return () => {
    unregisterDestination()
    unregisterProfile()
  }
}
