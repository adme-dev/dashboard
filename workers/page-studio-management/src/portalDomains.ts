import type { DomainActor, DomainDatabase, DomainTransaction } from './domainAttachment'
import { Hostname } from './domainAttachmentProvider'
import { requirePortalDomainAuthority, type PortalDomainActor } from './portalDomainAuthority'

async function scoped<T>(actor: PortalDomainActor, writing: boolean, run: (db: DomainDatabase, actor: Extract<DomainActor, { kind: 'portal' }>, canManage: boolean) => Promise<T>, transaction: DomainTransaction) {
  return transaction(async (db) => {
    await db.query('SET LOCAL statement_timeout = \'15s\'')
    await db.query('SET LOCAL lock_timeout = \'5s\'')
    const scope = await requirePortalDomainAuthority(db, actor, writing)
    return run(db, { ...actor, kind: 'portal', tenantId: scope.tenantId }, scope.canManage)
  })
}
const text = (value: unknown, max = 4096) => typeof value === 'string' && value.length <= max ? value : undefined
/** Customer-visible DNS instructions only; never provider IDs or ownership receipts. */
export function projectPortalDomain(row: Record<string, unknown>) {
  const ownership = row.ownership_validation && typeof row.ownership_validation === 'object' ? row.ownership_validation as Record<string, unknown> : {}
  const certificate = Array.isArray(row.certificate_validation) ? row.certificate_validation : []
  return {
    id: row.id, hostname: row.normalized_hostname, status: row.lifecycle_state,
    hostnameStatus: row.hostname_status, dnsStatus: row.dns_status, tlsStatus: row.tls_status,
    ownershipValidation: {
      type: ownership.type === 'txt' ? 'txt' : undefined,
      name: text(ownership.name, 253), value: text(ownership.value),
      cnameTarget: Hostname.safeParse(ownership.cnameTarget).success ? ownership.cnameTarget : undefined
    },
    certificateValidation: certificate.slice(0, 20).filter(value => value && typeof value === 'object').map(value => ({ txt_name: text(value.txt_name, 253), txt_value: text(value.txt_value) }))
  }
}
export async function readPortalDomainConfiguration(actor: PortalDomainActor, transaction: DomainTransaction) {
  return scoped(actor, false, async (db, scopedActor, canManage) => {
    const result = await db.query(`SELECT id,normalized_hostname,lifecycle_state,hostname_status,dns_status,tls_status,ownership_validation,certificate_validation
      FROM page_studio_domains WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND lifecycle_state <> 'detached'
      ORDER BY created_at DESC LIMIT 200`, [scopedActor.tenantId, scopedActor.clientId, scopedActor.siteId])
    return { siteId: scopedActor.siteId, canManage, domains: result.rows.map(projectPortalDomain) }
  }, transaction)
}
