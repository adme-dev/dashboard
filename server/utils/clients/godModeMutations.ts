import type { H3Event } from 'h3'
import { createError, getRequestURL, readBody } from 'h3'

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
const CLIENT_CREATE_ROUTE = '/api/agency/clients'
const CLIENT_UPDATE_ROUTE = new RegExp(`^/api/agency/clients/${UUID}$`, 'i')
const CLIENT_CRM_SETTINGS_UPDATE_ROUTE = new RegExp(
  `^/api/agency/clients/${UUID}/crm-settings$`,
  'i'
)
const operationsKey = Symbol('agencyClientGodModeOperations')

type AgencyClientMutationKind = 'create' | 'client' | 'crm-settings'
type AgencyClientOperations = Partial<Record<AgencyClientMutationKind, GodModeTransactionOperation>>

function operations(event: H3Event): AgencyClientOperations {
  const context = event.context as Record<PropertyKey, unknown>
  const existing = context[operationsKey] as AgencyClientOperations | undefined
  if (existing) return existing
  const created: AgencyClientOperations = {}
  context[operationsKey] = created
  return created
}

function operationFor(event: H3Event, kind: AgencyClientMutationKind): GodModeTransactionOperation {
  const store = operations(event)
  const existing = store[kind]
  if (existing) return existing

  const mutationName = kind === 'create'
    ? 'client creation'
    : kind === 'client'
      ? 'client update'
      : 'client CRM settings update'
  const operation = defineGodModeTransactionOperation({
    routeOrTool: `${kind === 'create' ? 'POST' : 'PUT'} ${getRequestURL(event).pathname}`,
    mutationName,
    missingResultMessage: `God mode ${mutationName} did not produce a durable result`,
    retryableInProgress: true
  })
  store[kind] = operation
  return operation
}

async function prepare(event: H3Event, kind: AgencyClientMutationKind) {
  return await prepareGodModeTransactionMutation(event, operationFor(event, kind), {
    transaction,
    appendAudit: appendGodModeAuditEvent,
    digestRequest: async request => await digestMcpRequestBody(await readBody(request))
  })
}

async function execute<T extends { id: string }>(
  event: H3Event,
  kind: AgencyClientMutationKind,
  mutate: (db: GodModeTransactionDb) => Promise<T>,
  replay: (db: GodModeTransactionDb, resultReference: string) => Promise<T>
): Promise<T> {
  const store = (event.context as Record<PropertyKey, unknown> | undefined)?.[operationsKey] as AgencyClientOperations | undefined
  // Ordinary staff requests do not have a prepared God mode operation and use
  // the same transaction boundary without an execution-ledger claim.
  if (!store) return await transaction(mutate)
  const operation = store[kind]
  if (!operation) {
    throw createError({
      statusCode: 503,
      statusMessage: 'God mode mutation coordination unavailable'
    })
  }
  return await executeGodModeTransactionMutation(event, operation, transaction, mutate, replay)
}

export function isAgencyClientUpdatePath(path: string): boolean {
  return CLIENT_UPDATE_ROUTE.test(path)
}

export function isAgencyClientCreatePath(path: string): boolean {
  return path === CLIENT_CREATE_ROUTE
}

export function isAgencyClientCrmSettingsUpdatePath(path: string): boolean {
  return CLIENT_CRM_SETTINGS_UPDATE_ROUTE.test(path)
}

export async function executeGodModeAgencyClientUpdate<T extends { id: string }>(
  event: H3Event,
  mutate: (db: GodModeTransactionDb) => Promise<T>,
  replay: (db: GodModeTransactionDb, resultReference: string) => Promise<T>
): Promise<T> {
  return await execute(event, 'client', mutate, replay)
}

export async function executeGodModeAgencyClientCreate<T extends { id: string }>(
  event: H3Event,
  mutate: (db: GodModeTransactionDb) => Promise<T>,
  replay: (db: GodModeTransactionDb, resultReference: string) => Promise<T>
): Promise<T> {
  return await execute(event, 'create', mutate, replay)
}

export async function executeGodModeAgencyClientCrmSettingsUpdate<T extends { id: string }>(
  event: H3Event,
  mutate: (db: GodModeTransactionDb) => Promise<T>,
  replay: (db: GodModeTransactionDb, resultReference: string) => Promise<T>
): Promise<T> {
  return await execute(event, 'crm-settings', mutate, replay)
}

export function registerGodModeAgencyClientMutationFamilies(): () => void {
  const unregisterCreate = registerGodModeMutationFamily({
    family: 'agency-client-create',
    method: 'POST',
    matchesPath: isAgencyClientCreatePath,
    prepare: event => prepare(event, 'create')
  })
  const unregisterClient = registerGodModeMutationFamily({
    family: 'agency-client-update',
    method: 'PUT',
    matchesPath: isAgencyClientUpdatePath,
    prepare: event => prepare(event, 'client')
  })
  const unregisterCrm = registerGodModeMutationFamily({
    family: 'agency-client-crm-settings-update',
    method: 'PUT',
    matchesPath: isAgencyClientCrmSettingsUpdatePath,
    prepare: event => prepare(event, 'crm-settings')
  })
  return () => {
    unregisterCrm()
    unregisterClient()
    unregisterCreate()
  }
}
