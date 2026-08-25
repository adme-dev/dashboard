/**
 * God-mode mutation families for the QR tool.
 *
 * Owners run every non-GET /api route under the execution ledger; a write route without a
 * registered family is refused with 503 "God mode mutation coordination required". Each family
 * here is transaction-bound: the route hands its DB work to `executeQrMutation`, which runs it
 * inside the coordinated transaction for owners and a plain transaction for everyone else.
 */
import type { H3Event } from 'h3'
import { createError, getRequestURL, readBody, readRawBody } from 'h3'

import { transaction } from '~~/server/utils/db'
import { sha256Hex } from '~~/server/utils/exportTokens'
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
const BASE = '/api/agency/qr-codes'
const COMP = '/api/agency/qr-competitions'

export type QrMutationKind
  = 'code-create' | 'code-update' | 'code-delete' | 'bulk-create' | 'settings-update'
    | 'folder-create' | 'folder-update' | 'folder-delete'
    | 'logo-upload'
    | 'page-save' | 'page-publish' | 'page-asset-upload'
    | 'competition-create' | 'competition-update' | 'competition-draw' | 'competition-document-upload' | 'competition-document-delete'

interface FamilyDef { kind: QrMutationKind, method: 'POST' | 'PUT' | 'PATCH' | 'DELETE', matches: (path: string) => boolean, name: string, multipart?: boolean }

const FAMILIES: FamilyDef[] = [
  { kind: 'code-create', method: 'POST', matches: p => p === BASE, name: 'QR code creation' },
  { kind: 'bulk-create', method: 'POST', matches: p => p === `${BASE}/bulk`, name: 'QR bulk code creation' },
  { kind: 'settings-update', method: 'PATCH', matches: p => p === `${BASE}/settings`, name: 'QR client settings update' },
  { kind: 'code-update', method: 'PATCH', matches: p => new RegExp(`^${BASE}/${UUID}$`, 'i').test(p), name: 'QR code update' },
  { kind: 'code-delete', method: 'DELETE', matches: p => new RegExp(`^${BASE}/${UUID}$`, 'i').test(p), name: 'QR code deletion' },
  { kind: 'folder-create', method: 'POST', matches: p => p === `${BASE}/folders`, name: 'QR folder creation' },
  { kind: 'folder-update', method: 'PATCH', matches: p => new RegExp(`^${BASE}/folders/${UUID}$`, 'i').test(p), name: 'QR folder rename' },
  { kind: 'folder-delete', method: 'DELETE', matches: p => new RegExp(`^${BASE}/folders/${UUID}$`, 'i').test(p), name: 'QR folder deletion' },
  { kind: 'logo-upload', method: 'POST', matches: p => p === `${BASE}/logo`, name: 'QR logo upload', multipart: true },
  { kind: 'page-save', method: 'PUT', matches: p => new RegExp(`^${BASE}/${UUID}/page$`, 'i').test(p), name: 'QR page save' },
  { kind: 'page-publish', method: 'POST', matches: p => new RegExp(`^${BASE}/${UUID}/page/publish$`, 'i').test(p), name: 'QR page publish' },
  { kind: 'page-asset-upload', method: 'POST', matches: p => new RegExp(`^${BASE}/${UUID}/page/assets$`, 'i').test(p), name: 'QR page asset upload', multipart: true },
  { kind: 'competition-create', method: 'POST', matches: p => p === COMP, name: 'competition creation' },
  { kind: 'competition-update', method: 'PATCH', matches: p => new RegExp(`^${COMP}/${UUID}$`, 'i').test(p), name: 'competition update' },
  { kind: 'competition-draw', method: 'POST', matches: p => new RegExp(`^${COMP}/${UUID}/draw$`, 'i').test(p), name: 'competition draw' },
  { kind: 'competition-document-upload', method: 'POST', matches: p => new RegExp(`^${COMP}/${UUID}/documents$`, 'i').test(p), name: 'competition document upload', multipart: true },
  { kind: 'competition-document-delete', method: 'DELETE', matches: p => new RegExp(`^${COMP}/${UUID}/documents/${UUID}$`, 'i').test(p), name: 'competition document removal' }
]

const operationsKey = Symbol('qrGodModeOperations')
type Operations = Partial<Record<QrMutationKind, GodModeTransactionOperation>>

function operations(event: H3Event): Operations {
  const context = event.context as Record<PropertyKey, unknown>
  const existing = context[operationsKey] as Operations | undefined
  if (existing) return existing
  const created: Operations = {}
  context[operationsKey] = created
  return created
}

function operationFor(event: H3Event, def: FamilyDef): GodModeTransactionOperation {
  const store = operations(event)
  const existing = store[def.kind]
  if (existing) return existing
  const operation = defineGodModeTransactionOperation({
    routeOrTool: `${def.method} ${getRequestURL(event).pathname}`,
    mutationName: def.name,
    missingResultMessage: `God mode ${def.name} did not produce a durable result`,
    retryableInProgress: true
  })
  store[def.kind] = operation
  return operation
}

async function digest(event: H3Event, def: FamilyDef): Promise<string> {
  if (def.multipart) {
    // Multipart bodies are digested raw; h3 caches the raw body so the route can still parse it.
    const raw = await readRawBody(event, false)
    return await sha256Hex(raw ? Buffer.from(raw).toString('base64') : '')
  }
  if (def.method === 'DELETE') return await sha256Hex(getRequestURL(event).pathname)
  return await digestMcpRequestBody(await readBody(event))
}

/**
 * Run a QR write inside the right transaction boundary. `mutate` must use `db.query` (pg-style
 * `{ rows }`) and return an object with an `id` — the ledger's replay reference. `replay` must
 * rebuild the same response from that id when an owner retries with the same Idempotency-Key.
 */
export async function executeQrMutation<T extends { id: string }>(
  event: H3Event,
  kind: QrMutationKind,
  mutate: (db: GodModeTransactionDb) => Promise<T>,
  replay: (db: GodModeTransactionDb, resultReference: string) => Promise<T>
): Promise<T> {
  const store = (event.context as Record<PropertyKey, unknown> | undefined)?.[operationsKey] as Operations | undefined
  // Staff requests have no prepared operation: same transaction boundary, no ledger claim.
  if (!store) return await transaction(mutate)
  const operation = store[kind]
  if (!operation) throw createError({ statusCode: 503, statusMessage: 'God mode mutation coordination unavailable' })
  return await executeGodModeTransactionMutation(event, operation, transaction, mutate, replay)
}

export function registerGodModeQrMutationFamilies(): () => void {
  const unregister = FAMILIES.map(def => registerGodModeMutationFamily({
    family: `qr-${def.kind}`,
    method: def.method,
    matchesPath: def.matches,
    prepare: async event => await prepareGodModeTransactionMutation(event, operationFor(event, def), {
      transaction,
      appendAudit: appendGodModeAuditEvent,
      digestRequest: async request => await digest(request, def)
    })
  }))
  return () => {
    for (const fn of unregister.reverse()) fn()
  }
}
