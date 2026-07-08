import { createHash, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { getHeader } from 'h3'

import { requireRole, type User } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'

export const AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET_ENV = 'AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET'
export const AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET_HASH_ENV = 'AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET_SHA256'
export const AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET_HASH_CONFIG = 'agencyWorkflowsSmokeSharedSecretSha256'
export const AGENCY_WORKFLOWS_SMOKE_SECRET_HEADER = 'x-workflow-smoke-secret'

export interface AgencyWorkflowDiagnosticAdminAccess {
  kind: 'admin'
  user: User
}

export interface AgencyWorkflowDiagnosticSmokeAccess {
  kind: 'smoke-secret'
}

export type AgencyWorkflowDiagnosticAccess
  = | AgencyWorkflowDiagnosticAdminAccess
    | AgencyWorkflowDiagnosticSmokeAccess

interface AgencyWorkflowDiagnosticEventContext {
  cloudflare?: {
    env?: Record<string, unknown>
  }
}

function option(env: NodeJS.ProcessEnv | Record<string, unknown>, name: string): string {
  const value = env[name]
  return typeof value === 'string' ? value.trim() : ''
}

function eventEnvOption(event: H3Event, name: string): string {
  const value = (event.context as AgencyWorkflowDiagnosticEventContext).cloudflare?.env?.[name]
  return typeof value === 'string' ? value.trim() : ''
}

function runtimeConfigOption(name: string): string {
  try {
    if (typeof useRuntimeConfig !== 'function') return ''
    const value = (useRuntimeConfig() as Record<string, unknown>)[name]
    return typeof value === 'string' ? value.trim() : ''
  } catch {
    return ''
  }
}

function uniqueOptions(values: string[]): string[] {
  return [...new Set(values.map(value => value.trim()).filter(Boolean))]
}

function smokeSecrets(event: H3Event, env: NodeJS.ProcessEnv): string[] {
  return uniqueOptions([
    eventEnvOption(event, AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET_ENV),
    option(env, AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET_ENV)
  ])
}

function smokeSecretHashes(event: H3Event, env: NodeJS.ProcessEnv): string[] {
  return uniqueOptions([
    eventEnvOption(event, AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET_HASH_ENV),
    option(env, AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET_HASH_ENV),
    runtimeConfigOption(AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET_HASH_CONFIG)
  ])
    .flatMap(value => value.split(/[\s,]+/))
    .map(value => value.toLowerCase())
    .filter(value => /^[a-f0-9]{64}$/.test(value))
}

function sha256(input: string): Buffer {
  return createHash('sha256').update(input).digest()
}

function sha256Hex(input: string): string {
  return createHash('sha256').update(input).digest('hex')
}

function timingSafeSecretEqual(actual: string, expected: string): boolean {
  return timingSafeEqual(sha256(actual), sha256(expected))
}

function timingSafeHexEqual(actual: string, expected: string): boolean {
  return timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'))
}

export function hasValidAgencyWorkflowSmokeSecret(
  event: H3Event,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const actual = String(getHeader(event, AGENCY_WORKFLOWS_SMOKE_SECRET_HEADER) ?? '').trim()
  if (!actual) return false

  const actualHash = sha256Hex(actual)
  if (smokeSecretHashes(event, env).some(expectedHash => timingSafeHexEqual(actualHash, expectedHash))) {
    return true
  }

  return smokeSecrets(event, env).some(expected => timingSafeSecretEqual(actual, expected))
}

export async function requireAgencyWorkflowDiagnosticAccess(
  event: H3Event,
  env: NodeJS.ProcessEnv = process.env
): Promise<AgencyWorkflowDiagnosticAccess> {
  if (hasValidAgencyWorkflowSmokeSecret(event, env)) {
    return { kind: 'smoke-secret' }
  }

  const user = await requireRole(event, PERMISSIONS.ADMIN)
  return { kind: 'admin', user }
}
