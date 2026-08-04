import type { H3Event } from 'h3'
import { getRequestURL } from 'h3'

import type { GodModeAuditEventInput, GodModeBypassedControl } from '~~/server/utils/godMode/audit'
import { resolveGodModeAuthority } from '~~/server/utils/godMode/authority'

const READ_ONLY_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])
const requestAuditStateKey = Symbol('godModeRouteAuditState')
const mutationCoordinationKey = Symbol('godModeMutationCoordination')

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

function context(event: H3Event): Record<PropertyKey, unknown> {
  return event.context as Record<PropertyKey, unknown>
}

function requestMethod(event: H3Event): string {
  return String(event.method || 'GET').toUpperCase()
}

function requestPath(event: H3Event): string {
  const injectedPath = (event as H3Event & { path?: unknown }).path
  if (typeof injectedPath === 'string') return injectedPath
  return getRequestURL(event).pathname
}

export function isGodModeMutationRequest(event: H3Event): boolean {
  return !READ_ONLY_METHODS.has(requestMethod(event))
}

export function seedGodModeRouteAuditState(event: H3Event, seed: GodModeRouteAuditSeed): GodModeRouteAuditState {
  const existing = context(event)[requestAuditStateKey]
  if (existing) return existing as GodModeRouteAuditState

  const state: GodModeRouteAuditState = {
    ...seed,
    bypassedControls: new Set(),
    handlerFailed: false
  }
  context(event)[requestAuditStateKey] = state
  return state
}

export function getGodModeRouteAuditState(event: H3Event): GodModeRouteAuditState | null {
  return (context(event)[requestAuditStateKey] as GodModeRouteAuditState | undefined) ?? null
}

export function markGodModeRouteFailure(event: H3Event): void {
  const state = getGodModeRouteAuditState(event)
  if (state) state.handlerFailed = true
}

export function registerGodModeMutationCoordination(
  event: H3Event,
  coordination: GodModeMutationCoordination,
  getPath: (event: H3Event) => string = requestPath
): void {
  const method = requestMethod(event)
  const path = getPath(event)
  if (coordination.prepared !== true
    || !['transaction-bound', 'task5-execution-ledger'].includes(coordination.strategy)
    || coordination.method.toUpperCase() !== method
    || coordination.route !== path
    || typeof coordination.persistTerminal !== 'function') {
    throw new Error('Invalid God mode mutation coordination')
  }
  context(event)[mutationCoordinationKey] = coordination
  const state = getGodModeRouteAuditState(event)
  if (state) state.mutationCoordination = coordination
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
  event: H3Event,
  getPath: (event: H3Event) => string = requestPath
): Promise<void> {
  if (!isGodModeMutationRequest(event)) return
  const method = requestMethod(event)
  const path = getPath(event)
  const matches = [...mutationFamilies.values()]
    .filter(family => family.method === method && family.matchesPath(path))
  if (matches.length === 0) return
  if (matches.length !== 1) throw new Error('Ambiguous God mode mutation family')

  const family = matches[0]
  if (!family) throw new Error('God mode mutation family disappeared')
  const prepared = await family.prepare(event)
  registerGodModeMutationCoordination(event, {
    ...prepared,
    method,
    route: path
  }, getPath)
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
  const userId = (event.context as any).user?.id
  if (typeof userId !== 'string') return false

  const authority = await resolveGodModeAuthority(event, userId)
  if (!authority.active) return false

  const state = getGodModeRouteAuditState(event)
  if (!isGodModeMutationRequest(event)) {
    state?.bypassedControls.add(control)
    return true
  }

  if (!state) return false
  const coordination = exactMutationCoordination(event)
  if (!coordination) return false
  state.bypassedControls.add(control)
  state.mutationCoordination = coordination
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
