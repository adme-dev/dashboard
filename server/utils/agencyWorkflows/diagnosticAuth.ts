import { createHash, timingSafeEqual } from 'node:crypto'
import type { H3Event } from 'h3'
import { getHeader } from 'h3'

import { requireRole, type User } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'

export const AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET_ENV = 'AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET'
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

function option(env: NodeJS.ProcessEnv, name: string): string {
  return String(env[name] ?? '').trim()
}

function sha256(input: string): Buffer {
  return createHash('sha256').update(input).digest()
}

function timingSafeSecretEqual(actual: string, expected: string): boolean {
  return timingSafeEqual(sha256(actual), sha256(expected))
}

export function hasValidAgencyWorkflowSmokeSecret(
  event: H3Event,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  const expected = option(env, AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET_ENV)
  if (!expected) return false

  const actual = String(getHeader(event, AGENCY_WORKFLOWS_SMOKE_SECRET_HEADER) ?? '').trim()
  if (!actual) return false

  return timingSafeSecretEqual(actual, expected)
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
