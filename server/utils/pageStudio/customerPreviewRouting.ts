import { createError } from 'h3'
import { transaction } from '~~/server/utils/db'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
import { readCustomerSession, readCustomerSetup } from './customerSignup'
import { resolveCustomerWorkspaceAccess } from './customerWorkspaces'
import type { RunPageStudioTransaction } from './sites'

const denied = () => createError({ statusCode: 403, statusMessage: 'Customer editor access is not available.' })
/** Routing hint only. Both configurations subsequently run their full native
 * admission again, including current storage, transfer and session validation. */
export async function readCustomerEditorEnvironment(token: string, run: RunPageStudioTransaction = transaction): Promise<'staging' | 'production'> {
  return run(async (db) => {
    const within: RunPageStudioTransaction = work => work(db)
    const user = await readCustomerSession(token, within)
    const setup = await readCustomerSetup(token, within)
    if (!setup.workspaceId) throw denied()
    const site = (await db.query<{ site_id: string, entitlement_id: string, tenant_id: string, client_id: string, completed: boolean }>(`SELECT receipt.site_id,site.entitlement_id,site.tenant_id,site.client_id,
      EXISTS(SELECT 1 FROM page_studio_managed_transfer_completions terminal
        JOIN page_studio_managed_transfer_intents intent ON intent.operation_id=terminal.operation_id AND intent.intent_digest=terminal.intent_digest
        WHERE intent.site_id=site.id AND intent.tenant_id=site.tenant_id AND intent.client_id=site.client_id) AS completed
      FROM page_studio_customer_site_requests receipt JOIN page_studio_sites site ON site.id=receipt.site_id AND site.tenant_id=receipt.tenant_id AND site.client_id=receipt.business_id
      WHERE receipt.workspace_id=$1`, [setup.workspaceId])).rows[0]
    if (!site) throw denied()
    const environment = site.completed ? 'production' : 'staging'
    const access = await resolveCustomerWorkspaceAccess({ identityId: user.identityId, workspaceId: setup.workspaceId }, within)
    if (access.role !== 'owner' || access.legacyBinding) throw denied()
    await readCustomerSession(token, within)
    return environment
  })
}
/** Called only after private machine authentication. Immutable retained ticket
 * metadata selects a fixed configuration, never a caller-provided environment.
 * Redemption independently revalidates authority, expiry and atomic consumption. */
export async function readCustomerEditorTicketEnvironment(token: string, run: RunPageStudioTransaction = transaction): Promise<'staging' | 'production'> {
  if (!/^[A-Za-z0-9_-]{64}$/.test(token)) throw denied()
  const hash = await digestPortalSessionToken(token)
  return run(async (db) => {
    const row = (await db.query<{ environment: string }>(`SELECT environment FROM page_studio_customer_editor_handoffs
      WHERE token_hash=$1 AND consumed_at IS NULL AND expires_at>clock_timestamp()`, [hash])).rows[0]
    if (!row || !['staging', 'production'].includes(row.environment)) throw denied()
    return row.environment as 'staging' | 'production'
  })
}
