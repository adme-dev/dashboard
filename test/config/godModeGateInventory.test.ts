import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const { mockAppendGodModeAuditEvent, mockResolveGodModeAuthority } = vi.hoisted(() => ({
  mockAppendGodModeAuditEvent: vi.fn(),
  mockResolveGodModeAuthority: vi.fn()
}))
vi.mock('../../server/utils/godMode/audit', () => ({
  appendGodModeAuditEvent: mockAppendGodModeAuditEvent
}))
vi.mock('../../server/utils/godMode/authority', () => ({
  resolveGodModeAuthority: (...args: any[]) => mockResolveGodModeAuthority(...args),
  isActiveGodModeAuthority: (authority: unknown, actorUserId: string) => {
    const candidate = authority as Record<string, unknown> | null
    return candidate?.active === true
      && candidate.actorUserId === actorUserId
      && candidate.reason === 'active_owner'
      && candidate.emergencyDisabled === false
  }
}))

import {
  getGodModeRouteAuditState,
  isApplicationCapabilityEnabled,
  prepareRegisteredGodModeMutation,
  registerGodModeMutationFamily,
  seedGodModeRouteAuditState
} from '../../server/utils/godMode/featureGate'

const INVENTORY_ROOTS = ['server', 'app', 'shared'] as const
const TASK_3_OWNED_FILES = new Set([
  'server/utils/auth.ts',
  'server/utils/roleResolver.ts',
  'server/utils/godMode/featureGate.ts',
  'server/middleware/godMode.ts',
  'server/plugins/godModeAudit.ts',
  'server/api/crm/ai/status.get.ts'
])
const GATE_PATTERN = /process\.env\.|useRuntimeConfig\(|runtimeConfig\.|feature.?flag|suite.?enabled|roleHasPermission\(|hasRole\(|user\.role|user_role|permissionGroups|requirePermission\(|requireRole\(|requireWriteAccess\(|requireFreshCrmSearchAdmin|isReadOnlyRole\(|GOD_MODE_DISABLED|AI_GATEWAY_URL/i

const CENTRAL_HELPER_BY_CLASS = {
  identity_tenant_hard_boundary: 'unchanged independent scope helper',
  provider_infrastructure_availability: 'unchanged provider/configuration check',
  application_governance_bypass: 'canBypassApplicationControl / isApplicationCapabilityEnabled',
  ordinary_user_behavior: 'unchanged presentation/ordinary decision',
  unrelated_configuration: 'unchanged runtime configuration'
} as const

const TASK_3_GATE_ROUTING = [
  ['server/utils/auth.ts', 'requireRole / requirePermission / requireWriteAccess', 'application_governance_bypass', 'canBypassApplicationControl'],
  ['server/utils/roleResolver.ts', 'permissionGroups', 'ordinary_user_behavior', 'configured role policy'],
  ['server/middleware/rbac.ts', 'isReadOnlyRole', 'application_governance_bypass', 'canBypassApplicationControl'],
  ['server/utils/godMode/featureGate.ts', 'feature flag adapter', 'application_governance_bypass', 'isApplicationCapabilityEnabled'],
  ['server/plugins/godModeAudit.ts', 'terminal persistence', 'ordinary_user_behavior', 'trusted request audit state']
] as const

type GateClass =
  | 'identity_tenant_hard_boundary'
  | 'provider_infrastructure_availability'
  | 'application_governance_bypass'
  | 'ordinary_user_behavior'
  | 'unrelated_configuration'

function listSourceFiles(root: string): string[] {
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const path = join(root, entry.name)
    if (entry.isDirectory()) return listSourceFiles(path)
    return /\.(ts|vue)$/.test(path) ? [path] : []
  })
}

function classifyGate(file: string, line: string): GateClass {
  if (/GOD_MODE_DISABLED|AI_GATEWAY_URL/i.test(line)
    || (file === 'server/utils/godMode/authority.ts' && /process\.env/.test(line))) {
    return 'provider_infrastructure_availability'
  }
  if (/requirePermission\(|requireRole\(|requireWriteAccess\(|requireFreshCrmSearchAdmin|roleHasPermission\(|hasRole\(|isReadOnlyRole\(|feature.?flag|suite.?enabled|(?:^|[_A-Z])ENABLED(?:\b|_)/i.test(line)) {
    return 'application_governance_bypass'
  }
  if (/secret|api.?key|token|binding|provider|credential|database_url|account_id|bucket|r2_|resend|groq|anthropic|xero|google.?maps/i.test(line)) {
    return 'provider_infrastructure_availability'
  }
  if (/user_role|tenant|client_id|implementation|ownership|assigned_consultant|project_manager_id/i.test(line)
    || /server\/(middleware\/auth|utils\/(?:auth|client|.*access))/.test(file)) {
    return 'identity_tenant_hard_boundary'
  }
  if (/app\/|\.role|permissionGroups/.test(line)) return 'ordinary_user_behavior'
  return 'unrelated_configuration'
}

function legacyInventory() {
  const rows = INVENTORY_ROOTS
    .flatMap(root => listSourceFiles(root))
    .filter(file => !TASK_3_OWNED_FILES.has(file))
    .sort()
    .flatMap(file => readFileSync(file, 'utf8').split(/\r?\n/).flatMap((line) => {
      if (!GATE_PATTERN.test(line)) return []
      const normalized = line.trim().replace(/\s+/g, ' ')
      return [`${file}\t${normalized}\t${classifyGate(file, normalized)}`]
    }))
  const counts = rows.reduce<Record<GateClass, number>>((result, row) => {
    const gateClass = row.slice(row.lastIndexOf('\t') + 1) as GateClass
    result[gateClass]++
    return result
  }, {
    identity_tenant_hard_boundary: 0,
    provider_infrastructure_availability: 0,
    application_governance_bypass: 790,
    ordinary_user_behavior: 0,
    unrelated_configuration: 209
  })
  return {
    rows,
    counts,
    digest: createHash('sha256').update(rows.join('\n')).digest('hex')
  }
}

describe('God mode gate inventory', () => {
  const request = (path: string, method = 'GET', userId = '11111111-1111-4111-8111-111111111111') => ({
    method,
    path,
    context: { user: { id: userId } },
    node: {
      req: {
        originalUrl: path,
        headers: {
          host: 'app.xeroflow.test',
          authorization: 'Bearer owner-session-secret'
        },
        connection: {}
      },
      res: { statusCode: 200, statusMessage: 'OK' }
    }
  }) as any

  beforeEach(() => {
    vi.clearAllMocks()
    mockAppendGodModeAuditEvent.mockResolvedValue(undefined)
    mockResolveGodModeAuthority.mockResolvedValue({
      active: false,
      actorUserId: '22222222-2222-4222-8222-222222222222',
      reason: 'not_owner',
      emergencyDisabled: false
    })
  })

  it('freezes every pre-existing direct gate with an explicit classification', () => {
    const inventory = legacyInventory()
    expect(inventory.rows).toContain(
      "server/utils/godMode/authority.ts\t&& Object.prototype.hasOwnProperty.call(cloudflareEnv, 'GOD_MODE_DISABLED')\tprovider_infrastructure_availability"
    )
    expect(inventory.rows).toContain(
      'server/utils/godMode/authority.ts\t: runtimeEnv.GOD_MODE_DISABLED\tprovider_infrastructure_availability'
    )
    expect(inventory.rows).toContain(
      'server/api/admin/ai/governance/rollout.get.ts\t: typeof process === \'undefined\' ? undefined : process.env.GOD_MODE_DISABLED\tprovider_infrastructure_availability'
    )
    expect(inventory.rows).toContain(
      'server/api/admin/ai/governance/rollout.get.ts\t? requestEnv.GOD_MODE_DISABLED\tprovider_infrastructure_availability'
    )
    expect(inventory.rows).toContain(
      'server/utils/aiVoice.ts\tconst configured = (event.context as any)?.cloudflare?.env?.AI_GATEWAY_URL\tprovider_infrastructure_availability'
    )
    expect(inventory.rows).toContain(
      'server/utils/aiVoice.ts\t?? process.env.AI_GATEWAY_URL\tprovider_infrastructure_availability'
    )
    expect(inventory.rows).toContain(
      'server/api/agency/social/google/merchant-readiness.get.ts\tawait requirePermission(event, \'MEDIA_BUYING\')\tapplication_governance_bypass'
    )
    expect(inventory.rows).toContain(
      'server/api/agency/social/spend/map-account.post.ts\tawait requirePermission(event, \'MEDIA_BUYING\')\tapplication_governance_bypass'
    )
    expect(inventory.rows).toContain(
      'server/utils/leads/destinations/autogate.ts\treturn process.env.AUTOGATE_LEAD_API_VERSION?.toLowerCase() === \'v3\' ? \'v3\' : \'v2\'\tunrelated_configuration'
    )
    expect(inventory.rows).toContain(
      'server/utils/leads/destinations/autogate.ts\tconst username = process.env.AUTOGATE_LEAD_API_USERNAME?.trim()\tunrelated_configuration'
    )
    expect(inventory.rows).toContain(
      'server/utils/leads/destinations/autogate.ts\tconst password = process.env.AUTOGATE_LEAD_API_PASSWORD\tunrelated_configuration'
    )
    expect(inventory.rows).toContain(
      "server/utils/spendSyncJobs.ts\t`SELECT id FROM team_members WHERE is_active = TRUE AND user_role = 'owner'`\tidentity_tenant_hard_boundary"
    )
    expect(inventory.rows).toContain(
      'server/utils/mondayConnection.ts\tconst serviceToken = process.env.MONDAY_API_TOKEN\tprovider_infrastructure_availability'
    )
    expect(inventory.rows).toHaveLength(1563)
    expect(inventory.counts).toEqual({
      identity_tenant_hard_boundary: 108,
      provider_infrastructure_availability: 227,
      application_governance_bypass: 1624,
      ordinary_user_behavior: 174,
      unrelated_configuration: 429
    })
    expect(inventory.digest).toBe('f676156c079506a4350d1e764143c3b23274c80019d7f708687d2eb3afc30d88')
    expect(CENTRAL_HELPER_BY_CLASS).toEqual({
      identity_tenant_hard_boundary: 'unchanged independent scope helper',
      provider_infrastructure_availability: 'unchanged provider/configuration check',
      application_governance_bypass: 'canBypassApplicationControl / isApplicationCapabilityEnabled',
      ordinary_user_behavior: 'unchanged presentation/ordinary decision',
      unrelated_configuration: 'unchanged runtime configuration'
    })
    expect(TASK_3_GATE_ROUTING).toHaveLength(5)
  })

  it('preserves the normal application gate for non-owners', async () => {
    const event = { method: 'GET', context: { user: { id: '22222222-2222-4222-8222-222222222222' } } } as any
    await expect(isApplicationCapabilityEnabled(event, false)).resolves.toBe(false)
  })

  it('evaluates asynchronous normal gates before applying active-owner authority', async () => {
    const normalGate = vi.fn().mockResolvedValue(true)
    const event = { method: 'GET', context: { user: { id: '22222222-2222-4222-8222-222222222222' } } } as any
    await expect(isApplicationCapabilityEnabled(event, normalGate)).resolves.toBe(true)
    expect(normalGate).toHaveBeenCalledTimes(1)
  })

  it('enables a denied application gate for a freshly verified active owner read', async () => {
    const ownerId = '11111111-1111-4111-8111-111111111111'
    mockResolveGodModeAuthority.mockResolvedValue({
      active: true,
      actorUserId: ownerId,
      reason: 'active_owner',
      emergencyDisabled: false
    })
    const event = request('/api/crm/ai/status', 'GET', ownerId)
    seedGodModeRouteAuditState(event, {
      actorUserId: ownerId,
      correlationId: '33333333-3333-4333-8333-333333333333',
      sessionDigest: 'a'.repeat(64),
      routeOrTool: 'GET /api/crm/ai/status',
      emergencyDisabled: false
    })
    await expect(isApplicationCapabilityEnabled(event, false)).resolves.toBe(true)
  })

  it('keeps an unreviewed active-owner read feature gate unavailable', async () => {
    const ownerId = '11111111-1111-4111-8111-111111111111'
    mockResolveGodModeAuthority.mockResolvedValue({
      active: true,
      actorUserId: ownerId,
      reason: 'active_owner',
      emergencyDisabled: false
    })
    const event = request('/api/unreviewed/feature', 'GET', ownerId)
    seedGodModeRouteAuditState(event, {
      actorUserId: ownerId,
      correlationId: '44444444-4444-4444-8444-444444444444',
      sessionDigest: 'b'.repeat(64),
      routeOrTool: 'GET /api/unreviewed/feature',
      emergencyDisabled: false
    })

    await expect(isApplicationCapabilityEnabled(event, false)).resolves.toBe(false)
  })

  it('fails closed when code requests an uncoordinated mutation bypass', async () => {
    const ownerId = '11111111-1111-4111-8111-111111111111'
    mockResolveGodModeAuthority.mockResolvedValue({
      active: true,
      actorUserId: ownerId,
      reason: 'active_owner',
      emergencyDisabled: false
    })
    const event = request('/api/agency/clients', 'POST', ownerId)
    await expect(isApplicationCapabilityEnabled(event, false)).rejects.toMatchObject({
      statusCode: 503,
      statusMessage: 'God mode mutation coordination required'
    })
  })

  it('admits only an exact-route mutation with a prepared durable coordinator', async () => {
    const ownerId = '11111111-1111-4111-8111-111111111111'
    mockResolveGodModeAuthority.mockResolvedValue({
      active: true,
      actorUserId: ownerId,
      reason: 'active_owner',
      emergencyDisabled: false
    })
    const event = request('/api/agency/briefs/templates/template-1/mapping?retry=1', 'PUT', ownerId)
    seedGodModeRouteAuditState(event, {
      actorUserId: ownerId,
      correlationId: '33333333-3333-4333-8333-333333333333',
      sessionDigest: 'a'.repeat(64),
      routeOrTool: 'PUT /api/agency/briefs/templates/template-1/mapping',
      emergencyDisabled: false
    })
    const persistTerminal = vi.fn()
    const unregister = registerGodModeMutationFamily({
      family: 'brief-template-mapping',
      method: 'PUT',
      matchesPath: path => path === '/api/agency/briefs/templates/template-1/mapping',
      prepare: vi.fn().mockResolvedValue({
        strategy: 'task5-execution-ledger',
        prepared: true,
        persistTerminal
      })
    })

    await prepareRegisteredGodModeMutation(event)

    expect(getGodModeRouteAuditState(event)?.mutationCoordination?.strategy).toBe('task5-execution-ledger')
    await expect(isApplicationCapabilityEnabled(event, false)).resolves.toBe(true)
    unregister()
  })

  it('rejects a prepared mutation coordinator when mandatory attempt state is absent', async () => {
    const ownerId = '11111111-1111-4111-8111-111111111111'
    mockResolveGodModeAuthority.mockResolvedValue({
      active: true,
      actorUserId: ownerId,
      reason: 'active_owner',
      emergencyDisabled: false
    })
    const event = request('/api/agency/briefs/templates/template-2/mapping', 'PUT', ownerId)
    const unregister = registerGodModeMutationFamily({
      family: 'missing-attempt-state',
      method: 'PUT',
      matchesPath: path => path.endsWith('/template-2/mapping'),
      prepare: vi.fn().mockResolvedValue({
        strategy: 'task5-execution-ledger',
        prepared: true,
        persistTerminal: vi.fn()
      })
    })
    await expect(prepareRegisteredGodModeMutation(event))
      .rejects.toThrow('God mode route attempt required')

    await expect(isApplicationCapabilityEnabled(event, false)).resolves.toBe(true)
    unregister()
  })
})
