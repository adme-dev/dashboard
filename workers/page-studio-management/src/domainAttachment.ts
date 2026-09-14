import { z } from 'zod'
import { requirePortalDomainAuthority } from './portalDomainAuthority'
import { cloudflareDomainProvider, domainFailure, Hostname, requireDomainCnameTarget, verifyDomainHostname, type DomainHostname, type DomainProvider, type DomainProviderConfig } from './domainAttachmentProvider'

export interface DomainDatabase {
  query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<{
    rows: T[]
    rowCount?: number | null
  }>
}
export type DomainTransaction = <T>(callback: (db: DomainDatabase) => Promise<T>) => Promise<T>
export type DomainActor = { actorId: string, tenantId: string, siteId: string } & (
  | { kind: 'agency' }
  | { kind: 'portal', clientId: string }
)
interface Scope {
  clientId: string
  customDomainLimit: number
}
interface DomainRow {
  id: string
  tenant_id: string
  client_id: string
  site_id: string
  normalized_hostname: string
  cloudflare_hostname_id: string | null
  ownership_validation: Record<string, unknown>
  lifecycle_state: string
}
interface Operation {
  id: string
  domain_id: string
  owner_token: string
  zone_id: string | null
  state: 'reserved' | 'creating' | 'attached'
  attempt_id: string | null
}
export interface DomainAttachment {
  scope: Scope
  current: DomainRow
  operation: Operation | null
  provider: DomainHostname | null
}
const ActorBase = z.object({ actorId: z.string().uuid(), tenantId: z.string().min(1).max(200), siteId: z.string().uuid() })
const Actor = z.discriminatedUnion('kind', [ActorBase.extend({ kind: z.literal('agency') }), ActorBase.extend({ kind: z.literal('portal'), clientId: z.string().uuid() })])
function requiredRow<T>(rows: T[]): T {
  const row = rows[0]
  if (rows.length !== 1 || row === undefined) throw domainFailure('DOMAIN_CHANGED', 409)
  return row
}
/** All transactions are single-attempt. No provider operation runs inside one. */
export function domainAttachmentService(config: DomainProviderConfig, dependencies: {
  transaction: DomainTransaction
  provider?: DomainProvider | null
}) {
  const transaction = dependencies.transaction
  const transact: DomainTransaction = async (callback) => {
    try {
      return await transaction(async (db) => {
        await db.query('SET LOCAL statement_timeout = \'15s\'')
        await db.query('SET LOCAL lock_timeout = \'5s\'')
        return callback(db)
      })
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && ['42P01', '42703'].includes(String(error.code)))
        throw domainFailure('DOMAIN_SCHEMA_PENDING', 503)
      throw error
    }
  }
  const provider = dependencies.provider === undefined ? cloudflareDomainProvider(config) : dependencies.provider
  async function authority(db: DomainDatabase, input: DomainActor): Promise<Scope> {
    if (!Actor.safeParse(input).success)
      throw domainFailure('DOMAIN_ACCESS_DENIED', 403)
    if (input.kind === 'portal') return requirePortalDomainAuthority(db, input, true)
    const result = await db.query<Scope>(`
      SELECT site.client_id::text AS "clientId", entitlement.custom_domain_limit AS "customDomainLimit"
      FROM page_studio_sites site
      JOIN agency_clients client ON client.id = site.client_id AND client.is_active = TRUE
      JOIN page_studio_entitlements entitlement ON entitlement.id = site.entitlement_id
       AND entitlement.tenant_id = site.tenant_id AND entitlement.client_id = site.client_id
      JOIN team_members owner ON owner.id = $3 AND owner.is_active = TRUE AND owner.user_role NOT IN ('viewer', 'guest')
      JOIN custom_roles staff_role ON
       ((owner.custom_role_id IS NOT NULL AND staff_role.id = owner.custom_role_id)
        OR (owner.custom_role_id IS NULL AND staff_role.slug = owner.user_role::text AND staff_role.is_system = TRUE))
       AND staff_role.is_read_only = FALSE
      JOIN role_permission_groups staff_permission ON staff_permission.role_id = staff_role.id
       AND staff_permission.permission_group = 'PAGE_STUDIO_EDIT'
      WHERE site.tenant_id = $1 AND site.id = $2 AND site.status IN ('draft', 'active')
       AND entitlement.status IN ('trial', 'active') AND entitlement.effective_from <= clock_timestamp()
       AND (entitlement.effective_until IS NULL OR entitlement.effective_until > clock_timestamp())
       AND entitlement.custom_domain_limit > 0
      FOR SHARE OF site, client, entitlement, owner, staff_role, staff_permission
    `, [input.tenantId, input.siteId, input.actorId])
    if (result.rows.length !== 1)
      throw domainFailure('DOMAIN_ACCESS_DENIED', 403)
    return requiredRow(result.rows)
  }
  async function locked<T>(input: DomainActor, hostname: string, run: (db: DomainDatabase, scope: Scope) => Promise<T>) {
    if (!Actor.safeParse(input).success) throw domainFailure('DOMAIN_ACCESS_DENIED', 403)
    return transact(async (db) => {
      // Stable site lookup only determines the lock key. Authority is checked
      // after acquiring both locks, so revocation while waiting is observed.
      const site = await db.query<{
        client_id: string
      }>('SELECT client_id::text FROM page_studio_sites WHERE tenant_id=$1 AND id=$2', [input.tenantId, input.siteId])
      if (site.rows.length !== 1)
        throw domainFailure('DOMAIN_ACCESS_DENIED', 403)
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`page-studio-domain-client:${input.tenantId}:${requiredRow(site.rows).client_id}`])
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`page-studio-domain-host:${hostname}`])
      const scope = await authority(db, input)
      return run(db, scope)
    })
  }
  async function read(db: DomainDatabase, input: DomainActor, hostname: string): Promise<{
    current: DomainRow
    operation: Operation | null
  }> {
    const rows = await db.query<DomainRow>(`SELECT * FROM page_studio_domains WHERE normalized_hostname=$1 AND lifecycle_state <> 'detached' FOR UPDATE`, [hostname])
    const current = rows.rows[0]
    if (!current || current.site_id !== input.siteId || current.tenant_id !== input.tenantId)
      throw domainFailure('DOMAIN_CHANGED', 409)
    const operations = await db.query<Operation>(`SELECT * FROM page_studio_domain_operations WHERE domain_id=$1 AND tenant_id=$2 AND client_id=$3 AND site_id=$4 FOR UPDATE`, [current.id, input.tenantId, current.client_id, input.siteId])
    return { current, operation: operations.rows[0] ?? null }
  }
  async function current(input: DomainActor, hostname: string, domainId: string) {
    return locked(input, hostname, async (db, scope) => {
      const row = await read(db, input, hostname)
      if (row.current.id !== domainId || row.current.client_id !== scope.clientId)
        throw domainFailure('DOMAIN_CHANGED', 409)
      const count = await db.query<{
        count: number
      }>(`SELECT COUNT(*)::integer AS count FROM page_studio_domains WHERE tenant_id=$1 AND client_id=$2 AND lifecycle_state <> 'detached'`, [input.tenantId, scope.clientId])
      if (requiredRow(count.rows).count > scope.customDomainLimit)
        throw domainFailure('DOMAIN_LIMIT_REACHED', 409)
      return { scope, ...row }
    })
  }
  async function reserve(input: DomainActor, hostname: string) {
    return locked(input, hostname, async (db, scope) => {
      const matches = await db.query<DomainRow>(`SELECT * FROM page_studio_domains WHERE normalized_hostname=$1 AND lifecycle_state <> 'detached' FOR UPDATE`, [hostname])
      if (matches.rows[0] && (matches.rows[0].site_id !== input.siteId || matches.rows[0].tenant_id !== input.tenantId || matches.rows[0].client_id !== scope.clientId))
        throw domainFailure('DOMAIN_ALREADY_ATTACHED', 409)
      const count = await db.query<{
        count: number
      }>(`SELECT COUNT(*)::integer AS count FROM page_studio_domains WHERE tenant_id=$1 AND client_id=$2 AND lifecycle_state <> 'detached'`, [input.tenantId, scope.clientId])
      if (requiredRow(count.rows).count + (matches.rows.length ? 0 : 1) > scope.customDomainLimit)
        throw domainFailure('DOMAIN_LIMIT_REACHED', 409)
      let row = matches.rows[0]
      if (!row) {
        const added = await db.query<DomainRow>(`INSERT INTO page_studio_domains (tenant_id,client_id,site_id,normalized_hostname,created_by,ownership_validation)
          VALUES ($1,$2,$3,$4,$5,$6::jsonb) RETURNING *`, [input.tenantId, scope.clientId, input.siteId, hostname, input.kind === 'agency' ? input.actorId : null,
          JSON.stringify({ cnameTarget: config.cnameTarget || null, providerConfigured: false, dnsVerified: false })])
        row = requiredRow(added.rows)
        await db.query(`INSERT INTO page_studio_audit_events (tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,metadata)
          VALUES ($1,$2,$3,$4,$7,'domain.attached','domain',$5,$6::jsonb)`, [input.tenantId, scope.clientId, input.siteId, input.actorId, row.id, JSON.stringify({ hostname, providerConfigured: false }), input.kind === 'agency' ? 'agency' : 'client'])
      }
      if (!row.cloudflare_hostname_id && row.ownership_validation?.providerConfigured === false) {
        await db.query(`INSERT INTO page_studio_domain_operations (tenant_id,client_id,site_id,domain_id) VALUES ($1,$2,$3,$4) ON CONFLICT(domain_id) DO NOTHING`, [input.tenantId, scope.clientId, input.siteId, row.id])
      }
      return { scope, ...await read(db, input, hostname) }
    })
  }
  function identity(row: {
    current: DomainRow
    operation: Operation | null
  }, value: unknown, providerId?: string) {
    if (row.operation?.zone_id && row.operation.zone_id !== config.zoneId)
      throw domainFailure('DOMAIN_PROVIDER_MISMATCH', 502)
    return verifyDomainHostname(value, row.current.normalized_hostname, row.operation?.owner_token, providerId ?? row.current.cloudflare_hostname_id ?? undefined)
  }
  async function receipt(input: DomainActor, before: {
    current: DomainRow
    operation: Operation | null
  }, value: DomainHostname) {
    return locked(input, before.current.normalized_hostname, async (db, scope) => {
      const row = await read(db, input, before.current.normalized_hostname)
      if (row.current.id !== before.current.id || row.operation?.id !== before.operation?.id || row.operation?.attempt_id !== before.operation?.attempt_id)
        throw domainFailure('DOMAIN_CHANGED', 409)
      const result = identity(row, value)
      let operation = row.operation
      if (operation) {
        if (operation.state === 'reserved')
          throw domainFailure('DOMAIN_CHANGED', 409)
        if (operation.state === 'creating') {
          operation = requiredRow((await db.query<Operation>(`UPDATE page_studio_domain_operations SET state='attached',updated_at=NOW() WHERE id=$1 RETURNING *`, [operation.id])).rows)
        }
      }
      await db.query(`UPDATE page_studio_domains SET cloudflare_hostname_id=$2,updated_at=NOW() WHERE id=$1`, [row.current.id, result.id])
      return { scope, current: { ...row.current, cloudflare_hostname_id: result.id }, operation, provider: result }
    })
  }
  async function prepare(input: DomainActor & {
    hostname?: string
    domainId?: string
  }): Promise<DomainAttachment> {
    if (!Actor.safeParse(input).success) throw domainFailure('DOMAIN_ACCESS_DENIED', 403)
    let hostname = input.hostname ? Hostname.parse(input.hostname) : undefined
    if (!hostname) {
      if (!z.string().uuid().safeParse(input.domainId).success)
        throw domainFailure('DOMAIN_NOT_FOUND', 404)
      hostname = await transact(async (db) => {
        await authority(db, input)
        const result = await db.query<{
          normalized_hostname: string
        }>(`SELECT normalized_hostname FROM page_studio_domains WHERE tenant_id=$1 AND site_id=$2 AND id=$3 AND lifecycle_state <> 'detached'`, [input.tenantId, input.siteId, input.domainId])
        if (!result.rows[0])
          throw domainFailure('DOMAIN_NOT_FOUND', 404)
        return result.rows[0].normalized_hostname
      })
    }
    let row = await reserve(input, hostname)
    if (input.domainId && row.current.id !== input.domainId)
      throw domainFailure('DOMAIN_CHANGED', 409)
    if (!provider)
      return { ...row, provider: null }
    if (row.operation?.zone_id && row.operation.zone_id !== config.zoneId)
      throw domainFailure('DOMAIN_PROVIDER_MISMATCH', 502)
    if (row.current.cloudflare_hostname_id) {
      const value = await provider.get(row.current.cloudflare_hostname_id)
      return receipt(input, row, identity(row, value))
    }
    if (!row.operation)
      throw domainFailure()
    if (row.operation.state === 'reserved')
      requireDomainCnameTarget(config.cnameTarget)
    // A previous attempt (including a lost response) is lookup-only forever.
    const found = await provider.find(hostname)
    if (row.operation.state !== 'reserved') {
      if (!found)
        throw domainFailure()
      const exact = identity(row, found)
      await current(input, hostname, row.current.id)
      return receipt(input, row, identity(row, await provider.get(exact.id), exact.id))
    }
    if (found)
      throw domainFailure('DOMAIN_PROVIDER_MISMATCH', 502)
    const claimed = await locked(input, hostname, async (db) => {
      const latest = await read(db, input, hostname)
      if (latest.current.id !== row.current.id || latest.operation?.id !== row.operation?.id || latest.operation?.state !== 'reserved')
        throw domainFailure('DOMAIN_CHANGED', 409)
      const updated = await db.query<Operation>(`UPDATE page_studio_domain_operations SET state='creating',zone_id=$2,attempt_id=gen_random_uuid(),create_started_at=NOW(),updated_at=NOW()
        WHERE id=$1 AND state='reserved' RETURNING *`, [latest.operation.id, config.zoneId])
      if (updated.rows.length !== 1)
        throw domainFailure('DOMAIN_CHANGED', 409)
      return { ...latest, operation: requiredRow(updated.rows) }
    })
    row = { ...row, ...claimed }
    // The create receipt was committed before admission to the provider call.
    const admitted = await current(input, hostname, row.current.id)
    if (admitted.operation?.attempt_id !== row.operation?.attempt_id || admitted.operation?.state !== 'creating')
      throw domainFailure('DOMAIN_CHANGED', 409)
    const created = identity(row, await provider.create(hostname, row.operation!.owner_token))
    await current(input, hostname, row.current.id)
    return receipt(input, row, identity(row, await provider.get(created.id), created.id))
  }
  async function saveVerification(input: DomainActor, attachment: DomainAttachment, state: {
    ownershipValidation: Record<string, unknown>
    certificateValidation: unknown[]
    hostnameStatus: string
    tlsStatus: string
    dnsStatus: string
    lifecycleState: string
  }) {
    return locked(input, attachment.current.normalized_hostname, async (db, scope) => {
      const row = await read(db, input, attachment.current.normalized_hostname)
      if (row.current.id !== attachment.current.id || row.current.cloudflare_hostname_id !== attachment.current.cloudflare_hostname_id
        || row.operation?.id !== attachment.operation?.id || row.operation?.attempt_id !== attachment.operation?.attempt_id)
        throw domainFailure('DOMAIN_CHANGED', 409)
      if (attachment.provider)
        identity(row, attachment.provider)
      const active = state.lifecycleState === 'active'
      const verified = active || state.lifecycleState === 'verified'
      await db.query(`UPDATE page_studio_domains SET ownership_validation=$2::jsonb,certificate_validation=$3::jsonb,
        hostname_status=$4,tls_status=$5,dns_status=$6,lifecycle_state=$7,
        verified_at=CASE WHEN $8 THEN COALESCE(verified_at,NOW()) ELSE verified_at END,
        activated_at=CASE WHEN $9 THEN COALESCE(activated_at,NOW()) ELSE activated_at END,
        failure_summary=NULL,updated_at=NOW() WHERE id=$1`, [row.current.id,
        JSON.stringify({ ...row.current.ownership_validation, ...state.ownershipValidation }), JSON.stringify(state.certificateValidation),
        state.hostnameStatus, state.tlsStatus, state.dnsStatus, state.lifecycleState, verified, active])
      await db.query(`INSERT INTO page_studio_audit_events (tenant_id,client_id,site_id,actor_id,actor_role,action,resource_type,resource_id,metadata)
        VALUES ($1,$2,$3,$4,$7,'domain.refreshed','domain',$5,$6::jsonb)`, [input.tenantId, scope.clientId, input.siteId, input.actorId, row.current.id,
        JSON.stringify({ dnsStatus: state.dnsStatus, hostnameStatus: state.hostnameStatus, lifecycleState: state.lifecycleState, tlsStatus: state.tlsStatus }), input.kind === 'agency' ? 'agency' : 'client'])
    })
  }
  return { prepare, saveVerification }
}
