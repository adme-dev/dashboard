import { createHash, randomUUID } from 'node:crypto'
import type { H3Event } from 'h3'
import { createError, getCookie, getHeader, getRequestURL, isError } from 'h3'

import {
  appendGodModeAuditEvent,
  type GodModeAuditEventInput,
  type GodModeBypassedControl
} from '~~/server/utils/godMode/audit'
import {
  isActiveGodModeAuthority,
  resolveGodModeAuthority
} from '~~/server/utils/godMode/authority'
import { getTrustedTask5DelegatedExecution } from '~~/server/utils/godMode/internalExecutionDelegation'

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const requestAuditStateKey = Symbol('godModeRouteAuditState')
const requestAuditInternalsKey = Symbol('godModeRouteAuditInternals')
const requestActivationKey = Symbol('godModeRouteActivation')
const mutationCoordinationKey = Symbol('godModeMutationCoordination')
const TRUSTED_BYPASS_CONTROLS = new Set<GodModeBypassedControl>([
  'permission',
  'feature_flag',
  'release_policy',
  'evaluation_policy',
  'personal_policy',
  'budget',
  'rate_limit',
  'confirmation',
  'mcp_scope',
  'mcp_suite_flag'
])

export interface ReviewedGodModeReadRoute {
  method: 'GET' | 'HEAD' | 'OPTIONS'
  path: string
  file: string
  bypassedGate: GodModeBypassedControl
  independentScope: string
  mutationClass: 'read-only'
  terminalStrategy: string
}

const REVIEWED_READ_ROUTES: readonly ReviewedGodModeReadRoute[] = [
  {
    method: 'GET',
    path: '/api/agency/operations/queue-health',
    file: 'server/api/agency/operations/queue-health.get.ts',
    bypassedGate: 'permission',
    independentScope: 'agency-global authenticated staff operations telemetry',
    mutationClass: 'read-only',
    terminalStrategy: 'route attempt plus DB terminal with strict queue fallback'
  },
  {
    method: 'GET',
    path: '/api/crm/ai/status',
    file: 'server/api/crm/ai/status.get.ts',
    bypassedGate: 'feature_flag',
    independentScope: 'agency-global authenticated staff status',
    mutationClass: 'read-only',
    terminalStrategy: 'route attempt plus DB terminal with strict queue fallback'
  }
]

export type GodModeMutationAuditStrategy = 'transaction-bound' | 'task5-execution-ledger'

export interface GodModeMutationCoordination {
  strategy: GodModeMutationAuditStrategy
  method: string
  route: string
  /** Set only after the transaction/outbox coordinator has durably admitted this exact operation. */
  prepared: true
  persistTerminal: (event: GodModeAuditEventInput) => Promise<void>
}

export interface GodModeMutationFamily {
  family: string
  method: string
  matchesPath: (path: string) => boolean
  prepare: (event: H3Event) => Promise<{
    strategy: GodModeMutationAuditStrategy
    prepared: true
    persistTerminal: (event: GodModeAuditEventInput) => Promise<void>
  }>
}

const mutationFamilies = new Map<string, GodModeMutationFamily>()

export class GodModeMutationCoordinationError extends Error {
  constructor(
    message: string,
    readonly reason: 'required' | 'ambiguous' | 'unavailable'
  ) {
    super(message)
    this.name = 'GodModeMutationCoordinationError'
  }
}

export interface GodModeRouteAuditSeed {
  actorUserId: string
  correlationId: string
  sessionDigest: string
  routeOrTool: string
  emergencyDisabled: boolean
}

export interface GodModeRouteAuditState extends GodModeRouteAuditSeed {
  bypassedControls: Set<GodModeBypassedControl>
  handlerFailed: boolean
  terminalPromise?: Promise<void>
  mutationCoordination?: GodModeMutationCoordination
}

export interface GodModeRouteAuditDependencies {
  appendGodModeAuditEvent: typeof appendGodModeAuditEvent
}

interface GodModeRouteAuditInternals {
  seed: Readonly<GodModeRouteAuditSeed>
  dependencies: GodModeRouteAuditDependencies
  bypassPersistence: Map<string, Promise<void>>
}

const defaultRouteAuditDependencies: GodModeRouteAuditDependencies = {
  appendGodModeAuditEvent
}

function context(event: H3Event): Record<PropertyKey, unknown> {
  return event.context as Record<PropertyKey, unknown>
}

function requestMethod(event: H3Event): string {
  return String(event.method || 'GET').toUpperCase()
}

function requestPath(event: H3Event): string {
  return getRequestURL(event).pathname
}

export function listReviewedGodModeReadRoutes(): ReviewedGodModeReadRoute[] {
  return REVIEWED_READ_ROUTES.map(route => ({ ...route }))
}

export function listRegisteredGodModeMutationFamilies(): Array<{ family: string, method: string }> {
  return [...mutationFamilies.values()].map(({ family, method }) => ({ family, method }))
}

export function isGodModeMutationRequest(event: H3Event): boolean {
  return !READ_ONLY_METHODS.has(requestMethod(event))
}

export function seedGodModeRouteAuditState(
  event: H3Event,
  seed: GodModeRouteAuditSeed,
  dependencies: GodModeRouteAuditDependencies = defaultRouteAuditDependencies
): GodModeRouteAuditState {
  const existing = context(event)[requestAuditStateKey]
  if (existing) return existing as GodModeRouteAuditState

  const state: GodModeRouteAuditState = {
    ...seed,
    bypassedControls: new Set(),
    handlerFailed: false
  }
  context(event)[requestAuditStateKey] = state
  context(event)[requestAuditInternalsKey] = {
    seed: Object.freeze({ ...seed }),
    dependencies: Object.freeze({ ...dependencies }),
    bypassPersistence: new Map()
  } satisfies GodModeRouteAuditInternals
  return state
}

export function getGodModeRouteAuditState(event: H3Event): GodModeRouteAuditState | null {
  return (context(event)[requestAuditStateKey] as GodModeRouteAuditState | undefined) ?? null
}

export function markGodModeRouteFailure(event: H3Event): void {
  const state = getGodModeRouteAuditState(event)
  if (state) state.handlerFailed = true
}

function requestSessionToken(event: H3Event): string | null {
  const cookieToken = getCookie(event, 'auth_token') || getCookie(event, 'auth_token_client')
  const authorization = getHeader(event, 'authorization')
  return cookieToken || (authorization?.startsWith('Bearer ') ? authorization.slice(7) : null)
}

async function activateGodModeApplicationRequest(
  event: H3Event,
  actorUserId: string
): Promise<GodModeRouteAuditState> {
  const existing = getGodModeRouteAuditState(event)
  if (existing) return existing

  const pending = context(event)[requestActivationKey] as Promise<GodModeRouteAuditState> | undefined
  if (pending) return await pending

  const activation = (async () => {
    const sessionToken = requestSessionToken(event)
    if (!sessionToken) {
      throw createError({ statusCode: 503, statusMessage: 'God mode audit unavailable' })
    }

    const method = requestMethod(event)
    const path = requestPath(event)
    const seed: GodModeRouteAuditSeed = {
      actorUserId,
      correlationId: randomUUID(),
      sessionDigest: createHash('sha256').update(sessionToken).digest('hex'),
      routeOrTool: `${method} ${path}`,
      emergencyDisabled: false
    }

    try {
      await defaultRouteAuditDependencies.appendGodModeAuditEvent({
        ...seed,
        channel: 'application',
        phase: 'attempt',
        bypassedControls: [],
        outcomeCode: 'started'
      })
    } catch {
      throw createError({ statusCode: 503, statusMessage: 'God mode audit unavailable' })
    }

    const state = seedGodModeRouteAuditState(event, seed)
    try {
      await prepareRegisteredGodModeMutation(event)
    } catch (error) {
      if (error instanceof GodModeMutationCoordinationError && error.reason === 'required') {
        throw createError({ statusCode: 503, statusMessage: 'God mode mutation coordination required' })
      }
      if (isError(error) && error.statusCode >= 400 && error.statusCode < 500) throw error
      throw createError({ statusCode: 503, statusMessage: 'God mode mutation coordination unavailable' })
    }
    return state
  })()
  context(event)[requestActivationKey] = activation
  return await activation
}

/**
 * Persist server-classified bypasses as immutable pre-execution evidence, then add them to the
 * request terminal summary. The state exists only after lazy application activation durably wrote
 * the attempt event.
 * Missing, mismatched, late, or failed persistence stops the bypassed operation; client data is
 * never accepted at this boundary.
 */
export async function recordGodModeBypassedControls(
  event: H3Event,
  controls: readonly GodModeBypassedControl[]
): Promise<void> {
  // Task 5 owns the attempt, bypass evidence, and terminal for its runtime-branded exact request.
  if (await getTrustedTask5DelegatedExecution(event)) return

  const actorUserId = (context(event).user as { id?: unknown } | undefined)?.id
  const method = requestMethod(event)
  const path = requestPath(event)
  const authority = typeof actorUserId === 'string'
    ? await resolveGodModeAuthority(event, actorUserId)
    : null

  if (
    typeof actorUserId !== 'string'
    || !isActiveGodModeAuthority(authority, actorUserId)
    || controls.length === 0
    || controls.some(control => !TRUSTED_BYPASS_CONTROLS.has(control))
  ) {
    throw createError({ statusCode: 503, statusMessage: 'God mode audit unavailable' })
  }

  const state = await activateGodModeApplicationRequest(event, actorUserId)
  const internals = context(event)[requestAuditInternalsKey] as GodModeRouteAuditInternals | undefined

  if (
    !internals
    || state.actorUserId !== actorUserId
    || internals.seed.actorUserId !== actorUserId
    || state.correlationId !== internals.seed.correlationId
    || state.sessionDigest !== internals.seed.sessionDigest
    || state.routeOrTool !== `${method} ${path}`
    || internals.seed.routeOrTool !== `${method} ${path}`
    || state.emergencyDisabled !== internals.seed.emergencyDisabled
    || state.terminalPromise
  ) {
    throw createError({ statusCode: 503, statusMessage: 'God mode audit unavailable' })
  }

  const normalizedControls = [...new Set(controls)].sort()
  const persistenceKey = normalizedControls.join('\u0000')
  let persistence = internals.bypassPersistence.get(persistenceKey)
  if (!persistence) {
    persistence = (async () => {
      await internals.dependencies.appendGodModeAuditEvent({
        actorUserId: internals.seed.actorUserId,
        correlationId: internals.seed.correlationId,
        sessionDigest: internals.seed.sessionDigest,
        channel: 'application',
        routeOrTool: internals.seed.routeOrTool,
        phase: 'bypass',
        bypassedControls: normalizedControls,
        outcomeCode: 'pre_execution',
        emergencyDisabled: internals.seed.emergencyDisabled
      })
      for (const control of controls) state.bypassedControls.add(control)
    })()
    internals.bypassPersistence.set(persistenceKey, persistence)
  }

  try {
    await persistence
  } catch {
    throw createError({ statusCode: 503, statusMessage: 'God mode audit unavailable' })
  }
}

export function registerGodModeMutationCoordination(
  event: H3Event,
  coordination: GodModeMutationCoordination
): void {
  const method = requestMethod(event)
  const path = requestPath(event)
  const state = getGodModeRouteAuditState(event)
  if (!state || state.routeOrTool !== `${method} ${path}`) {
    throw new GodModeMutationCoordinationError('God mode route attempt required', 'unavailable')
  }
  if (coordination.prepared !== true
    || !['transaction-bound', 'task5-execution-ledger'].includes(coordination.strategy)
    || coordination.method.toUpperCase() !== method
    || coordination.route !== path
    || typeof coordination.persistTerminal !== 'function') {
    throw new Error('Invalid God mode mutation coordination')
  }
  context(event)[mutationCoordinationKey] = coordination
  state.mutationCoordination = coordination
}

export function registerGodModeMutationFamily(family: GodModeMutationFamily): () => void {
  const method = family.method.toUpperCase()
  if (!family.family.trim()
    || READ_ONLY_METHODS.has(method)
    || typeof family.matchesPath !== 'function'
    || typeof family.prepare !== 'function'
    || mutationFamilies.has(family.family)) {
    throw new Error('Invalid God mode mutation family')
  }
  const registered = { ...family, method }
  mutationFamilies.set(family.family, registered)
  return () => {
    if (mutationFamilies.get(family.family) === registered) mutationFamilies.delete(family.family)
  }
}

export async function prepareRegisteredGodModeMutation(
  event: H3Event
): Promise<void> {
  if (!isGodModeMutationRequest(event)) return
  const method = requestMethod(event)
  const path = requestPath(event)
  const state = getGodModeRouteAuditState(event)
  if (!state || state.routeOrTool !== `${method} ${path}`) {
    throw new GodModeMutationCoordinationError('God mode route attempt required', 'unavailable')
  }
  const matches = [...mutationFamilies.values()]
    .filter(family => family.method === method && family.matchesPath(path))
  if (matches.length === 0) {
    throw new GodModeMutationCoordinationError('God mode mutation coordination required', 'required')
  }
  if (matches.length !== 1) {
    throw new GodModeMutationCoordinationError('Ambiguous God mode mutation family', 'ambiguous')
  }

  const family = matches[0]
  if (!family) throw new Error('God mode mutation family disappeared')
  const prepared = await family.prepare(event)
  registerGodModeMutationCoordination(event, {
    ...prepared,
    method,
    route: path
  })
}

function exactMutationCoordination(event: H3Event): GodModeMutationCoordination | null {
  const coordination = context(event)[mutationCoordinationKey] as GodModeMutationCoordination | undefined
  if (!coordination) return null
  try {
    if (coordination.method.toUpperCase() !== requestMethod(event) || coordination.route !== requestPath(event)) return null
  } catch {
    return null
  }
  return coordination
}

export async function canBypassApplicationControl(
  event: H3Event,
  control: GodModeBypassedControl
): Promise<boolean> {
  const userId = (context(event).user as { id?: unknown } | undefined)?.id
  if (typeof userId !== 'string') return false

  // A valid runtime marker proves Task 5 already persisted the sole MCP attempt and owns its terminal.
  // Do not create application route state or another terminal; allow only the exact 14-target event to pass
  // centralized application permission/feature controls while all independent handler validation runs.
  if (await getTrustedTask5DelegatedExecution(event)) return true

  const authority = await resolveGodModeAuthority(event, userId)
  // This application path accepts only the direct result of the resolver call above; no authority data
  // enters through a caller-facing parameter here.
  if (!isActiveGodModeAuthority(authority, userId)) return false

  if (!isGodModeMutationRequest(event)) {
    const method = requestMethod(event)
    const path = requestPath(event)
    const reviewed = REVIEWED_READ_ROUTES.some(route => (
      route.method === method
      && route.path === path
      && route.bypassedGate === control
    ))
    if (!reviewed) return false
    const state = await activateGodModeApplicationRequest(event, userId)
    if (state.routeOrTool !== `${method} ${path}`) return false
    await recordGodModeBypassedControls(event, [control])
    return true
  }

  await activateGodModeApplicationRequest(event, userId)
  const coordination = exactMutationCoordination(event)
  if (!coordination) return false
  await recordGodModeBypassedControls(event, [control])
  return true
}

export async function isApplicationCapabilityEnabled(
  event: H3Event,
  normalGate: boolean | (() => boolean | Promise<boolean>)
): Promise<boolean> {
  const normallyEnabled = typeof normalGate === 'function'
    ? await normalGate()
    : normalGate
  if (normallyEnabled) return true
  return await canBypassApplicationControl(event, 'feature_flag')
}
