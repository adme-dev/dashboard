import { importPKCS8, importSPKI, jwtVerify, SignJWT } from 'jose'
import type { H3Event } from 'h3'
import { z } from 'zod'

import { transaction } from '~~/server/utils/db'

export const PAGE_STUDIO_SESSION_TOKEN_TYPE = 'XEROFLOW-PAGE-STUDIO-SESSION'
export const PAGE_STUDIO_SESSION_AUDIENCE = 'xeroflow-page-studio'
export const MAX_PAGE_STUDIO_SESSION_LIFETIME_SECONDS = 15 * 60

export const PageStudioSessionCapabilitySchema = z.enum([
  'workspace:create',
  'workspace:reconnect',
  'workspace:checkpoint',
  'workspace:preview',
  'workspace:terminate',
  'workspace:status',
  'source:edit',
  'model:invoke'
])

export type PageStudioSessionCapability = z.infer<typeof PageStudioSessionCapabilitySchema>

const ScopedIdSchema = z.string()
  .min(1)
  .max(128)
  .regex(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)

export const PageStudioSessionClaimsSchema = z.object({
  capabilities: z.array(PageStudioSessionCapabilitySchema).min(1).max(16),
  clientId: ScopedIdSchema,
  expiresAt: z.number().int().positive(),
  issuedAt: z.number().int().positive(),
  nonce: ScopedIdSchema.min(16),
  role: z.enum(['agency', 'client']),
  siteId: ScopedIdSchema,
  tenantId: ScopedIdSchema,
  userId: ScopedIdSchema
})

export type PageStudioSessionClaims = z.infer<typeof PageStudioSessionClaimsSchema>

export class PageStudioSessionError extends Error {
  constructor(
    readonly code:
      | 'ENTITLEMENT_REQUIRED'
      | 'PORTAL_EDITOR_REQUIRED'
      | 'SESSION_CLAIMS_INVALID'
      | 'SESSION_ISSUER_UNAVAILABLE'
      | 'SESSION_TOKEN_EXPIRED'
      | 'SESSION_TOKEN_INVALID'
      | 'SITE_NOT_FOUND'
      | 'SITE_UNAVAILABLE',
    readonly statusCode: number,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options)
    this.name = 'PageStudioSessionError'
  }
}

export interface PageStudioSessionQueryClient {
  query<T = Record<string, unknown>>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[] }>
}

type RunPageStudioSessionTransaction = <T>(
  callback: (db: PageStudioSessionQueryClient) => Promise<T>
) => Promise<T>

interface SessionScopeRow {
  client_id: string
  entitlement_effective: boolean
  entitlement_status: string
  membership_role?: string | null
  monthly_ai_operation_limit: number
  site_status: string
  tenant_id: string
}

interface PageStudioSessionActorInput {
  actorId: string
  siteId: string
}

export type IssuePageStudioSessionInput = PageStudioSessionActorInput & (
  | { actorRole: 'agency', tenantId: string }
  | { actorRole: 'client', clientId: string }
)

export interface IssuedPageStudioSession {
  capabilities: PageStudioSessionCapability[]
  expiresAt: number
  token: string
}

interface CloudflareContext {
  cloudflare?: { env?: Record<string, unknown> }
}

interface SessionEnvironment {
  issuer: string
  privateKey: string
}

interface IssuePageStudioSessionDependencies {
  event?: H3Event
  nonce?: () => string
  now?: () => number
  runTransaction?: RunPageStudioSessionTransaction
  signToken?: (claims: PageStudioSessionClaims) => Promise<string>
}

function issuerIsValid(value: string): boolean {
  try {
    const url = new URL(value)
    return url.protocol === 'https:'
      && url.username === ''
      && url.password === ''
      && url.pathname === '/'
      && url.search === ''
      && url.hash === ''
  } catch {
    return false
  }
}

export function resolvePageStudioSessionEnvironment(
  event?: H3Event
): SessionEnvironment {
  const env = (event?.context as CloudflareContext | undefined)?.cloudflare?.env
  const boundPrivateKey = env && Object.prototype.hasOwnProperty.call(env, 'PAGE_STUDIO_SESSION_PRIVATE_KEY')
    ? env.PAGE_STUDIO_SESSION_PRIVATE_KEY
    : undefined
  const boundIssuer = env && Object.prototype.hasOwnProperty.call(env, 'PAGE_STUDIO_SESSION_ISSUER')
    ? env.PAGE_STUDIO_SESSION_ISSUER
    : undefined
  const privateKey = boundPrivateKey === undefined
    ? process.env.PAGE_STUDIO_SESSION_PRIVATE_KEY
    : boundPrivateKey
  const issuer = boundIssuer === undefined
    ? process.env.PAGE_STUDIO_SESSION_ISSUER
    : boundIssuer

  if (typeof privateKey !== 'string'
    || privateKey.length < 128
    || privateKey.length > 16_384
    || !privateKey.includes('BEGIN PRIVATE KEY')
    || typeof issuer !== 'string'
    || !issuerIsValid(issuer)) {
    throw new PageStudioSessionError(
      'SESSION_ISSUER_UNAVAILABLE',
      503,
      'Page Studio session issuance is not configured'
    )
  }
  return { issuer, privateKey }
}

function validatedClaims(input: PageStudioSessionClaims): PageStudioSessionClaims {
  const parsed = PageStudioSessionClaimsSchema.safeParse(input)
  if (!parsed.success) {
    throw new PageStudioSessionError(
      'SESSION_CLAIMS_INVALID',
      500,
      'Page Studio session claims are invalid',
      { cause: parsed.error }
    )
  }
  const lifetime = parsed.data.expiresAt - parsed.data.issuedAt
  if (lifetime <= 0 || lifetime > MAX_PAGE_STUDIO_SESSION_LIFETIME_SECONDS) {
    throw new PageStudioSessionError(
      'SESSION_CLAIMS_INVALID',
      500,
      'Page Studio session lifetime is invalid'
    )
  }
  return parsed.data
}

export async function signPageStudioSessionToken(
  input: PageStudioSessionClaims,
  privateKeyPem: string,
  issuer: string
): Promise<string> {
  const claims = validatedClaims(input)
  if (!issuerIsValid(issuer)) {
    throw new PageStudioSessionError(
      'SESSION_ISSUER_UNAVAILABLE',
      503,
      'Page Studio session issuance is not configured'
    )
  }
  try {
    const privateKey = await importPKCS8(privateKeyPem, 'ES256')
    return await new SignJWT(claims)
      .setProtectedHeader({ alg: 'ES256', typ: PAGE_STUDIO_SESSION_TOKEN_TYPE })
      .setIssuer(issuer)
      .setAudience(PAGE_STUDIO_SESSION_AUDIENCE)
      .setSubject(claims.userId)
      .setJti(claims.nonce)
      .setIssuedAt(claims.issuedAt)
      .setExpirationTime(claims.expiresAt)
      .sign(privateKey)
  } catch (error) {
    if (error instanceof PageStudioSessionError) throw error
    throw new PageStudioSessionError(
      'SESSION_ISSUER_UNAVAILABLE',
      503,
      'Page Studio session issuance is not configured',
      { cause: error }
    )
  }
}

export async function verifyPageStudioSessionToken(
  token: string,
  publicKeyPem: string,
  issuer: string,
  currentDate: Date = new Date()
): Promise<PageStudioSessionClaims> {
  if (!(token.length > 0 && token.length <= 8192)
    || publicKeyPem.length < 128
    || publicKeyPem.length > 16_384
    || !publicKeyPem.includes('BEGIN PUBLIC KEY')
    || !issuerIsValid(issuer)) {
    throw new PageStudioSessionError(
      'SESSION_TOKEN_INVALID',
      401,
      'Page Studio session token is invalid'
    )
  }
  try {
    const publicKey = await importSPKI(publicKeyPem, 'ES256')
    const verified = await jwtVerify(token, publicKey, {
      algorithms: ['ES256'],
      audience: PAGE_STUDIO_SESSION_AUDIENCE,
      currentDate,
      issuer,
      maxTokenAge: MAX_PAGE_STUDIO_SESSION_LIFETIME_SECONDS,
      requiredClaims: ['exp', 'iat', 'jti', 'sub'],
      typ: PAGE_STUDIO_SESSION_TOKEN_TYPE
    })
    const claims = validatedClaims(verified.payload as PageStudioSessionClaims)
    if (verified.payload.exp !== claims.expiresAt
      || verified.payload.iat !== claims.issuedAt
      || verified.payload.jti !== claims.nonce
      || verified.payload.sub !== claims.userId) {
      throw new PageStudioSessionError(
        'SESSION_TOKEN_INVALID',
        401,
        'Page Studio session token is invalid'
      )
    }
    return claims
  } catch (error) {
    if (error instanceof PageStudioSessionError
      && ['SESSION_TOKEN_EXPIRED', 'SESSION_TOKEN_INVALID'].includes(error.code)) {
      throw error
    }
    const expired = typeof error === 'object'
      && error !== null
      && 'code' in error
      && error.code === 'ERR_JWT_EXPIRED'
    throw new PageStudioSessionError(
      expired ? 'SESSION_TOKEN_EXPIRED' : 'SESSION_TOKEN_INVALID',
      401,
      expired ? 'Page Studio session token has expired' : 'Page Studio session token is invalid',
      { cause: error }
    )
  }
}

function capabilitiesFor(
  actorRole: 'agency' | 'client',
  monthlyAiOperationLimit: number
): PageStudioSessionCapability[] {
  const capabilities: PageStudioSessionCapability[] = [
    'workspace:create',
    'workspace:reconnect',
    'workspace:checkpoint',
    'workspace:preview',
    'workspace:terminate',
    'workspace:status'
  ]
  if (actorRole === 'agency') capabilities.push('source:edit')
  if (monthlyAiOperationLimit > 0) capabilities.push('model:invoke')
  return capabilities
}

const defaultRunTransaction: RunPageStudioSessionTransaction = async callback =>
  transaction(async db => callback(db as unknown as PageStudioSessionQueryClient))

export async function issuePageStudioSession(
  input: IssuePageStudioSessionInput,
  dependencies: IssuePageStudioSessionDependencies = {}
): Promise<IssuedPageStudioSession> {
  const runTransaction = dependencies.runTransaction ?? defaultRunTransaction
  const now = dependencies.now ?? (() => Math.floor(Date.now() / 1000))
  const nonce = dependencies.nonce ?? (() => crypto.randomUUID())
  const environment = dependencies.signToken
    ? null
    : resolvePageStudioSessionEnvironment(dependencies.event)
  const signToken = dependencies.signToken ?? (claims => signPageStudioSessionToken(
    claims,
    environment!.privateKey,
    environment!.issuer
  ))

  return await runTransaction(async (db) => {
    const scopeResult = input.actorRole === 'agency'
      ? await db.query<SessionScopeRow>(
          `SELECT site.tenant_id, site.client_id, site.status AS site_status,
                  entitlement.status AS entitlement_status,
                  (entitlement.effective_from <= NOW()
                   AND (entitlement.effective_until IS NULL OR entitlement.effective_until > NOW()))
                    AS entitlement_effective,
                  entitlement.monthly_ai_operation_limit
           FROM page_studio_sites site
           JOIN page_studio_entitlements entitlement
             ON entitlement.tenant_id = site.tenant_id
            AND entitlement.client_id = site.client_id
            AND entitlement.id = site.entitlement_id
           WHERE site.tenant_id = $1 AND site.id = $2
           FOR SHARE OF site, entitlement`,
          [input.tenantId, input.siteId]
        )
      : await db.query<SessionScopeRow>(
          `SELECT site.tenant_id, site.client_id, site.status AS site_status,
                  entitlement.status AS entitlement_status,
                  (entitlement.effective_from <= NOW()
                   AND (entitlement.effective_until IS NULL OR entitlement.effective_until > NOW()))
                    AS entitlement_effective,
                  entitlement.monthly_ai_operation_limit,
                  (SELECT membership.role
                   FROM page_studio_site_memberships membership
                   WHERE membership.tenant_id = site.tenant_id
                     AND membership.client_id = site.client_id
                     AND membership.site_id = site.id
                     AND membership.user_id = $3
                   FOR SHARE) AS membership_role
           FROM page_studio_sites site
           JOIN page_studio_entitlements entitlement
             ON entitlement.tenant_id = site.tenant_id
            AND entitlement.client_id = site.client_id
            AND entitlement.id = site.entitlement_id
           WHERE site.client_id = $1 AND site.id = $2
           FOR SHARE OF site, entitlement`,
          [input.clientId, input.siteId, input.actorId]
        )
    const scope = scopeResult.rows[0]
    if (!scope) {
      throw new PageStudioSessionError('SITE_NOT_FOUND', 404, 'Page Studio site not found')
    }
    if (!['draft', 'active'].includes(scope.site_status)) {
      throw new PageStudioSessionError('SITE_UNAVAILABLE', 403, 'Page Studio site is unavailable')
    }
    if (!['trial', 'active'].includes(scope.entitlement_status)
      || scope.entitlement_effective !== true) {
      throw new PageStudioSessionError(
        'ENTITLEMENT_REQUIRED',
        403,
        'The client does not have an active Page Studio subscription'
      )
    }
    if (input.actorRole === 'client' && scope.membership_role !== 'editor') {
      throw new PageStudioSessionError(
        'PORTAL_EDITOR_REQUIRED',
        403,
        'Page Studio editor membership is required'
      )
    }

    const issuedAt = now()
    const claims = validatedClaims({
      capabilities: capabilitiesFor(input.actorRole, scope.monthly_ai_operation_limit),
      clientId: scope.client_id,
      expiresAt: issuedAt + MAX_PAGE_STUDIO_SESSION_LIFETIME_SECONDS,
      issuedAt,
      nonce: nonce(),
      role: input.actorRole,
      siteId: input.siteId,
      tenantId: scope.tenant_id,
      userId: input.actorId
    })
    const token = await signToken(claims)

    await db.query(
      `INSERT INTO page_studio_sessions (
         nonce, tenant_id, client_id, site_id, user_id, role,
         capabilities, issued_at, expires_at
       )
       VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
      [
        claims.nonce,
        claims.tenantId,
        claims.clientId,
        claims.siteId,
        claims.userId,
        claims.role,
        JSON.stringify(claims.capabilities),
        new Date(claims.issuedAt * 1000).toISOString(),
        new Date(claims.expiresAt * 1000).toISOString()
      ]
    )
    await db.query(
      `INSERT INTO page_studio_audit_events (
         tenant_id, client_id, site_id, actor_id, actor_role, action,
         resource_type, resource_id, metadata
       )
       VALUES ($1, $2, $3, $4, $5, 'session.issued', 'session', $6, $7::jsonb)`,
      [
        claims.tenantId,
        claims.clientId,
        claims.siteId,
        claims.userId,
        claims.role,
        claims.nonce,
        JSON.stringify({ capabilities: claims.capabilities, expiresAt: claims.expiresAt })
      ]
    )

    return { capabilities: claims.capabilities, expiresAt: claims.expiresAt, token }
  })
}
