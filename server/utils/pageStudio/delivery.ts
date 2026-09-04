import type { H3Event } from 'h3'
import { z } from 'zod'

import { queryOne } from '~~/server/utils/db'
import {
  PageStudioSessionError,
  verifyPageStudioSessionToken
} from '~~/server/utils/pageStudio/sessions'

export const PageStudioHostnameSchema = z.string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/)

export const PageStudioPreviewAuthorizationSchema = z.object({
  hostname: PageStudioHostnameSchema,
  token: z.string().min(1).max(8192)
}).strict()

interface CloudflareContext {
  cloudflare?: { env?: Record<string, unknown> }
}

interface PreviewVerificationEnvironment {
  issuer: string
  publicKey: string
}

interface ReleaseRowBase {
  artifact_prefix: string
  build_id: string
  manifest_digest: string
  manifest_key: string
  release_id: string
  version_digest: string
}

interface PreviewReleaseRow extends ReleaseRowBase {
  environment: 'preview'
}

interface PublicReleaseRow extends ReleaseRowBase {
  client_id: string
  environment: 'staging' | 'production'
  site_id: string
  tenant_id: string
}

export type PageStudioDeliveryQueryOne = <T = PreviewReleaseRow | PublicReleaseRow>(
  sql: string,
  params?: unknown[]
) => Promise<T | null>

export class PageStudioDeliveryError extends Error {
  constructor(
    readonly code:
      | 'PREVIEW_FORBIDDEN'
      | 'PREVIEW_TOKEN_INVALID'
      | 'PREVIEW_VERIFIER_UNAVAILABLE'
      | 'PUBLIC_HOST_INVALID',
    readonly statusCode: number,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'PageStudioDeliveryError'
  }
}

function validIssuer(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && url.origin === value
      && url.username === ''
      && url.password === ''
      && url.pathname === '/'
      && url.search === ''
      && url.hash === ''
  } catch {
    return false
  }
}

export function resolvePageStudioPreviewVerificationEnvironment(
  event?: H3Event
): PreviewVerificationEnvironment {
  const env = (event?.context as CloudflareContext | undefined)?.cloudflare?.env
  const boundPublicKey = env && Object.prototype.hasOwnProperty.call(env, 'PAGE_STUDIO_SESSION_PUBLIC_KEY')
    ? env.PAGE_STUDIO_SESSION_PUBLIC_KEY
    : undefined
  const boundIssuer = env && Object.prototype.hasOwnProperty.call(env, 'PAGE_STUDIO_SESSION_ISSUER')
    ? env.PAGE_STUDIO_SESSION_ISSUER
    : undefined
  const publicKey = boundPublicKey === undefined
    ? process.env.PAGE_STUDIO_SESSION_PUBLIC_KEY
    : boundPublicKey
  const issuer = boundIssuer === undefined
    ? process.env.PAGE_STUDIO_SESSION_ISSUER
    : boundIssuer

  if (typeof publicKey !== 'string'
    || publicKey.length < 128
    || publicKey.length > 16_384
    || !publicKey.includes('BEGIN PUBLIC KEY')
    || typeof issuer !== 'string'
    || !validIssuer(issuer)) {
    throw new PageStudioDeliveryError(
      'PREVIEW_VERIFIER_UNAVAILABLE',
      503,
      'Page Studio preview verification is not configured'
    )
  }
  return { issuer, publicKey }
}

export interface AuthorizedPageStudioPreview {
  hostname: string
  release: {
    artifactPrefix: string
    buildId: string
    environment: 'preview'
    manifestDigest: string
    manifestKey: string
    releaseId: string
    scope: { clientId: string, siteId: string, tenantId: string }
    versionDigest: string
  }
}

export interface ResolvedPageStudioRelease {
  hostname: string
  release: {
    artifactPrefix: string
    buildId: string
    environment: 'staging' | 'production'
    manifestDigest: string
    manifestKey: string
    releaseId: string
    scope: { clientId: string, siteId: string, tenantId: string }
    versionDigest: string
  }
}

interface ResolvePageStudioReleaseHostDependencies {
  queryOne?: PageStudioDeliveryQueryOne
}

export async function resolvePageStudioReleaseHost(
  hostnameInput: string,
  dependencies: ResolvePageStudioReleaseHostDependencies = {}
): Promise<ResolvedPageStudioRelease | null> {
  const hostname = PageStudioHostnameSchema.safeParse(hostnameInput)
  if (!hostname.success) {
    throw new PageStudioDeliveryError(
      'PUBLIC_HOST_INVALID',
      400,
      'Page Studio public hostname is invalid'
    )
  }

  const findOne = dependencies.queryOne ?? queryOne as PageStudioDeliveryQueryOne
  const row = await findOne<PublicReleaseRow>(
    `SELECT build.artifact_prefix,
            build.id AS build_id,
            pointer.client_id,
            pointer.environment,
            build.release_manifest_digest AS manifest_digest,
            build.release_manifest_key AS manifest_key,
            release.id AS release_id,
            pointer.site_id,
            pointer.tenant_id,
            build.version_digest
     FROM page_studio_release_pointers pointer
     JOIN page_studio_sites site
       ON site.tenant_id = pointer.tenant_id
      AND site.client_id = pointer.client_id
      AND site.id = pointer.site_id
     JOIN page_studio_entitlements entitlement
       ON entitlement.tenant_id = site.tenant_id
      AND entitlement.client_id = site.client_id
      AND entitlement.id = site.entitlement_id
     JOIN page_studio_releases release
       ON release.tenant_id = pointer.tenant_id
      AND release.client_id = pointer.client_id
      AND release.site_id = pointer.site_id
      AND release.id = pointer.active_release_id
      AND release.environment = pointer.environment
      AND release.normalized_hostname = pointer.normalized_hostname
     JOIN page_studio_builds build
       ON build.tenant_id = release.tenant_id
      AND build.client_id = release.client_id
      AND build.site_id = release.site_id
      AND build.id = release.build_id
      AND build.state = 'succeeded'
     WHERE pointer.normalized_hostname = $1
       AND pointer.environment IN ('staging', 'production')
       AND (
         (pointer.environment = 'staging' AND site.status IN ('draft', 'active'))
         OR (pointer.environment = 'production' AND site.status = 'active')
       )
       AND entitlement.status IN ('trial', 'active')
       AND entitlement.effective_from <= NOW()
       AND (entitlement.effective_until IS NULL OR entitlement.effective_until > NOW())`,
    [hostname.data]
  )
  if (!row) return null

  return {
    hostname: hostname.data,
    release: {
      artifactPrefix: row.artifact_prefix,
      buildId: row.build_id,
      environment: row.environment,
      manifestDigest: row.manifest_digest,
      manifestKey: row.manifest_key,
      releaseId: row.release_id,
      scope: {
        clientId: row.client_id,
        siteId: row.site_id,
        tenantId: row.tenant_id
      },
      versionDigest: row.version_digest
    }
  }
}

interface AuthorizePageStudioPreviewDependencies {
  currentDate?: Date
  event?: H3Event
  issuer?: string
  publicKey?: string
  queryOne?: PageStudioDeliveryQueryOne
}

export async function authorizePageStudioPreview(
  input: { hostname: string, token: string },
  dependencies: AuthorizePageStudioPreviewDependencies = {}
): Promise<AuthorizedPageStudioPreview | null> {
  const parsed = PageStudioPreviewAuthorizationSchema.safeParse(input)
  if (!parsed.success) {
    throw new PageStudioDeliveryError(
      'PREVIEW_TOKEN_INVALID',
      401,
      'Page Studio preview credential is invalid'
    )
  }
  const environment = dependencies.publicKey && dependencies.issuer
    ? { issuer: dependencies.issuer, publicKey: dependencies.publicKey }
    : resolvePageStudioPreviewVerificationEnvironment(dependencies.event)
  let claims
  try {
    claims = await verifyPageStudioSessionToken(
      parsed.data.token,
      environment.publicKey,
      environment.issuer,
      dependencies.currentDate
    )
  } catch (error) {
    if (error instanceof PageStudioSessionError) {
      throw new PageStudioDeliveryError(
        'PREVIEW_TOKEN_INVALID',
        401,
        'Page Studio preview credential is invalid',
        { cause: error }
      )
    }
    throw error
  }
  if (!claims.capabilities.includes('workspace:preview')) {
    throw new PageStudioDeliveryError(
      'PREVIEW_FORBIDDEN',
      403,
      'Page Studio preview access is not permitted'
    )
  }

  const findOne = dependencies.queryOne ?? queryOne as PageStudioDeliveryQueryOne
  const row = await findOne<PreviewReleaseRow>(
    `SELECT build.artifact_prefix,
            build.id AS build_id,
            release.environment,
            build.release_manifest_digest AS manifest_digest,
            build.release_manifest_key AS manifest_key,
            release.id AS release_id,
            build.version_digest
     FROM page_studio_sessions session
     JOIN page_studio_sites site
       ON site.tenant_id = session.tenant_id
      AND site.client_id = session.client_id
      AND site.id = session.site_id
     JOIN page_studio_entitlements entitlement
       ON entitlement.tenant_id = site.tenant_id
      AND entitlement.client_id = site.client_id
      AND entitlement.id = site.entitlement_id
     JOIN page_studio_release_pointers pointer
       ON pointer.tenant_id = session.tenant_id
      AND pointer.client_id = session.client_id
      AND pointer.site_id = session.site_id
      AND pointer.environment = 'preview'
      AND pointer.normalized_hostname = $10
     JOIN page_studio_releases release
       ON release.tenant_id = pointer.tenant_id
      AND release.client_id = pointer.client_id
      AND release.site_id = pointer.site_id
      AND release.id = pointer.active_release_id
      AND release.environment = 'preview'
      AND release.normalized_hostname = pointer.normalized_hostname
     JOIN page_studio_builds build
       ON build.tenant_id = release.tenant_id
      AND build.client_id = release.client_id
      AND build.site_id = release.site_id
      AND build.id = release.build_id
      AND build.state = 'succeeded'
     WHERE session.nonce = $1
       AND session.tenant_id = $2
       AND session.client_id = $3::uuid
       AND session.site_id = $4::uuid
       AND session.user_id = $5
       AND session.role = $6
       AND session.capabilities = $7::jsonb
       AND session.issued_at = to_timestamp($8)
       AND session.expires_at = to_timestamp($9)
       AND session.revoked_at IS NULL
       AND session.expires_at > NOW()
       AND site.status IN ('draft', 'active')
       AND entitlement.status IN ('trial', 'active')
       AND entitlement.effective_from <= NOW()
       AND (entitlement.effective_until IS NULL OR entitlement.effective_until > NOW())`,
    [
      claims.nonce,
      claims.tenantId,
      claims.clientId,
      claims.siteId,
      claims.userId,
      claims.role,
      JSON.stringify(claims.capabilities),
      claims.issuedAt,
      claims.expiresAt,
      parsed.data.hostname
    ]
  )
  if (!row) return null

  return {
    hostname: parsed.data.hostname,
    release: {
      artifactPrefix: row.artifact_prefix,
      buildId: row.build_id,
      environment: 'preview',
      manifestDigest: row.manifest_digest,
      manifestKey: row.manifest_key,
      releaseId: row.release_id,
      scope: {
        clientId: claims.clientId,
        siteId: claims.siteId,
        tenantId: claims.tenantId
      },
      versionDigest: row.version_digest
    }
  }
}
