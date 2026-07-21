import { createError, type H3Event } from 'h3'
import {
  type PlatformAgentKey,
  verifyPlatformAgentScopeAssertion
} from '~~/shared/utils/platformAgentScopeAssertion'
import {
  createPlatformAgentAuthority,
  type PlatformAgentAuthority
} from './platformAgentScope'

export interface PlatformAgentBridgeAssertionInput {
  assertion: string
  expectedAgent: PlatformAgentKey
  secret: string
  nowMs?: number
}

const REQUIRED_PERMISSIONS: Record<PlatformAgentKey, readonly string[]> = {
  'spend-controller': ['MEDIA_BUYING'],
  'publishing-planner': ['CLIENTS', 'MEDIA_BUYING', 'CREATIVE'],
  'financial-watch': ['FINANCE'],
  'traffic-controller': ['ADMIN']
}

export async function platformAgentAuthorityFromScopeAssertion(
  input: PlatformAgentBridgeAssertionInput
): Promise<PlatformAgentAuthority | null> {
  const claims = await verifyPlatformAgentScopeAssertion({
    token: input.assertion,
    secret: input.secret,
    expectedAgent: input.expectedAgent,
    nowMs: input.nowMs
  })
  if (!claims || !REQUIRED_PERMISSIONS[input.expectedAgent].some(permission => claims.permissions.includes(permission))) {
    return null
  }

  try {
    return createPlatformAgentAuthority({
      actor: { type: 'user', id: claims.subject },
      tenantId: claims.tenantId,
      allowedClientIds: claims.clientIds,
      permissions: claims.permissions,
      correlationId: claims.correlationId,
      source: 'signed_service_assertion'
    })
  } catch {
    return null
  }
}

export async function optionalPlatformAgentAssertionAuthority(
  event: H3Event,
  expectedAgent: PlatformAgentKey
): Promise<PlatformAgentAuthority | null> {
  const assertion = getHeader(event, 'x-platform-agent-scope-assertion')?.trim()
  if (!assertion) return null

  const authority = await platformAgentAuthorityFromScopeAssertion({
    assertion,
    expectedAgent,
    secret: process.env.PLATFORM_AGENT_SCOPE_SIGNING_SECRET || ''
  })
  if (!authority) {
    throw createError({ statusCode: 401, statusMessage: 'Invalid platform agent scope assertion' })
  }
  return authority
}
