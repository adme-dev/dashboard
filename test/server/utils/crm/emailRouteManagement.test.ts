import { describe, expect, it, vi } from 'vitest'
import {
  createCrmLeadInboxRoute,
  listCrmLeadInboxRoutes,
  revokeCrmLeadInboxRoute,
  rotateCrmLeadInboxRoute,
  toCrmEmailRouteSummary
} from '~~/server/utils/crm/emailRouteManagement'

const CLIENT_ID = '11111111-1111-4111-8111-111111111111'
const OTHER_CLIENT_ID = '99999999-9999-4999-8999-999999999999'
const ROUTE_ID = '22222222-2222-4222-8222-222222222222'
const REPLACEMENT_ROUTE_ID = '44444444-4444-4444-8444-444444444444'
const ACTOR_ID = '33333333-3333-4333-8333-333333333333'
const ISSUED_TOKEN = 'v7.AAAAAAAAAAAAAAAAAAAAAA.AAAAAAAAAAAAAAAAAAAAAAAAAAA'
const ROUTE_TOKEN_HASH = 'b'.repeat(64)

function routeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: ROUTE_ID,
    client_id: CLIENT_ID,
    label: 'Website enquiries',
    route_kind: 'lead_inbox' as const,
    recipient_domain: 'inbound.xeroflow.io',
    expires_at: null,
    last_used_at: null,
    is_active: true,
    created_at: '2026-07-31T00:00:00.000Z',
    revoked_at: null,
    route_token_hash: 'a'.repeat(64),
    token_version: 7,
    ...overrides
  }
}

function createInput() {
  return {
    clientId: CLIENT_ID,
    label: 'Website enquiries',
    actor: { id: ACTOR_ID, type: 'team_member' as const },
    issuance: {
      currentVersion: 7,
      domain: 'inbound.xeroflow.io',
      secret: 'a-secret-longer-than-thirty-two-bytes'
    }
  }
}

function lifecycleInput() {
  return {
    clientId: CLIENT_ID,
    routeId: ROUTE_ID,
    actor: { id: ACTOR_ID, type: 'team_member' as const },
    issuance: {
      currentVersion: 7,
      domain: 'inbound.xeroflow.io',
      secret: 'a-secret-longer-than-thirty-two-bytes'
    }
  }
}

function lifecycleDependencies(options: {
  route?: Record<string, unknown> | null
  replacementInsertError?: Error
  revokeUpdateError?: Error
  auditError?: Error
} = {}) {
  const calls: Array<{ sql: string, params: unknown[] }> = []
  let rolledBack = false
  const route = options.route === undefined ? routeRow() : options.route
  const replacement = routeRow({
    id: REPLACEMENT_ROUTE_ID,
    label: 'Website enquiries',
    is_active: false
  })
  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      if (/FROM agency_clients/.test(sql)) {
        return { rows: [{ lead_capture_mode: 'full_crm' }] }
      }
      if (/FROM team_members/.test(sql)) return { rows: [{ allowed: true }] }
      if (/SELECT[\s\S]*FROM crm_email_routes/.test(sql)) {
        return {
          rows: route === null || route.client_id !== params[1]
            ? []
            : [route]
        }
      }
      if (/INSERT INTO crm_email_routes/.test(sql)) {
        if (options.replacementInsertError) throw options.replacementInsertError
        return { rows: [replacement] }
      }
      if (/UPDATE crm_email_routes[\s\S]*replaced_by_route_id/.test(sql)) {
        if (options.revokeUpdateError) throw options.revokeUpdateError
        return { rows: [] }
      }
      if (/UPDATE crm_email_routes[\s\S]*is_active = TRUE/.test(sql)) {
        return { rows: [routeRow({ id: REPLACEMENT_ROUTE_ID })] }
      }
      if (/UPDATE crm_email_routes/.test(sql)) {
        if (options.revokeUpdateError) throw options.revokeUpdateError
        return { rows: [routeRow({ is_active: false, revoked_at: '2026-07-31T01:00:00.000Z' })] }
      }
      if (/INSERT INTO crm_email_route_audits/.test(sql)) {
        if (options.auditError) throw options.auditError
        return { rows: [] }
      }
      throw new Error(`Unexpected SQL: ${sql}`)
    })
  }
  const transaction = vi.fn(async (callback: (client: typeof db) => Promise<unknown>) => {
    try {
      return await callback(db)
    } catch (error) {
      rolledBack = true
      throw error
    }
  })
  const createToken = vi.fn().mockResolvedValue({
    token: ISSUED_TOKEN,
    routeTokenHash: ROUTE_TOKEN_HASH
  })

  return {
    calls,
    transaction,
    createToken,
    get rolledBack() { return rolledBack },
    dependencies: {
      queryRows: vi.fn(),
      transaction,
      createToken,
      emailConversationsEnabled: () => true
    }
  }
}

function createDependencies(options: {
  leadCaptureMode?: string
  teamMemberAllowed?: boolean
  activeRoute?: boolean
  insertError?: Error & { code?: string }
  enabled?: boolean
} = {}) {
  const calls: Array<{ sql: string, params: unknown[] }> = []
  const db = {
    query: vi.fn(async (sql: string, params: unknown[] = []) => {
      calls.push({ sql, params })
      if (/FROM agency_clients/.test(sql)) {
        return { rows: [{ lead_capture_mode: options.leadCaptureMode ?? 'full_crm' }] }
      }
      if (/FROM team_members/.test(sql)) {
        return { rows: [{ allowed: options.teamMemberAllowed ?? true }] }
      }
      if (/SELECT id[\s\S]*FROM crm_email_routes/.test(sql)) {
        return { rows: options.activeRoute ? [{ id: ROUTE_ID }] : [] }
      }
      if (/INSERT INTO crm_email_routes/.test(sql)) {
        if (options.insertError) throw options.insertError
        return { rows: [routeRow()] }
      }
      if (/INSERT INTO crm_email_route_audits/.test(sql)) return { rows: [] }
      throw new Error(`Unexpected SQL: ${sql}`)
    })
  }
  const transaction = vi.fn(async (callback: (client: typeof db) => Promise<unknown>) => callback(db))
  const createToken = vi.fn().mockResolvedValue({
    token: ISSUED_TOKEN,
    routeTokenHash: ROUTE_TOKEN_HASH
  })

  return {
    calls,
    transaction,
    createToken,
    dependencies: {
      queryRows: vi.fn(),
      transaction,
      createToken,
      emailConversationsEnabled: () => options.enabled ?? true
    }
  }
}

describe('CRM lead inbox route management', () => {
  it('projects a route without its token-bearing fields', () => {
    const row = routeRow()

    const summary = toCrmEmailRouteSummary(row, { includeClientId: false })

    expect(summary).toEqual({
      id: ROUTE_ID,
      label: 'Website enquiries',
      kind: 'lead_inbox',
      recipientDomain: 'inbound.xeroflow.io',
      status: 'never_used',
      createdAt: '2026-07-31T00:00:00.000Z',
      expiresAt: null,
      lastUsedAt: null,
      revokedAt: null,
      canRotate: true,
      canRevoke: true,
      addressAvailable: false
    })
    expect(summary).not.toHaveProperty('routeTokenHash')
    expect(summary).not.toHaveProperty('tokenVersion')
    expect(JSON.stringify(summary)).not.toContain(row.route_token_hash)
  })

  it('lists only lead inbox routes belonging to the requested client', async () => {
    const queryRows = vi.fn().mockResolvedValue([routeRow()])

    await expect(listCrmLeadInboxRoutes({ clientId: CLIENT_ID }, { queryRows }))
      .resolves.toEqual([expect.objectContaining({ id: ROUTE_ID, clientId: CLIENT_ID })])

    expect(queryRows).toHaveBeenCalledOnce()
    const [sql, params] = queryRows.mock.calls[0]!
    expect(sql).toContain("route_kind = 'lead_inbox'")
    expect(sql).toContain('client_id = $1')
    expect(sql).not.toContain('route_token_hash')
    expect(sql).not.toContain('token_version')
    expect(params).toEqual([CLIENT_ID])
  })

  it('creates one CRM inbox route under a locked, CRM-enabled client with a safe audit record', async () => {
    const { calls, transaction, createToken, dependencies } = createDependencies()
    const issuedAddress = `lead+${ISSUED_TOKEN}@inbound.xeroflow.io`

    const result = await createCrmLeadInboxRoute(createInput(), dependencies as never)

    expect(transaction).toHaveBeenCalledOnce()
    expect(calls[0]?.sql).toContain('FROM agency_clients')
    expect(calls[0]?.sql).toContain('FOR UPDATE')
    expect(calls[1]?.sql).toContain('FROM team_members')
    expect(calls[1]?.sql).toContain('client_team_assignments')
    expect(calls[2]?.sql).toContain('FROM crm_email_routes')
    expect(calls[2]?.sql).toContain("route_kind = 'lead_inbox'")
    expect(calls[2]?.sql).toContain('FOR UPDATE')
    expect(createToken).toHaveBeenCalledWith({
      version: 7,
      domain: 'inbound.xeroflow.io',
      secret: 'a-secret-longer-than-thirty-two-bytes'
    })

    const insert = calls[3]!
    expect(insert.sql).toContain('INSERT INTO crm_email_routes')
    expect(insert.sql).toContain('route_token_hash')
    expect(insert.sql).not.toContain('RETURNING route_token_hash')
    expect(insert.params).toContain(ROUTE_TOKEN_HASH)
    expect(insert.params).not.toContain(ISSUED_TOKEN)

    const audit = calls[4]!
    expect(audit.sql).toContain('INSERT INTO crm_email_route_audits')
    expect(audit.sql).toContain('route_id, client_id, actor_id, actor_type, action')
    expect(audit.sql).not.toContain('metadata')
    expect(audit.params).toEqual([ROUTE_ID, CLIENT_ID, ACTOR_ID, 'team_member'])

    expect(result).toMatchObject({
      route: expect.objectContaining({ id: ROUTE_ID, addressAvailable: false }),
      issuedAddress,
      addressShownOnce: true
    })
    expect(JSON.stringify(result).split(issuedAddress)).toHaveLength(2)
    expect(JSON.stringify(calls)).not.toContain(issuedAddress)
  })

  it('requires the CRM email conversations gate before opening a transaction', async () => {
    const { transaction, dependencies } = createDependencies({ enabled: false })

    await expect(createCrmLeadInboxRoute(createInput(), dependencies as never))
      .rejects.toMatchObject({ statusCode: 403 })

    expect(transaction).not.toHaveBeenCalled()
  })

  it('rejects clients that are not entitled to internal CRM', async () => {
    const { calls, dependencies } = createDependencies({ leadCaptureMode: 'capture_only' })

    await expect(createCrmLeadInboxRoute(createInput(), dependencies as never))
      .rejects.toMatchObject({ statusCode: 403 })

    expect(calls).toHaveLength(1)
  })

  it('rejects an unassigned team member before route issuance', async () => {
    const { calls, createToken, dependencies } = createDependencies({ teamMemberAllowed: false })

    await expect(createCrmLeadInboxRoute(createInput(), dependencies as never))
      .rejects.toMatchObject({ statusCode: 403 })

    expect(createToken).not.toHaveBeenCalled()
    expect(calls).toHaveLength(2)
  })

  it('returns a conflict without issuing a token when an active route already exists', async () => {
    const { calls, createToken, dependencies } = createDependencies({ activeRoute: true })

    await expect(createCrmLeadInboxRoute(createInput(), dependencies as never))
      .rejects.toMatchObject({ statusCode: 409 })

    expect(createToken).not.toHaveBeenCalled()
    expect(calls).toHaveLength(3)
  })

  it('maps a database uniqueness conflict to the active-route conflict response', async () => {
    const uniquenessError = Object.assign(new Error('unique violation'), { code: '23505' })
    const { dependencies } = createDependencies({ insertError: uniquenessError })

    await expect(createCrmLeadInboxRoute(createInput(), dependencies as never))
      .rejects.toMatchObject({ statusCode: 409 })
  })

  it('rotates a locked tenant-scoped active route atomically and only reveals its replacement once', async () => {
    const { calls, transaction, createToken, dependencies } = lifecycleDependencies()
    const issuedAddress = `lead+${ISSUED_TOKEN}@inbound.xeroflow.io`

    const result = await rotateCrmLeadInboxRoute(lifecycleInput(), dependencies)

    expect(transaction).toHaveBeenCalledOnce()
    const lockedRouteIndex = calls.findIndex(call => /FROM crm_email_routes/.test(call.sql))
    const replacementInsertIndex = calls.findIndex(call => /INSERT INTO crm_email_routes/.test(call.sql))
    const oldRouteRevokeIndex = calls.findIndex(call => /UPDATE crm_email_routes[\s\S]*replaced_by_route_id/.test(call.sql))
    const replacementActivateIndex = calls.findIndex(call => /UPDATE crm_email_routes[\s\S]*is_active = TRUE/.test(call.sql))
    const auditIndex = calls.findIndex(call => /INSERT INTO crm_email_route_audits/.test(call.sql))
    const lockedRoute = calls[lockedRouteIndex]!

    expect(lockedRoute.sql).toContain("route_kind = 'lead_inbox'")
    expect(lockedRoute.sql).toContain('client_id = $2')
    expect(lockedRoute.sql).toContain('is_active = TRUE')
    expect(lockedRoute.sql).toContain('revoked_at IS NULL')
    expect(lockedRoute.sql).toContain('FOR UPDATE')
    expect(lockedRoute.params).toEqual([ROUTE_ID, CLIENT_ID])
    expect(replacementInsertIndex).toBeGreaterThan(lockedRouteIndex)
    expect(oldRouteRevokeIndex).toBeGreaterThan(replacementInsertIndex)
    expect(replacementActivateIndex).toBeGreaterThan(oldRouteRevokeIndex)
    expect(auditIndex).toBeGreaterThan(replacementActivateIndex)
    expect(createToken).toHaveBeenCalledWith({
      version: 7,
      domain: 'inbound.xeroflow.io',
      secret: 'a-secret-longer-than-thirty-two-bytes'
    })

    const replacementInsert = calls[replacementInsertIndex]!
    expect(replacementInsert.params).toContain(ROUTE_TOKEN_HASH)
    expect(replacementInsert.params).not.toContain(ISSUED_TOKEN)

    const oldRouteRevoke = calls[oldRouteRevokeIndex]!
    expect(oldRouteRevoke.sql).toContain('is_active = FALSE')
    expect(oldRouteRevoke.sql).toContain('revoked_at = NOW()')
    expect(oldRouteRevoke.sql).toContain('revoked_by = $1')
    expect(oldRouteRevoke.sql).toContain('revoked_actor_type = $2')
    expect(oldRouteRevoke.sql).toContain("revoked_reason = 'rotated'")
    expect(oldRouteRevoke.sql).toContain('replaced_by_route_id = $3')
    expect(oldRouteRevoke.sql).toContain('updated_at = NOW()')
    expect(oldRouteRevoke.params).toEqual([ACTOR_ID, 'team_member', REPLACEMENT_ROUTE_ID, ROUTE_ID, CLIENT_ID])

    const audit = calls[auditIndex]!
    expect(audit.sql).toContain('route_id, client_id, actor_id, actor_type, action')
    expect(audit.sql).not.toContain('metadata')
    expect(audit.params).toEqual([ROUTE_ID, CLIENT_ID, ACTOR_ID, 'team_member'])
    expect(JSON.stringify(calls)).not.toContain(issuedAddress)
    expect(result).toMatchObject({
      route: expect.objectContaining({ id: REPLACEMENT_ROUTE_ID, addressAvailable: false }),
      issuedAddress,
      addressShownOnce: true
    })
    expect(JSON.stringify(result).split(issuedAddress)).toHaveLength(2)
  })

  it.each([
    ['absent route', null],
    ['cross-tenant route', routeRow({ client_id: OTHER_CLIENT_ID })]
  ])('returns the same 404 for a rotation of a %s', async (_caseName, route) => {
    const { createToken, dependencies } = lifecycleDependencies({ route })

    await expect(rotateCrmLeadInboxRoute(lifecycleInput(), dependencies))
      .rejects.toMatchObject({ statusCode: 404, statusMessage: 'CRM inbox route not found' })

    expect(createToken).not.toHaveBeenCalled()
  })

  it.each([
    ['replacement insert', { replacementInsertError: new Error('insert failed') }],
    ['old route revocation', { revokeUpdateError: new Error('update failed') }],
    ['rotation audit', { auditError: new Error('audit failed') }]
  ])('rolls back the rotation when the %s write fails', async (_write, options) => {
    const dependencies = lifecycleDependencies(options)

    await expect(rotateCrmLeadInboxRoute(lifecycleInput(), dependencies.dependencies))
      .rejects.toThrow(/failed/)

    expect(dependencies.rolledBack).toBe(true)
  })

  it('soft-revokes a locked tenant-scoped route with a safe audit row', async () => {
    const { calls, transaction, dependencies } = lifecycleDependencies()
    const { issuance: _issuance, ...input } = lifecycleInput()

    const result = await revokeCrmLeadInboxRoute(input, dependencies)

    expect(transaction).toHaveBeenCalledOnce()
    const lockedRouteIndex = calls.findIndex(call => /FROM crm_email_routes/.test(call.sql))
    const revokeIndex = calls.findIndex(call => /UPDATE crm_email_routes/.test(call.sql))
    const auditIndex = calls.findIndex(call => /INSERT INTO crm_email_route_audits/.test(call.sql))
    const lockedRoute = calls[lockedRouteIndex]!
    const revoke = calls[revokeIndex]!
    const audit = calls[auditIndex]!

    expect(lockedRoute.sql).toContain("route_kind = 'lead_inbox'")
    expect(lockedRoute.sql).toContain('client_id = $2')
    expect(lockedRoute.sql).toContain('FOR UPDATE')
    expect(lockedRoute.params).toEqual([ROUTE_ID, CLIENT_ID])
    expect(revokeIndex).toBeGreaterThan(lockedRouteIndex)
    expect(auditIndex).toBeGreaterThan(revokeIndex)
    expect(revoke.sql).toContain('is_active = FALSE')
    expect(revoke.sql).toContain('revoked_at = NOW()')
    expect(revoke.sql).toContain('revoked_by = $1')
    expect(revoke.sql).toContain('revoked_actor_type = $2')
    expect(revoke.sql).toContain("revoked_reason = 'revoked'")
    expect(revoke.sql).toContain('updated_at = NOW()')
    expect(revoke.params).toEqual([ACTOR_ID, 'team_member', ROUTE_ID, CLIENT_ID])
    expect(audit.sql).toContain('route_id, client_id, actor_id, actor_type, action')
    expect(audit.sql).not.toContain('metadata')
    expect(audit.params).toEqual([ROUTE_ID, CLIENT_ID, ACTOR_ID, 'team_member'])
    expect(result).toEqual({
      route: expect.objectContaining({
        id: ROUTE_ID,
        status: 'revoked',
        addressAvailable: false
      })
    })
  })

  it('returns an already revoked same-tenant route without another mutation or audit', async () => {
    const { calls, dependencies } = lifecycleDependencies({
      route: routeRow({ is_active: false, revoked_at: '2026-07-31T01:00:00.000Z' })
    })
    const { issuance: _issuance, ...input } = lifecycleInput()

    await expect(revokeCrmLeadInboxRoute(input, dependencies)).resolves.toEqual({
      route: expect.objectContaining({ id: ROUTE_ID, status: 'revoked' })
    })

    expect(calls.some(call => /UPDATE crm_email_routes/.test(call.sql))).toBe(false)
    expect(calls.some(call => /INSERT INTO crm_email_route_audits/.test(call.sql))).toBe(false)
  })

  it.each([
    ['absent route', null],
    ['cross-tenant route', routeRow({ client_id: OTHER_CLIENT_ID })]
  ])('returns the same 404 when revoking a %s', async (_caseName, route) => {
    const { dependencies } = lifecycleDependencies({ route })
    const { issuance: _issuance, ...input } = lifecycleInput()

    await expect(revokeCrmLeadInboxRoute(input, dependencies))
      .rejects.toMatchObject({ statusCode: 404, statusMessage: 'CRM inbox route not found' })
  })
})
