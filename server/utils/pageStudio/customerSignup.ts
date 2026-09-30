import { createError } from 'h3'
import { z } from 'zod'
import { transaction } from '~~/server/utils/db'
import { digestPortalSessionToken, generatePortalMagicLinkToken } from '~~/server/utils/portalSession'
import { CustomerSignInRequest, CustomerSetupWrite, type CustomerSetup } from '~~/shared/pageStudio/customerSignup'
import { createCustomerWorkspace, resolveCustomerWorkspaceAccess } from './customerWorkspaces'
import type { PageStudioQueryClient, RunPageStudioTransaction } from './sites'

const Token = z.string().regex(/^[A-Za-z0-9_-]{64}$/)
const invalid = () => createError({ statusCode: 401, statusMessage: 'This sign-in link or session is invalid or has expired.' })
const conflict = () => createError({ statusCode: 409, statusMessage: 'Your setup changed. Reload the saved version before continuing.' })
function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value)
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Check your details and try again.' })
  return parsed.data
}
interface Account { id: string, email: string, name: string, identity_id: string | null, status: string, identity_status: string | null }
export interface CustomerSession { accountId: string, identityId: string, email: string, name: string }
interface SetupRow { revision: number, draft: CustomerSetup, workspace_id: string | null, creation_request_id: string }

export async function requestCustomerSignIn(body: unknown, termsVersion: string, run: RunPageStudioTransaction = transaction) {
  const input = parse(CustomerSignInRequest, body)
  parse(z.string().trim().min(1).max(100), termsVersion)
  return run(async (db) => {
    if (input.mode === 'signup') {
      await db.query(`INSERT INTO page_studio_customer_accounts (email, name, terms_version)
        VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING`, [input.email, input.name, termsVersion])
    }
    const result = await db.query<Account>(`SELECT account.*, identity.status AS identity_status
      FROM page_studio_customer_accounts account
      LEFT JOIN page_studio_customer_identities identity ON identity.id = account.identity_id
      WHERE account.email = $1 FOR UPDATE OF account`, [input.email])
    const account = result.rows[0]
    if (!account || account.status === 'suspended' || (account.identity_id && account.identity_status !== 'active')
      || (input.mode === 'signin' && account.status !== 'active')) return null
    if (input.mode === 'signup' && account.status === 'pending') {
      // Bind metadata to the newest link, under the same lock as token rotation.
      // Once verified, anonymous requests cannot alter the account profile or consent.
      await db.query(`UPDATE page_studio_customer_accounts
        SET name = $2, terms_version = $3, terms_accepted_at = clock_timestamp()
        WHERE id = $1 AND status = 'pending'`, [account.id, input.name, termsVersion])
    }
    const token = generatePortalMagicLinkToken()
    await db.query('UPDATE page_studio_customer_login_tokens SET consumed_at = clock_timestamp() WHERE account_id = $1 AND consumed_at IS NULL', [account.id])
    await db.query(`INSERT INTO page_studio_customer_login_tokens (account_id, token_hash, expires_at)
      VALUES ($1, $2, clock_timestamp() + INTERVAL '15 minutes')`, [account.id, await digestPortalSessionToken(token)])
    return { email: account.email, token }
  })
}

export async function verifyCustomerSignIn(rawToken: unknown, run: RunPageStudioTransaction = transaction) {
  const token = parse(Token, rawToken)
  const tokenHash = await digestPortalSessionToken(token)
  return run(async (db) => {
    const lookup = await db.query<{ account_id: string }>('SELECT account_id FROM page_studio_customer_login_tokens WHERE token_hash = $1', [tokenHash])
    if (!lookup.rows[0]) throw invalid()
    // Same lock ordering as request/resend: account first, then token.
    const result = await db.query<Account>(`SELECT account.*, identity.status AS identity_status
      FROM page_studio_customer_accounts account
      LEFT JOIN page_studio_customer_identities identity ON identity.id = account.identity_id
      WHERE account.id = $1 FOR UPDATE OF account`, [lookup.rows[0].account_id])
    const account = result.rows[0]
    if (!account || account.status === 'suspended' || (account.identity_id && account.identity_status !== 'active')) throw invalid()
    const consumed = await db.query(`UPDATE page_studio_customer_login_tokens SET consumed_at = clock_timestamp()
      WHERE token_hash = $1 AND consumed_at IS NULL AND expires_at > clock_timestamp() RETURNING token_hash`, [tokenHash])
    if (!consumed.rows[0]) throw invalid()
    let identityId = account.identity_id
    if (!identityId) {
      const created = await db.query<{ id: string }>(`INSERT INTO page_studio_customer_identities (issuer, subject, verified_at)
        VALUES ('studio', $1, clock_timestamp()) RETURNING id`, [account.id])
      identityId = created.rows[0]!.id
      await db.query(`UPDATE page_studio_customer_accounts SET identity_id = $1, status = 'active' WHERE id = $2`, [identityId, account.id])
    }
    const sessionToken = generatePortalMagicLinkToken()
    await db.query(`INSERT INTO page_studio_customer_sessions (token_hash, account_id, expires_at)
      VALUES ($1, $2, clock_timestamp() + INTERVAL '30 days')`, [await digestPortalSessionToken(sessionToken), account.id])
    return { sessionToken, identityId }
  })
}

async function sessionInTransaction(db: PageStudioQueryClient, rawToken: unknown): Promise<CustomerSession> {
  if (!Token.safeParse(rawToken).success) throw invalid()
  const hash = await digestPortalSessionToken(rawToken as string)
  const result = await db.query<CustomerSession>(`SELECT account.id AS "accountId", account.identity_id AS "identityId", account.email, account.name
    FROM page_studio_customer_sessions session
    JOIN page_studio_customer_accounts account ON account.id = session.account_id
    JOIN page_studio_customer_identities identity ON identity.id = account.identity_id
    WHERE session.token_hash = $1 AND session.expires_at > clock_timestamp() AND session.revoked_at IS NULL
      AND account.status = 'active' AND identity.status = 'active' AND identity.verified_at <= clock_timestamp()
      AND identity.issuer = 'studio' AND identity.subject = account.id::text
    FOR UPDATE OF account, identity, session`, [hash])
  if (!result.rows[0]) throw invalid()
  return result.rows[0]
}
export async function readCustomerSession(token: unknown, run: RunPageStudioTransaction = transaction) {
  return run(db => sessionInTransaction(db, token))
}
export async function revokeCustomerSession(token: unknown, run: RunPageStudioTransaction = transaction) {
  if (!Token.safeParse(token).success) return
  const hash = await digestPortalSessionToken(token as string)
  await run(async (db) => {
    await db.query('UPDATE page_studio_customer_sessions SET revoked_at = clock_timestamp() WHERE token_hash = $1', [hash])
  })
}
async function setupRow(db: PageStudioQueryClient, identityId: string) {
  return (await db.query<SetupRow>('SELECT * FROM page_studio_customer_setup_drafts WHERE identity_id = $1 FOR UPDATE', [identityId])).rows[0]
}
const emptyDraft = (): CustomerSetup => ({ businessName: '', businessType: '', timezone: 'UTC', goals: [] })
export async function readCustomerSetup(token: unknown, run: RunPageStudioTransaction = transaction) {
  return run(async (db) => {
    const user = await sessionInTransaction(db, token)
    const row = await setupRow(db, user.identityId)
    if (row?.workspace_id) await resolveCustomerWorkspaceAccess({ identityId: user.identityId, workspaceId: row.workspace_id }, fn => fn(db))
    return { revision: row?.revision ?? 0, draft: row?.draft ?? emptyDraft(), workspaceId: row?.workspace_id ?? null }
  })
}
export async function saveCustomerSetup(token: unknown, body: unknown, run: RunPageStudioTransaction = transaction) {
  const input = parse(CustomerSetupWrite, body)
  return run(async (db) => {
    const user = await sessionInTransaction(db, token)
    const row = await setupRow(db, user.identityId)
    if (row?.workspace_id || (row?.revision ?? 0) !== input.expectedRevision) throw conflict()
    await db.query(`INSERT INTO page_studio_customer_setup_drafts (identity_id, draft) VALUES ($1, $2::jsonb)
      ON CONFLICT (identity_id) DO UPDATE SET draft = EXCLUDED.draft, revision = page_studio_customer_setup_drafts.revision + 1, updated_at = clock_timestamp()`, [user.identityId, JSON.stringify(input.draft)])
    return { revision: input.expectedRevision + 1 }
  })
}
export async function completeCustomerSetup(token: unknown, expectedRevision: unknown, run: RunPageStudioTransaction = transaction) {
  const revision = parse(z.number().int().min(0), expectedRevision)
  return run(async (db) => {
    const user = await sessionInTransaction(db, token)
    const row = await setupRow(db, user.identityId)
    if (!row || row.revision !== revision) throw conflict()
    if (row.workspace_id) {
      await resolveCustomerWorkspaceAccess({ identityId: user.identityId, workspaceId: row.workspace_id }, fn => fn(db))
      return { workspaceId: row.workspace_id }
    }
    if (!row.draft.businessName.trim() || !row.draft.businessType.trim() || row.draft.goals.length === 0) throw conflict()
    const result = await createCustomerWorkspace({ identityId: user.identityId, requestId: row.creation_request_id, name: row.draft.businessName }, fn => fn(db))
    await db.query('UPDATE page_studio_customer_setup_drafts SET workspace_id = $1, updated_at = clock_timestamp() WHERE identity_id = $2', [result.workspace.id, user.identityId])
    return { workspaceId: result.workspace.id }
  })
}
