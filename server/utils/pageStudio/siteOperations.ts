import type { H3Event } from 'h3'

import { execute, queryOne, queryRows, transaction } from '~~/server/utils/db'

const MAX_SITE_OPERATION_ROWS = 200

interface SiteScope {
  clientId: string
  customDomainLimit: number
  entitlementId: string
  tenantId: string
}

interface CloudflareCustomHostname {
  id: string
  hostname: string
  status?: string
  ownership_verification?: Record<string, unknown>
  ssl?: {
    status?: string
    validation_records?: Array<Record<string, unknown>>
  }
}

interface CloudflareEnvelope<T> {
  errors?: Array<{ message?: string }>
  result?: T
  success?: boolean
}

export class PageStudioSiteOperationError extends Error {
  constructor(
    readonly code: string,
    readonly statusCode: number,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'PageStudioSiteOperationError'
  }
}

export async function requirePageStudioSiteScope(tenantId: string, siteId: string): Promise<SiteScope> {
  const scope = await queryOne<{
    client_id: string
    custom_domain_limit: number
    entitlement_id: string
    tenant_id: string
  }>(`
    SELECT site.tenant_id, site.client_id::text AS client_id,
           site.entitlement_id::text AS entitlement_id,
           entitlement.custom_domain_limit
      FROM page_studio_sites site
      JOIN page_studio_entitlements entitlement
        ON entitlement.tenant_id = site.tenant_id
       AND entitlement.client_id = site.client_id
       AND entitlement.id = site.entitlement_id
     WHERE site.tenant_id = $1 AND site.id = $2
     LIMIT 1
  `, [tenantId, siteId])
  if (!scope) {
    throw new PageStudioSiteOperationError('SITE_NOT_FOUND', 404, 'Page Studio site not found')
  }
  return {
    clientId: scope.client_id,
    customDomainLimit: scope.custom_domain_limit,
    entitlementId: scope.entitlement_id,
    tenantId: scope.tenant_id
  }
}

export function isSupportedPageStudioImage(bytes: Uint8Array, mediaType: string): boolean {
  if (mediaType === 'image/jpeg') return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  if (mediaType === 'image/png') return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every((value, index) => bytes[index] === value)
  if (mediaType === 'image/gif') return bytes.length >= 6 && ['GIF87a', 'GIF89a'].includes(String.fromCharCode(...bytes.slice(0, 6)))
  if (mediaType === 'image/webp') return bytes.length >= 12
    && String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF'
    && String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP'
  return false
}

export async function listPageStudioAssets(tenantId: string, siteId: string) {
  await requirePageStudioSiteScope(tenantId, siteId)
  return queryRows(`
    SELECT id::text, r2_prefix AS "objectKey", media_type AS "mediaType",
           width, height, alt_text AS "altText", scan_status AS "scanStatus",
           publication_status AS "publicationStatus", renditions,
           created_at AS "createdAt", updated_at AS "updatedAt"
      FROM page_studio_assets
     WHERE tenant_id = $1 AND site_id = $2
     ORDER BY created_at DESC
     LIMIT $3
  `, [tenantId, siteId, MAX_SITE_OPERATION_ROWS])
}

export async function registerPageStudioAsset(input: {
  actorId: string
  altText?: string
  digest: string
  fileName: string
  mediaType: string
  objectKey: string
  siteId: string
  size: number
  tenantId: string
}) {
  const scope = await requirePageStudioSiteScope(input.tenantId, input.siteId)
  return transaction(async (db) => {
    const result = await db.query<{
      id: string
      r2_prefix: string
      media_type: string
      alt_text: string | null
      scan_status: string
      publication_status: string
      renditions: Array<Record<string, unknown>>
      created_at: string
    }>(`
      INSERT INTO page_studio_assets (
        tenant_id, client_id, site_id, r2_prefix, media_type, alt_text,
        scan_status, publication_status, renditions, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6, 'clean', 'ready', $7::jsonb, $8)
      RETURNING id::text, r2_prefix, media_type, alt_text, scan_status,
                publication_status, renditions, created_at
    `, [
      input.tenantId,
      scope.clientId,
      input.siteId,
      input.objectKey,
      input.mediaType,
      input.altText || null,
      JSON.stringify([{
        digest: input.digest,
        fileName: input.fileName,
        kind: 'original',
        objectKey: input.objectKey,
        size: input.size
      }]),
      input.actorId
    ])
    const asset = result.rows[0]
    if (!asset) throw new PageStudioSiteOperationError('ASSET_CREATE_FAILED', 500, 'Page Studio asset could not be registered')
    await db.query(`
      INSERT INTO page_studio_audit_events (
        tenant_id, client_id, site_id, actor_id, actor_role, action,
        resource_type, resource_id, metadata
      ) VALUES ($1, $2, $3, $4, 'agency', 'asset.created', 'asset', $5, $6::jsonb)
    `, [input.tenantId, scope.clientId, input.siteId, input.actorId, asset.id, JSON.stringify({
      digest: input.digest,
      fileName: input.fileName,
      mediaType: input.mediaType,
      size: input.size
    })])
    return {
      id: asset.id,
      objectKey: asset.r2_prefix,
      mediaType: asset.media_type,
      altText: asset.alt_text,
      scanStatus: asset.scan_status,
      publicationStatus: asset.publication_status,
      renditions: asset.renditions,
      createdAt: asset.created_at
    }
  })
}

export async function updatePageStudioAsset(input: {
  actorId: string
  altText?: string | null
  assetId: string
  publicationStatus?: 'archived' | 'ready'
  siteId: string
  tenantId: string
}) {
  const scope = await requirePageStudioSiteScope(input.tenantId, input.siteId)
  return transaction(async (db) => {
    const result = await db.query<{
      id: string
      alt_text: string | null
      publication_status: string
      updated_at: string
    }>(`
      UPDATE page_studio_assets
         SET alt_text = CASE WHEN $4::boolean THEN $5 ELSE alt_text END,
             publication_status = COALESCE($6, publication_status),
             updated_at = NOW()
       WHERE tenant_id = $1 AND site_id = $2 AND id = $3
       RETURNING id::text, alt_text, publication_status, updated_at
    `, [
      input.tenantId,
      input.siteId,
      input.assetId,
      Object.prototype.hasOwnProperty.call(input, 'altText'),
      input.altText ?? null,
      input.publicationStatus ?? null
    ])
    const asset = result.rows[0]
    if (!asset) throw new PageStudioSiteOperationError('ASSET_NOT_FOUND', 404, 'Page Studio asset not found')
    await db.query(`
      INSERT INTO page_studio_audit_events (
        tenant_id, client_id, site_id, actor_id, actor_role, action,
        resource_type, resource_id, metadata
      ) VALUES ($1, $2, $3, $4, 'agency', 'asset.updated', 'asset', $5, $6::jsonb)
    `, [input.tenantId, scope.clientId, input.siteId, input.actorId, asset.id, JSON.stringify({
      altTextChanged: Object.prototype.hasOwnProperty.call(input, 'altText'),
      publicationStatus: input.publicationStatus
    })])
    return {
      id: asset.id,
      altText: asset.alt_text,
      publicationStatus: asset.publication_status,
      updatedAt: asset.updated_at
    }
  })
}

export async function getPageStudioAssetObject(tenantId: string, siteId: string, assetId: string) {
  await requirePageStudioSiteScope(tenantId, siteId)
  const asset = await queryOne<{ media_type: string, object_key: string }>(`
    SELECT media_type, r2_prefix AS object_key
      FROM page_studio_assets
     WHERE tenant_id = $1 AND site_id = $2 AND id = $3
       AND publication_status <> 'archived'
     LIMIT 1
  `, [tenantId, siteId, assetId])
  if (!asset) throw new PageStudioSiteOperationError('ASSET_NOT_FOUND', 404, 'Page Studio asset not found')
  return { mediaType: asset.media_type, objectKey: asset.object_key }
}

export async function listPageStudioSubmissions(tenantId: string, siteId: string) {
  await requirePageStudioSiteScope(tenantId, siteId)
  return queryRows(`
    SELECT DISTINCT ON (lead.id)
           lead.id::text, lead.form_id AS "formId", lead.form_name AS "formName",
           lead.page_id AS "pageId", lead.page_name AS "pageRoute",
           lead.field_data AS fields, lead.attribution, lead.submitted_at AS "submittedAt",
           lead.is_test AS "isTest", audit.metadata->>'releaseId' AS "releaseId"
      FROM page_studio_audit_events audit
      JOIN leads lead ON lead.id::text = audit.resource_id
     WHERE audit.tenant_id = $1 AND audit.site_id = $2
       AND audit.resource_type = 'lead' AND audit.action IN ('lead.created', 'lead.duplicate')
       AND lead.deleted_at IS NULL
     ORDER BY lead.id, audit.occurred_at DESC
     LIMIT $3
  `, [tenantId, siteId, MAX_SITE_OPERATION_ROWS])
}

export async function getPageStudioAnalytics(tenantId: string, siteId: string) {
  await requirePageStudioSiteScope(tenantId, siteId)
  const [summary, routes, recent] = await Promise.all([
    queryOne<{
      conversions: number
      last_event_at: string | null
      page_views: number
      total: number
    }>(`
      SELECT COUNT(*)::integer AS total,
             COUNT(*) FILTER (WHERE kind = 'page_view')::integer AS page_views,
             COUNT(*) FILTER (WHERE kind = 'conversion')::integer AS conversions,
             MAX(occurred_at)::text AS last_event_at
        FROM page_studio_analytics_events
       WHERE tenant_id = $1 AND site_id = $2
    `, [tenantId, siteId]),
    queryRows(`
      SELECT page_route AS route,
             COUNT(*) FILTER (WHERE kind = 'page_view')::integer AS "pageViews",
             COUNT(*) FILTER (WHERE kind = 'conversion')::integer AS conversions
        FROM page_studio_analytics_events
       WHERE tenant_id = $1 AND site_id = $2
       GROUP BY page_route
       ORDER BY COUNT(*) DESC, page_route
       LIMIT 50
    `, [tenantId, siteId]),
    queryRows(`
      SELECT id::text, event_id AS "eventId", kind, page_id AS "pageId",
             page_route AS "pageRoute", release_id::text AS "releaseId",
             delivery_status AS "deliveryStatus", occurred_at AS "occurredAt"
        FROM page_studio_analytics_events
       WHERE tenant_id = $1 AND site_id = $2
       ORDER BY occurred_at DESC
       LIMIT 100
    `, [tenantId, siteId])
  ])
  return {
    summary: {
      conversions: summary?.conversions ?? 0,
      lastEventAt: summary?.last_event_at ?? null,
      pageViews: summary?.page_views ?? 0,
      total: summary?.total ?? 0
    },
    routes,
    recent
  }
}

function cloudflareConfig(event: H3Event) {
  const env = (event.context as { cloudflare?: { env?: Record<string, unknown> } }).cloudflare?.env ?? {}
  const value = (name: string) => String(env[name] ?? process.env[name] ?? '').trim()
  return {
    apiToken: value('PAGE_STUDIO_CLOUDFLARE_API_TOKEN'),
    cnameTarget: value('PAGE_STUDIO_CUSTOM_HOSTNAME_TARGET').toLowerCase().replace(/\.$/, ''),
    zoneId: value('PAGE_STUDIO_CLOUDFLARE_ZONE_ID')
  }
}

async function cloudflareRequest<T>(event: H3Event, path: string, init?: RequestInit): Promise<T | null> {
  const config = cloudflareConfig(event)
  if (!config.apiToken || !config.zoneId) return null
  const response = await fetch(`https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(config.zoneId)}${path}`, {
    ...init,
    headers: {
      'authorization': `Bearer ${config.apiToken}`,
      'content-type': 'application/json',
      ...(init?.headers ?? {})
    }
  })
  const payload = await response.json() as CloudflareEnvelope<T>
  if (!response.ok || !payload.success || !payload.result) {
    const message = payload.errors?.map(error => error.message).filter(Boolean).join('; ')
    throw new PageStudioSiteOperationError('DOMAIN_PROVIDER_FAILED', 502, message || 'Cloudflare hostname request failed')
  }
  return payload.result
}

function domainState(hostname: CloudflareCustomHostname | null) {
  const hostnameStatus = hostname?.status ?? 'pending'
  const tlsStatus = hostname?.ssl?.status ?? 'pending'
  return {
    certificateValidation: hostname?.ssl?.validation_records ?? [],
    cloudflareHostnameId: hostname?.id ?? null,
    dnsStatus: hostnameStatus,
    hostnameStatus,
    lifecycleState: hostnameStatus === 'active' && tlsStatus === 'active' ? 'active' : hostname ? 'validating' : 'pending',
    ownershipValidation: hostname?.ownership_verification ?? {},
    tlsStatus
  }
}

export async function listPageStudioDomains(tenantId: string, siteId: string) {
  await requirePageStudioSiteScope(tenantId, siteId)
  return queryRows(`
    SELECT id::text, normalized_hostname AS hostname,
           cloudflare_hostname_id AS "cloudflareHostnameId",
           ownership_validation AS "ownershipValidation",
           certificate_validation AS "certificateValidation",
           hostname_status AS "hostnameStatus", tls_status AS "tlsStatus",
           dns_status AS "dnsStatus", lifecycle_state AS status,
           verified_at AS "verifiedAt", activated_at AS "activatedAt",
           failure_summary AS "failureSummary", updated_at AS "updatedAt"
      FROM page_studio_domains
     WHERE tenant_id = $1 AND site_id = $2 AND lifecycle_state <> 'detached'
     ORDER BY updated_at DESC
  `, [tenantId, siteId])
}

export async function attachPageStudioDomain(input: {
  actorId: string
  event: H3Event
  hostname: string
  siteId: string
  tenantId: string
}) {
  const scope = await requirePageStudioSiteScope(input.tenantId, input.siteId)
  const count = await queryOne<{ count: number }>(`
    SELECT COUNT(*)::integer AS count
      FROM page_studio_domains
     WHERE tenant_id = $1 AND client_id = $2 AND lifecycle_state <> 'detached'
  `, [input.tenantId, scope.clientId])
  if ((count?.count ?? 0) >= scope.customDomainLimit) {
    throw new PageStudioSiteOperationError('DOMAIN_LIMIT_REACHED', 409, 'The Page Studio custom-domain limit has been reached')
  }
  const duplicate = await queryOne<{ id: string }>(`
    SELECT id::text FROM page_studio_domains
     WHERE normalized_hostname = $1 AND lifecycle_state <> 'detached' LIMIT 1
  `, [input.hostname])
  if (duplicate) throw new PageStudioSiteOperationError('DOMAIN_ALREADY_ATTACHED', 409, 'This hostname is already attached')

  const provisioned = await cloudflareRequest<CloudflareCustomHostname>(input.event, '/custom_hostnames', {
    method: 'POST',
    body: JSON.stringify({ hostname: input.hostname, ssl: { method: 'txt', type: 'dv' } })
  })
  const state = domainState(provisioned)
  const config = cloudflareConfig(input.event)
  const ownershipValidation = provisioned
    ? state.ownershipValidation
    : { cnameTarget: config.cnameTarget || null, providerConfigured: false }
  return transaction(async (db) => {
    const result = await db.query<{ id: string }>(`
      INSERT INTO page_studio_domains (
        tenant_id, client_id, site_id, normalized_hostname,
        cloudflare_hostname_id, ownership_validation, certificate_validation,
        hostname_status, tls_status, dns_status, lifecycle_state, created_by
      ) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb, $8, $9, $10, $11, $12)
      RETURNING id::text
    `, [
      input.tenantId,
      scope.clientId,
      input.siteId,
      input.hostname,
      state.cloudflareHostnameId,
      JSON.stringify(ownershipValidation),
      JSON.stringify(state.certificateValidation),
      state.hostnameStatus,
      state.tlsStatus,
      state.dnsStatus,
      state.lifecycleState,
      input.actorId
    ])
    const domainId = result.rows[0]?.id
    if (!domainId) throw new PageStudioSiteOperationError('DOMAIN_CREATE_FAILED', 500, 'Page Studio domain could not be attached')
    await db.query(`
      INSERT INTO page_studio_audit_events (
        tenant_id, client_id, site_id, actor_id, actor_role, action,
        resource_type, resource_id, metadata
      ) VALUES ($1, $2, $3, $4, 'agency', 'domain.attached', 'domain', $5, $6::jsonb)
    `, [input.tenantId, scope.clientId, input.siteId, input.actorId, domainId, JSON.stringify({
      hostname: input.hostname,
      providerConfigured: Boolean(provisioned)
    })])
    return { id: domainId }
  })
}

export async function refreshPageStudioDomain(input: {
  actorId: string
  domainId: string
  event: H3Event
  siteId: string
  tenantId: string
}) {
  const scope = await requirePageStudioSiteScope(input.tenantId, input.siteId)
  const current = await queryOne<{ cloudflare_hostname_id: string | null, normalized_hostname: string }>(`
    SELECT cloudflare_hostname_id, normalized_hostname
      FROM page_studio_domains
     WHERE tenant_id = $1 AND site_id = $2 AND id = $3 AND lifecycle_state <> 'detached'
     LIMIT 1
  `, [input.tenantId, input.siteId, input.domainId])
  if (!current) throw new PageStudioSiteOperationError('DOMAIN_NOT_FOUND', 404, 'Page Studio domain not found')

  let provider: CloudflareCustomHostname | null = null
  if (current.cloudflare_hostname_id) {
    provider = await cloudflareRequest<CloudflareCustomHostname>(
      input.event,
      `/custom_hostnames/${encodeURIComponent(current.cloudflare_hostname_id)}`
    )
  }
  const state = domainState(provider)
  const config = cloudflareConfig(input.event)
  if (!provider && config.cnameTarget) {
    const response = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(current.normalized_hostname)}&type=CNAME`, {
      headers: { accept: 'application/dns-json' }
    })
    const dns = response.ok ? await response.json() as { Answer?: Array<{ data?: string }> } : {}
    const verified = dns.Answer?.some(answer => answer.data?.toLowerCase().replace(/\.$/, '') === config.cnameTarget) ?? false
    state.dnsStatus = verified ? 'active' : 'pending'
    state.lifecycleState = verified ? 'verified' : 'validating'
    state.ownershipValidation = { cnameTarget: config.cnameTarget, dnsVerified: verified }
  }
  const activated = state.lifecycleState === 'active'
  const verified = activated || state.lifecycleState === 'verified'
  await execute(`
    UPDATE page_studio_domains
       SET ownership_validation = $4::jsonb,
           certificate_validation = $5::jsonb,
           hostname_status = $6, tls_status = $7, dns_status = $8,
           lifecycle_state = $9,
           verified_at = CASE WHEN $10 THEN COALESCE(verified_at, NOW()) ELSE verified_at END,
           activated_at = CASE WHEN $11 THEN COALESCE(activated_at, NOW()) ELSE activated_at END,
           failure_summary = NULL, updated_at = NOW()
     WHERE tenant_id = $1 AND site_id = $2 AND id = $3
  `, [
    input.tenantId,
    input.siteId,
    input.domainId,
    JSON.stringify(state.ownershipValidation),
    JSON.stringify(state.certificateValidation),
    state.hostnameStatus,
    state.tlsStatus,
    state.dnsStatus,
    state.lifecycleState,
    verified,
    activated
  ])
  await execute(`
    INSERT INTO page_studio_audit_events (
      tenant_id, client_id, site_id, actor_id, actor_role, action,
      resource_type, resource_id, metadata
    ) VALUES ($1, $2, $3, $4, 'agency', 'domain.refreshed', 'domain', $5, $6::jsonb)
  `, [input.tenantId, scope.clientId, input.siteId, input.actorId, input.domainId, JSON.stringify({
    dnsStatus: state.dnsStatus,
    hostnameStatus: state.hostnameStatus,
    lifecycleState: state.lifecycleState,
    tlsStatus: state.tlsStatus
  })])
  return { id: input.domainId, ...state }
}

export async function listPageStudioSessions(tenantId: string, siteId: string) {
  await requirePageStudioSiteScope(tenantId, siteId)
  return queryRows(`
    SELECT nonce AS id, user_id AS "userId", role, capabilities,
           issued_at AS "issuedAt", expires_at AS "expiresAt",
           revoked_at AS "revokedAt",
           CASE
             WHEN revoked_at IS NOT NULL THEN 'revoked'
             WHEN expires_at <= NOW() THEN 'expired'
             ELSE 'active'
           END AS status
      FROM page_studio_sessions
     WHERE tenant_id = $1 AND site_id = $2
     ORDER BY issued_at DESC
     LIMIT 50
  `, [tenantId, siteId])
}

export async function revokePageStudioSession(input: {
  actorId: string
  sessionId: string
  siteId: string
  tenantId: string
}) {
  const scope = await requirePageStudioSiteScope(input.tenantId, input.siteId)
  return transaction(async (db) => {
    const result = await db.query<{ nonce: string }>(`
      UPDATE page_studio_sessions
         SET revoked_at = COALESCE(revoked_at, NOW())
       WHERE tenant_id = $1 AND site_id = $2 AND nonce = $3
       RETURNING nonce
    `, [input.tenantId, input.siteId, input.sessionId])
    if (!result.rows[0]) throw new PageStudioSiteOperationError('SESSION_NOT_FOUND', 404, 'Page Studio session not found')
    await db.query(`
      INSERT INTO page_studio_audit_events (
        tenant_id, client_id, site_id, actor_id, actor_role, action,
        resource_type, resource_id, metadata
      ) VALUES ($1, $2, $3, $4, 'agency', 'session.revoked', 'session', $5, '{}'::jsonb)
    `, [input.tenantId, scope.clientId, input.siteId, input.actorId, input.sessionId])
    return { revoked: true }
  })
}
