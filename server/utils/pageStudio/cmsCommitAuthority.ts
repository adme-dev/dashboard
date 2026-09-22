import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import {
  authorizePageStudioBusinessContent,
  PageStudioBusinessContentError,
  type ContentAuthorityRequest
} from './businessContent'
import { authorizePageStudioCollections } from './collections'
import type { PageStudioControlQueryClient } from './controlStore'
import { assertPageStudioSessionAuthority } from './sessionAuthority'
import {
  PageStudioSessionClaimsSchema,
  type PageStudioSessionClaims
} from './sessions'
import {
  PageStudioContentScopeSchema,
  samePageStudioContentScope,
  type PageStudioContentScope
} from '~~/shared/pageStudio/businessContent'

type Mutation = 'business-content' | 'collection-record' | 'collection-schema'
type Principal
  = | { source: 'native-login', request: ContentAuthorityRequest }
    | {
      source: 'studio-session'
      claims: PageStudioSessionClaims
      env: Record<string, unknown>
      capability: 'workspace:checkpoint' | 'model:invoke'
    }
type RunTransaction = <T>(
  work: (db: PageStudioControlQueryClient) => Promise<T>
) => Promise<T>
interface LoginRow {
  role: 'agency' | 'client'
  token_hash: string
  user_id: string
  issued_at: Date
  expires_at: Date
}
const denied = () =>
  new PageStudioBusinessContentError(
    'CMS_AUTHORITY_DENIED',
    403,
    'CMS mutation access denied'
  )
const busy = () =>
  new PageStudioBusinessContentError(
    'CMS_AUTHORITY_BUSY',
    503,
    'CMS authority is changing. Retry the same operation.'
  )

async function one<T>(
  db: PageStudioControlQueryClient,
  sql: string,
  params: unknown[]
): Promise<T> {
  const rows = (await db.query<T>(sql, params)).rows
  if (rows.length !== 1) throw denied()
  return rows[0]!
}

async function principalRequest(
  db: PageStudioControlQueryClient,
  principal: Principal,
  scope: PageStudioContentScope
) {
  if (principal.source === 'native-login') return principal.request
  const claims = PageStudioSessionClaimsSchema.parse(principal.claims)
  if (
    claims.tenantId !== scope.tenantId
    || claims.clientId !== scope.clientId
    || claims.siteId !== scope.siteId
  )
    throw denied()
  // Discovery is not admission. The exact original login and child are locked and
  // checked again before any native work; no caller chooses a login hash.
  const row = await one<LoginRow>(
    db,
    `SELECT login.role, login.token_hash, login.user_id, login.issued_at, login.expires_at
    FROM page_studio_sessions child JOIN page_studio_login_sessions login
      ON login.role=child.role AND login.token_hash=child.login_session_hash AND login.user_id=child.user_id
    WHERE child.nonce=$1 AND child.user_id=$2 AND child.role=$3`,
    [claims.nonce, claims.userId, claims.role]
  )
  return {
    login: {
      role: row.role,
      userId: row.user_id,
      tokenHash: row.token_hash,
      issuedAt: row.issued_at,
      expiresAt: row.expires_at
    },
    actor:
      claims.role === 'agency'
        ? {
            role: 'agency' as const,
            actorId: claims.userId,
            tenantId: claims.tenantId,
            canEdit: true
          }
        : {
            role: 'client' as const,
            actorId: claims.userId,
            clientId: claims.clientId
          },
    siteId: scope.siteId,
    env: principal.env
  }
}

async function lockDependencies(
  db: PageStudioControlQueryClient,
  request: ContentAuthorityRequest,
  principal: Principal,
  scope: PageStudioContentScope,
  entitlementId: string
) {
  const { actor, login } = request
  if (
    actor.actorId !== login.userId
    || actor.role !== login.role
    || request.siteId !== scope.siteId
    || (actor.role === 'agency'
      ? actor.tenantId !== scope.tenantId
      : actor.clientId !== scope.clientId)
  )
    throw denied()
  if (actor.role === 'client')
    await one(
      db,
      `SELECT token_hash FROM client_sessions
    WHERE token_hash=$1 AND client_user_id=$2 FOR SHARE NOWAIT`,
      [login.tokenHash, actor.actorId]
    )
  await one(
    db,
    `SELECT token_hash FROM page_studio_login_sessions WHERE role=$1 AND token_hash=$2 AND user_id=$3 FOR SHARE NOWAIT`,
    [actor.role, login.tokenHash, actor.actorId]
  )
  if (principal.source === 'studio-session')
    await one(
      db,
      `SELECT nonce FROM page_studio_sessions
    WHERE nonce=$1 AND user_id=$2 AND role=$3 AND tenant_id=$4 AND client_id=$5 AND site_id=$6 AND login_session_hash=$7 FOR SHARE NOWAIT`,
      [
        principal.claims.nonce,
        actor.actorId,
        actor.role,
        scope.tenantId,
        scope.clientId,
        scope.siteId,
        login.tokenHash
      ]
    )
  await one(
    db,
    `SELECT id FROM page_studio_entitlements WHERE id=$1 AND tenant_id=$2 AND client_id=$3 FOR SHARE NOWAIT`,
    [entitlementId, scope.tenantId, scope.clientId]
  )
  await one(db, 'SELECT id FROM agency_clients WHERE id=$1 FOR SHARE NOWAIT', [
    scope.clientId
  ])
  if (actor.role === 'agency') {
    const owner = await one<{
      user_role: string
      custom_role_id: string | null
    }>(
      db,
      'SELECT user_role,custom_role_id FROM team_members WHERE id=$1 FOR SHARE NOWAIT',
      [actor.actorId]
    )
    const role = await one<{ id: string }>(
      db,
      `SELECT id FROM custom_roles
      WHERE ($1::uuid IS NOT NULL AND id=$1::uuid) OR ($1::uuid IS NULL AND slug=$2 AND is_system=TRUE) FOR SHARE NOWAIT`,
      [owner.custom_role_id, owner.user_role]
    )
    await one(
      db,
      `SELECT role_id FROM role_permission_groups WHERE role_id=$1 AND permission_group='PAGE_STUDIO_EDIT' FOR SHARE NOWAIT`,
      [role.id]
    )
  } else {
    await one(
      db,
      'SELECT id FROM client_users WHERE id=$1 AND client_id=$2 FOR SHARE NOWAIT',
      [actor.actorId, scope.clientId]
    )
    await one(
      db,
      `SELECT user_id FROM page_studio_site_memberships
      WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND user_id=$4 FOR SHARE NOWAIT`,
      [scope.tenantId, scope.clientId, scope.siteId, actor.actorId]
    )
  }
}

/** Final native authority boundary. Verify D1 preparations before entering this
 * function. Work MUST contain only bounded native SQL: never remote I/O. Site
 * locking serializes namespace creation and absent-record CAS. NOWAIT authority
 * locks avoid inverse native deactivation lock orders; exact retries are safe. */
export async function withCmsCommitAuthority<T>(
  input: {
    scope: PageStudioContentScope
    principal: Principal
    mutation: Mutation
  },
  work: (
    db: PageStudioControlQueryClient,
    scope: PageStudioContentScope
  ) => Promise<T>,
  dependencies: { runTransaction?: RunTransaction } = {}
) {
  const scope = PageStudioContentScopeSchema.parse(input.scope)
  if (
    scope.businessId !== scope.clientId
    || !z
      .enum(['business-content', 'collection-record', 'collection-schema'])
      .safeParse(input.mutation).success
  )
    throw denied()
  const run
    = dependencies.runTransaction
      ?? (callback =>
        transactionWithoutRetry(db =>
          callback(db as unknown as PageStudioControlQueryClient)
        ))
  try {
    return await run(async (db) => {
      await db.query('SET LOCAL lock_timeout=\'3s\'')
      const site = await one<{ entitlement_id: string }>(
        db,
        `SELECT entitlement_id FROM page_studio_sites
        WHERE tenant_id=$1 AND client_id=$2 AND id=$3 FOR NO KEY UPDATE`,
        [scope.tenantId, scope.clientId, scope.siteId]
      )
      const request = await principalRequest(db, input.principal, scope)
      await lockDependencies(
        db,
        request,
        input.principal,
        scope,
        site.entitlement_id
      )
      const recheck = async () => {
        const deps = {
          policyOnly: true,
          query: async (sql: string, params: unknown[]) =>
            (await db.query<import('./businessContent').ScopeRow>(sql, params))
              .rows[0] ?? null
        }
        const admitted
          = input.mutation === 'business-content'
            ? await authorizePageStudioBusinessContent(request, true, deps)
            : await authorizePageStudioCollections(
                request,
                true,
                input.mutation === 'collection-schema',
                deps
              )
        if (!samePageStudioContentScope(admitted.scope, scope)) throw denied()
        if (input.principal.source === 'studio-session') {
          await assertPageStudioSessionAuthority(
            input.principal.claims,
            input.principal.capability,
            { transaction: db }
          )
        }
      }
      await recheck()
      const result = await work(db, scope)
      // Fresh statements use wall clock time after lock waits and immediately
      // before commit, including an exact operation receipt replay.
      await recheck()
      return result
    })
  } catch (error) {
    if (
      typeof error === 'object'
      && error !== null
      && 'code' in error
      && ['55P03', '40P01', '57014'].includes(String(error.code))
    )
      throw busy()
    throw error
  }
}
