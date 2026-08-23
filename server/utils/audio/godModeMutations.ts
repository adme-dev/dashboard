// God mode coordination for the Audio / Video Studio editing core.
//
// Owners are always in God mode, and the God mode middleware refuses every
// non-GET /api route that has no registered mutation family. Without this file
// an owner cannot autosave, snapshot, create or delete a studio project.
//
// Only the four DB-bound editing routes are registered. Render, upload and AI
// generation routes fan out to Queues / R2 / AI Gateway and are not
// transaction-bound, so they stay unregistered (the UI explains why).
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
const CREATE_ROUTE = '/api/agency/audio/projects'
const DELETE_ROUTE = new RegExp(`^/api/agency/audio/projects/${UUID}$`, 'i')
const TIMELINE_ROUTE = new RegExp(`^/api/agency/audio/projects/${UUID}/timeline$`, 'i')
const VERSIONS_ROUTE = new RegExp(`^/api/agency/audio/projects/${UUID}/versions$`, 'i')
const operationsKey = Symbol('mediaProjectGodModeOperations')

type Kind = 'create' | 'delete' | 'timeline' | 'version'
type Operations = Partial<Record<Kind, GodModeTransactionOperation>>

const MUTATION_NAME: Record<Kind, string> = {
  create: 'media project creation',
  delete: 'media project deletion',
  timeline: 'media timeline save',
  version: 'media timeline version snapshot'
}
const METHOD: Record<Kind, string> = { create: 'POST', delete: 'DELETE', timeline: 'PUT', version: 'POST' }

function operations(event: H3Event): Operations {
  const context = event.context as Record<PropertyKey, unknown>
  const existing = context[operationsKey] as Operations | undefined
  if (existing) return existing
  const created: Operations = {}
  context[operationsKey] = created
  return created
}

function operationFor(event: H3Event, kind: Kind): GodModeTransactionOperation {
  const store = operations(event)
  const existing = store[kind]
  if (existing) return existing
  const operation = defineGodModeTransactionOperation({
    routeOrTool: `${METHOD[kind]} ${getRequestURL(event).pathname}`,
    mutationName: MUTATION_NAME[kind],
    missingResultMessage: `God mode ${MUTATION_NAME[kind]} did not produce a durable result`,
    retryableInProgress: true
  })
  store[kind] = operation
  return operation
}

async function prepare(event: H3Event, kind: Kind) {
  return await prepareGodModeTransactionMutation(event, operationFor(event, kind), {
    transaction,
    appendAudit: appendGodModeAuditEvent,
    // DELETE has no body; digest the (empty) body consistently.
    digestRequest: async request => await digestMcpRequestBody((await readBody(request).catch(() => null)) ?? {})
  })
}

async function execute<T extends { id: string }>(
  event: H3Event,
  kind: Kind,
  mutate: (db: GodModeTransactionDb) => Promise<T>,
  replay: (db: GodModeTransactionDb, resultReference: string) => Promise<T>
): Promise<T> {
  const store = (event.context as Record<PropertyKey, unknown> | undefined)?.[operationsKey] as Operations | undefined
  // Ordinary staff requests have no prepared God mode operation: same
  // transaction boundary, no execution-ledger claim.
  if (!store) return await transaction(mutate)
  const operation = store[kind]
  if (!operation) {
    throw createError({ statusCode: 503, statusMessage: 'God mode mutation coordination unavailable' })
  }
  return await executeGodModeTransactionMutation(event, operation, transaction, mutate, replay)
}

export function isMediaProjectCreatePath(path: string): boolean { return path === CREATE_ROUTE }
export function isMediaProjectDeletePath(path: string): boolean { return DELETE_ROUTE.test(path) }
export function isMediaProjectTimelineSavePath(path: string): boolean { return TIMELINE_ROUTE.test(path) }
export function isMediaProjectVersionCreatePath(path: string): boolean { return VERSIONS_ROUTE.test(path) }

type Mutate<T> = (db: GodModeTransactionDb) => Promise<T>
type Replay<T> = (db: GodModeTransactionDb, resultReference: string) => Promise<T>

export const executeGodModeMediaProjectCreate = <T extends { id: string }>(event: H3Event, mutate: Mutate<T>, replay: Replay<T>) =>
  execute(event, 'create', mutate, replay)
export const executeGodModeMediaProjectDelete = <T extends { id: string }>(event: H3Event, mutate: Mutate<T>, replay: Replay<T>) =>
  execute(event, 'delete', mutate, replay)
export const executeGodModeMediaTimelineSave = <T extends { id: string }>(event: H3Event, mutate: Mutate<T>, replay: Replay<T>) =>
  execute(event, 'timeline', mutate, replay)
export const executeGodModeMediaVersionCreate = <T extends { id: string }>(event: H3Event, mutate: Mutate<T>, replay: Replay<T>) =>
  execute(event, 'version', mutate, replay)

export function registerGodModeMediaProjectMutationFamilies(): () => void {
  const unregisters = [
    registerGodModeMutationFamily({
      family: 'media-project-create',
      method: 'POST',
      matchesPath: isMediaProjectCreatePath,
      prepare: event => prepare(event, 'create')
    }),
    registerGodModeMutationFamily({
      family: 'media-project-delete',
      method: 'DELETE',
      matchesPath: isMediaProjectDeletePath,
      prepare: event => prepare(event, 'delete')
    }),
    registerGodModeMutationFamily({
      family: 'media-timeline-save',
      method: 'PUT',
      matchesPath: isMediaProjectTimelineSavePath,
      prepare: event => prepare(event, 'timeline')
    }),
    registerGodModeMutationFamily({
      family: 'media-timeline-version-create',
      method: 'POST',
      matchesPath: isMediaProjectVersionCreatePath,
      prepare: event => prepare(event, 'version')
    })
  ]
  return () => { for (const unregister of unregisters.reverse()) unregister() }
}
