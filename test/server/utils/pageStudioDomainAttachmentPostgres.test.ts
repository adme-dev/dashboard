import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import pg from 'pg'
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { domainAttachmentService, type DomainDatabase, type DomainTransaction } from '~~/server/utils/pageStudio/domainAttachment'
import type { DomainHostname } from '~~/server/utils/pageStudio/domainAttachmentProvider'

vi.mock('~~/server/utils/db', () => ({ transactionWithoutRetry: vi.fn(() => {
  throw new Error('Live database access prohibited')
}) }))
const url = process.env.PAGE_STUDIO_DOMAINS_DATABASE_TEST_URL
const ids = { client: randomUUID(), otherClient: randomUUID(), site: randomUUID(), site2: randomUUID(), otherSite: randomUUID(), entitlement: randomUUID(), otherEntitlement: randomUUID(), staff: randomUUID(), role: randomUUID() }
const config = { apiToken: 'local-only', zoneId: 'a'.repeat(32), cnameTarget: 'sites.example.com' }
const input = { actorId: ids.staff, tenantId: 'domain-test', siteId: ids.site, hostname: 'customer.example.com' }
const other = { ...input, siteId: ids.otherSite }
const providerRows = new Map<string, DomainHostname>()
const provider = { create: vi.fn(), get: vi.fn(), find: vi.fn() }
const state = { ownershipValidation: { dnsVerified: true, providerConfigured: true }, certificateValidation: [], hostnameStatus: 'active', tlsStatus: 'active', dnsStatus: 'active', lifecycleState: 'active' }
describe.runIf(Boolean(url))('durable domain attachment on disposable PostgreSQL', () => {
  let pool: pg.Pool
  let connected = false
  const schema = `domain_attach_${randomUUID().replaceAll('-', '')}`
  let tx: DomainTransaction
  const service = () => domainAttachmentService(config, { transaction: tx, provider })
  const execute = (sql: string, values: unknown[] = []) => pool.query(sql, values)
  beforeAll(async () => {
    const parsed = new URL(url!)
    expect(['127.0.0.1', 'localhost']).toContain(parsed.hostname)
    expect(parsed.pathname).toBe('/page_studio_domains_disposable')
    expect(process.env.PAGE_STUDIO_DOMAINS_DATABASE_ALLOW_MUTATION).toBe('disposable-only')
    pool = new pg.Pool({ connectionString: url, max: 8, connectionTimeoutMillis: 3000, options: `-c search_path=${schema},pg_catalog -c statement_timeout=15000 -c lock_timeout=5000` })
    pool.on('error', () => undefined)
    await execute(`CREATE SCHEMA "${schema}"`)
    connected = true
    await execute(`CREATE TABLE agency_clients(id UUID PRIMARY KEY,is_active BOOLEAN NOT NULL);
      CREATE TABLE team_members(id UUID PRIMARY KEY,is_active BOOLEAN,user_role TEXT,custom_role_id UUID);
      CREATE TABLE custom_roles(id UUID PRIMARY KEY,slug TEXT,is_system BOOLEAN,is_read_only BOOLEAN);
      CREATE TABLE role_permission_groups(role_id UUID,permission_group TEXT,PRIMARY KEY(role_id,permission_group));
      CREATE TABLE page_studio_entitlements(id UUID PRIMARY KEY,tenant_id TEXT,client_id UUID,status TEXT,effective_from TIMESTAMPTZ,effective_until TIMESTAMPTZ,custom_domain_limit INTEGER);
      CREATE TABLE page_studio_sites(id UUID PRIMARY KEY,tenant_id TEXT,client_id UUID,entitlement_id UUID,status TEXT,UNIQUE(tenant_id,client_id,id));
      CREATE TABLE page_studio_audit_events(tenant_id TEXT,client_id UUID,site_id UUID,actor_id UUID,actor_role TEXT,action TEXT,resource_type TEXT,resource_id UUID,metadata JSONB);`)
    const control = readFileSync('server/database/migrations/402_page_studio_control_plane.sql', 'utf8')
    await execute(control.slice(control.indexOf('CREATE TABLE IF NOT EXISTS page_studio_domains ('), control.indexOf('CREATE TABLE IF NOT EXISTS page_studio_assets (')))
    const migration = readFileSync('server/database/migrations/419_page_studio_domain_operations.sql', 'utf8')
    await execute(migration)
    await execute(migration) // Additive migration is repeatable.
    tx = async (callback) => {
      const client = await pool.connect()
      try {
        await client.query('BEGIN')
        try {
          const result = await callback(client as unknown as DomainDatabase)
          await client.query('COMMIT')
          return result
        } catch (error) {
          await client.query('ROLLBACK')
          throw error
        }
      } finally {
        client.release()
      }
    }
  })
  beforeEach(async () => {
    providerRows.clear()
    vi.resetAllMocks()
    await execute('TRUNCATE page_studio_domain_operations,page_studio_domains,page_studio_audit_events,page_studio_sites,page_studio_entitlements,role_permission_groups,custom_roles,team_members,agency_clients CASCADE')
    await execute('INSERT INTO agency_clients VALUES ($1,TRUE),($2,TRUE)', [ids.client, ids.otherClient])
    await execute('INSERT INTO team_members VALUES ($1,TRUE,\'admin\',$2)', [ids.staff, ids.role])
    await execute('INSERT INTO custom_roles VALUES ($1,\'custom-domain-editor\',FALSE,FALSE)', [ids.role])
    await execute('INSERT INTO role_permission_groups VALUES ($1,\'PAGE_STUDIO_EDIT\')', [ids.role])
    await execute('INSERT INTO page_studio_entitlements VALUES ($1,\'domain-test\',$2,\'active\',NOW()-INTERVAL \'1 hour\',NOW()+INTERVAL \'1 hour\',2),($3,\'domain-test\',$4,\'active\',NOW()-INTERVAL \'1 hour\',NOW()+INTERVAL \'1 hour\',2)', [ids.entitlement, ids.client, ids.otherEntitlement, ids.otherClient])
    await execute('INSERT INTO page_studio_sites VALUES ($1,\'domain-test\',$2,$3,\'draft\'),($4,\'domain-test\',$2,$3,\'draft\'),($5,\'domain-test\',$6,$7,\'draft\')', [ids.site, ids.client, ids.entitlement, ids.site2, ids.otherSite, ids.otherClient, ids.otherEntitlement])
    provider.find.mockImplementation(async (host: string) => providerRows.get(host) ?? null)
    provider.get.mockImplementation(async (id: string) => [...providerRows.values()].find(row => row.id === id) ?? null)
    provider.create.mockImplementation(async (host: string, owner: string) => {
      const row = { id: randomUUID().replaceAll('-', ''), hostname: host, custom_metadata: { page_studio_owner: owner }, status: 'active', ssl: { status: 'active' } }
      providerRows.set(host, row)
      return row
    })
  })
  afterAll(async () => {
    if (!pool)
      return
    try {
      if (connected)
        await execute(`DROP SCHEMA "${schema}" CASCADE`)
    } finally {
      await pool.end()
    }
  })
  it.each([
    ['ALTER TABLE page_studio_domain_operations RENAME TO hidden_operations', 'ALTER TABLE hidden_operations RENAME TO page_studio_domain_operations'],
    ['ALTER TABLE page_studio_domain_operations RENAME COLUMN domain_id TO hidden_domain_id', 'ALTER TABLE page_studio_domain_operations RENAME COLUMN hidden_domain_id TO domain_id']
  ])('returns a safe schema-pending failure before effects: %s', async (hide, restore) => {
    await execute(hide)
    try {
      await expect(service().prepare(input)).rejects.toMatchObject({ code: 'DOMAIN_SCHEMA_PENDING', statusCode: 503 })
      expect(provider.create).not.toHaveBeenCalled()
      expect((await execute('SELECT COUNT(*)::int count FROM page_studio_domains')).rows[0].count).toBe(0)
    } finally {
      await execute(restore)
    }
  })
  it.each(['', 'https://sites.example.com/path'])('keeps a missing/invalid target reservation retryable: %s', async (cnameTarget) => {
    await expect(domainAttachmentService({ ...config, cnameTarget }, { transaction: tx, provider }).prepare(input)).rejects.toMatchObject({ code: 'DOMAIN_PROVIDER_UNAVAILABLE' })
    expect(provider.create).not.toHaveBeenCalled()
    expect((await execute('SELECT state,attempt_id FROM page_studio_domain_operations')).rows[0]).toEqual({ state: 'reserved', attempt_id: null })
    await expect(service().prepare(input)).resolves.toMatchObject({ operation: { state: 'attached' } })
  })
  it('reconciles a lost response and retained ID even when the target configuration disappears', async () => {
    const create = provider.create.getMockImplementation()!
    provider.create.mockImplementationOnce(async (host, owner) => {
      await create(host, owner)
      throw new Error('response lost')
    })
    await expect(service().prepare(input)).rejects.toThrow('response lost')
    const recovering = domainAttachmentService({ ...config, cnameTarget: '' }, { transaction: tx, provider })
    const recovered = await recovering.prepare(input)
    expect(recovered.operation?.state).toBe('attached')
    expect((await recovering.prepare(input)).current.id).toBe(recovered.current.id)
    expect(provider.create).toHaveBeenCalledOnce()
  })
  it('commits domain, quota reservation and attempt identity before creating at the provider', async () => {
    const create = provider.create.getMockImplementation()!
    provider.create.mockImplementation(async (host, owner) => {
      const row = (await execute('SELECT operation.*,domain.cloudflare_hostname_id FROM page_studio_domain_operations operation JOIN page_studio_domains domain ON domain.id=operation.domain_id')).rows[0]
      expect(row).toMatchObject({ state: 'creating', owner_token: owner, cloudflare_hostname_id: null })
      expect(row.attempt_id).toBeTruthy()
      expect(row.create_started_at).toBeTruthy()
      return create(host, owner)
    })
    const result = await service().prepare(input)
    expect(result.operation?.state).toBe('attached')
    expect(result.current.cloudflare_hostname_id).toBe(result.provider?.id)
    expect((await execute('SELECT COUNT(*)::int count FROM page_studio_domains')).rows[0].count).toBe(1)
  })
  it('replays exact attachment without a second provider create or audit event', async () => {
    const first = await service().prepare(input)
    const second = await service().prepare(input)
    expect(second.current.id).toBe(first.current.id)
    expect(provider.create).toHaveBeenCalledOnce()
    expect((await execute('SELECT COUNT(*)::int count FROM page_studio_audit_events')).rows[0].count).toBe(1)
  })
  it('recovers a lost response solely by exact owned hostname, keeping its attempt receipt', async () => {
    const create = provider.create.getMockImplementation()!
    provider.create.mockImplementationOnce(async (host, owner) => {
      await create(host, owner)
      throw new Error('response lost')
    })
    await expect(service().prepare(input)).rejects.toThrow('response lost')
    const before = (await execute('SELECT * FROM page_studio_domain_operations')).rows[0]
    const result = await service().prepare(input)
    expect(result.operation?.attempt_id).toBe(before.attempt_id)
    expect(result.current.id).toBe(before.domain_id)
    expect(provider.create).toHaveBeenCalledOnce()
  })
  it('never recreates an uncertain attempt when exact lookup returns no resource', async () => {
    provider.create.mockRejectedValueOnce(new Error('uncertain'))
    await expect(service().prepare(input)).rejects.toThrow('uncertain')
    await expect(service().prepare(input)).rejects.toMatchObject({ code: 'DOMAIN_RECONCILIATION_REQUIRED' })
    expect(provider.create).toHaveBeenCalledOnce()
    expect((await execute('SELECT state FROM page_studio_domain_operations')).rows[0].state).toBe('creating')
  })
  it('rejects a preexisting provider hostname even if someone copied an owner marker', async () => {
    providerRows.set(input.hostname, { id: 'b'.repeat(32), hostname: input.hostname, custom_metadata: { page_studio_owner: 'foreign' } })
    await expect(service().prepare(input)).rejects.toMatchObject({ code: 'DOMAIN_PROVIDER_MISMATCH' })
    expect(provider.create).not.toHaveBeenCalled()
    expect((await execute('SELECT state FROM page_studio_domain_operations')).rows[0].state).toBe('reserved')
  })
  it('retains a configured-later reservation and refuses a foreign hostname when configuration returns', async () => {
    const initial = await domainAttachmentService({ ...config, apiToken: '' }, { transaction: tx, provider: null }).prepare(input)
    expect(initial.current.cloudflare_hostname_id).toBeNull()
    expect(initial.operation?.state).toBe('reserved')
    const result = await service().prepare(input)
    expect(result.current.id).toBe(initial.current.id)
    expect(result.operation?.owner_token).toBe(initial.operation?.owner_token)
  })
  it('does not change attached journal when provider configuration is unavailable', async () => {
    const first = await service().prepare(input)
    const result = await domainAttachmentService({ ...config, apiToken: '' }, { transaction: tx, provider: null }).prepare(input)
    expect(result.operation).toEqual(first.operation)
    expect(result.provider).toBeNull()
    expect(result.current.cloudflare_hostname_id).toBe(first.current.cloudflare_hostname_id)
  })
  it('serializes concurrent exact retries without duplicate provider creation', async () => {
    const results = await Promise.allSettled([service().prepare(input), service().prepare(input)])
    expect(results.some(result => result.status === 'fulfilled')).toBe(true)
    expect(provider.create).toHaveBeenCalledOnce()
    expect((await execute('SELECT COUNT(*)::int count FROM page_studio_domains')).rows[0].count).toBe(1)
    await expect(service().prepare(input)).resolves.toMatchObject({ operation: { state: 'attached' } })
  })
  it('serializes the final client quota slot across different hostnames/sites', async () => {
    await execute('UPDATE page_studio_entitlements SET custom_domain_limit=1 WHERE id=$1', [ids.entitlement])
    const results = await Promise.allSettled([service().prepare(input), service().prepare({ ...input, siteId: ids.site2, hostname: 'second.example.com' })])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect(results.filter(result => result.status === 'rejected')).toHaveLength(1)
    expect((await execute('SELECT COUNT(*)::int count FROM page_studio_domains')).rows[0].count).toBe(1)
    expect(provider.create).toHaveBeenCalledOnce()
  })
  it('allows only one client to reserve a globally unique hostname concurrently', async () => {
    const results = await Promise.allSettled([service().prepare(input), service().prepare(other)])
    expect(results.filter(result => result.status === 'fulfilled')).toHaveLength(1)
    expect((await execute('SELECT COUNT(*)::int count FROM page_studio_domains')).rows[0].count).toBe(1)
    expect(provider.create).toHaveBeenCalledOnce()
  })
  it.each([
    'UPDATE team_members SET is_active=FALSE',
    'UPDATE custom_roles SET is_read_only=TRUE',
    'DELETE FROM role_permission_groups',
    'UPDATE agency_clients SET is_active=FALSE',
    'UPDATE page_studio_sites SET status=\'archived\'',
    'UPDATE page_studio_entitlements SET status=\'cancelled\'',
    'UPDATE page_studio_entitlements SET effective_until=NOW()-INTERVAL \'1 second\'',
    'UPDATE page_studio_entitlements SET effective_from=NOW()+INTERVAL \'1 hour\''
  ])('denies freshly revoked authority: %s', async (sql) => {
    await execute(sql)
    await expect(service().prepare(input)).rejects.toMatchObject({ code: 'DOMAIN_ACCESS_DENIED' })
    expect(provider.find).not.toHaveBeenCalled()
    expect(provider.create).not.toHaveBeenCalled()
  })
  it('denies authority revoked during preflight before a create attempt', async () => {
    provider.find.mockImplementationOnce(async () => {
      await execute('UPDATE team_members SET is_active=FALSE')
      return null
    })
    await expect(service().prepare(input)).rejects.toMatchObject({ code: 'DOMAIN_ACCESS_DENIED' })
    expect(provider.create).not.toHaveBeenCalled()
  })
  it('retains uncertain resource when authority is revoked after create and safely reconciles after restoration', async () => {
    const create = provider.create.getMockImplementation()!
    provider.create.mockImplementationOnce(async (host, owner) => {
      const result = await create(host, owner)
      await execute('UPDATE team_members SET is_active=FALSE')
      return result
    })
    await expect(service().prepare(input)).rejects.toMatchObject({ code: 'DOMAIN_ACCESS_DENIED' })
    expect((await execute('SELECT state FROM page_studio_domain_operations')).rows[0].state).toBe('creating')
    await execute('UPDATE team_members SET is_active=TRUE')
    await expect(service().prepare(input)).resolves.toMatchObject({ operation: { state: 'attached' } })
    expect(provider.create).toHaveBeenCalledOnce()
  })
  it('rejects provider zone, ID, hostname and opaque-owner substitutions', async () => {
    const first = await service().prepare(input)
    await expect(domainAttachmentService({ ...config, zoneId: 'c'.repeat(32) }, { transaction: tx, provider }).prepare(input)).rejects.toMatchObject({ code: 'DOMAIN_PROVIDER_MISMATCH' })
    for (const changed of [{ id: 'c'.repeat(32) }, { hostname: 'foreign.example.com' }, { custom_metadata: { page_studio_owner: randomUUID() } }]) {
      provider.get.mockResolvedValueOnce({ ...first.provider, ...changed })
      await expect(service().prepare(input)).rejects.toMatchObject({ code: 'DOMAIN_PROVIDER_MISMATCH' })
    }
    expect(provider.create).toHaveBeenCalledOnce()
  })
  it('rejects a different ID returned by the initial post-create GET', async () => {
    provider.get.mockImplementationOnce(async () => ({ ...providerRows.get(input.hostname), id: 'c'.repeat(32) }))
    await expect(service().prepare(input)).rejects.toMatchObject({ code: 'DOMAIN_PROVIDER_MISMATCH' })
    expect((await execute('SELECT cloudflare_hostname_id FROM page_studio_domains')).rows[0].cloudflare_hostname_id).toBeNull()
    expect(provider.create).toHaveBeenCalledOnce()
  })
  it('rejects foreign tenant/site retries without touching provider resources', async () => {
    await service().prepare(input)
    provider.create.mockClear()
    provider.get.mockClear()
    await expect(service().prepare({ ...input, tenantId: 'foreign' })).rejects.toMatchObject({ code: 'DOMAIN_ACCESS_DENIED' })
    await expect(service().prepare(other)).rejects.toMatchObject({ code: 'DOMAIN_ALREADY_ATTACHED' })
    expect(provider.get).not.toHaveBeenCalled()
    expect(provider.create).not.toHaveBeenCalled()
  })
  it('keeps a legacy retained provider ID read-only and cannot add an opaque owner retroactively', async () => {
    const legacy = { id: 'b'.repeat(32), hostname: input.hostname, status: 'pending' }
    providerRows.set(input.hostname, legacy)
    await execute('INSERT INTO page_studio_domains(tenant_id,client_id,site_id,normalized_hostname,created_by,cloudflare_hostname_id) VALUES ($1,$2,$3,$4,$5,$6)', [input.tenantId, ids.client, ids.site, input.hostname, ids.staff, legacy.id])
    const result = await service().prepare(input)
    expect(result.provider?.id).toBe(legacy.id)
    expect(result.operation).toBeNull()
    expect(provider.create).not.toHaveBeenCalled()
    expect(provider.find).not.toHaveBeenCalled()
  })
  it('preserves JSON keys and refuses verification after revocation or detach', async () => {
    const first = await service().prepare(input)
    await execute('UPDATE page_studio_domains SET ownership_validation=ownership_validation || \'{"clientNote":"preserve"}\'::jsonb')
    await service().saveVerification(input, first, state)
    expect((await execute('SELECT ownership_validation,lifecycle_state FROM page_studio_domains')).rows[0]).toMatchObject({ ownership_validation: { clientNote: 'preserve', dnsVerified: true }, lifecycle_state: 'active' })
    await execute('UPDATE page_studio_domains SET lifecycle_state=\'detached\'')
    await expect(service().saveVerification(input, first, state)).rejects.toMatchObject({ code: 'DOMAIN_CHANGED' })
  })
  it('does not adopt an ownerless legacy pending row without proof that provider creation was never configured', async () => {
    await execute('INSERT INTO page_studio_domains(tenant_id,client_id,site_id,normalized_hostname,created_by) VALUES ($1,$2,$3,$4,$5)', [input.tenantId, ids.client, ids.site, input.hostname, ids.staff])
    await expect(service().prepare(input)).rejects.toMatchObject({ code: 'DOMAIN_RECONCILIATION_REQUIRED' })
    expect(provider.create).not.toHaveBeenCalled()
  })
})
