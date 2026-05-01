// GET /api/leads/forms/discover?source=google|meta
//
// OAuth-based form picker — fans out across all active social_connections
// of the chosen platform and aggregates lead forms. Falls back gracefully
// when individual connections fail (expired tokens, missing permissions).
//
// Used by the "+ New form rule" modal so marketers can pick from a dropdown
// instead of pasting form_ids out of platform URLs.

import { z } from 'zod'
import { queryRows, execute } from '~~/server/utils/db'
import { listMetaLeadgenForms } from '~~/server/utils/metaClient'
import {
  listGoogleLeadFormAssets,
  refreshGoogleToken,
} from '~~/server/utils/googleAdsClient'

const Query = z.object({
  source: z.enum(['google', 'meta']),
})

interface ConnectionRow {
  id: string
  account_id: string
  account_name: string | null
  access_token: string | null
  refresh_token: string | null
  token_expires_at: string | null
  metadata: any
}

interface FormResult {
  form_id: string
  form_name: string
  account_id: string
  account_name: string
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)
  const { source } = Query.parse(getQuery(event))

  const connections = await queryRows<ConnectionRow>(
    `SELECT id, account_id, account_name, access_token, refresh_token,
            token_expires_at, metadata
       FROM social_connections
      WHERE platform = $1 AND status = 'active'
      ORDER BY account_name`,
    [source],
  )

  if (!connections.length) {
    return { source, forms: [] as FormResult[], connection_count: 0 }
  }

  const config = useRuntimeConfig()

  // Bound concurrency at 8 — across 100+ connections, full parallelism would
  // burst against Meta/Google rate limits and slow the picker.
  const CONCURRENCY = 8
  const results: FormResult[] = []
  const errors: string[] = []

  async function fetchForConnection(c: ConnectionRow): Promise<FormResult[]> {
    if (source === 'meta') {
      if (!c.access_token) return []
      const forms = await listMetaLeadgenForms(c.account_id, c.access_token)
      return forms.map((f) => ({
        form_id: f.id,
        form_name: f.name,
        account_id: c.account_id,
        account_name: c.account_name ?? c.account_id,
      }))
    }
    // Google — refresh token if near-expiry, then query.
    let accessToken = c.access_token ?? ''
    if (
      c.refresh_token &&
      c.token_expires_at &&
      new Date(c.token_expires_at).getTime() <= Date.now() + 5 * 60_000
    ) {
      try {
        const tokens = await refreshGoogleToken(
          c.refresh_token,
          (config as any).googleClientId,
          (config as any).googleClientSecret,
        )
        accessToken = tokens.access_token
        await execute(
          `UPDATE social_connections SET access_token = $1, token_expires_at = NOW() + INTERVAL '1 hour' WHERE id = $2`,
          [accessToken, c.id],
        )
      } catch {
        return []
      }
    }
    if (!accessToken) return []
    const meta = typeof c.metadata === 'string' ? JSON.parse(c.metadata) : c.metadata || {}
    const loginCustomerId = meta.loginCustomerId || c.account_id
    const developerToken = (config as any).googleDeveloperToken
    if (!developerToken) return []
    const assets = await listGoogleLeadFormAssets(
      c.account_id,
      accessToken,
      developerToken,
      loginCustomerId,
    )
    return assets.map((a) => ({
      form_id: a.id,
      form_name: a.business_name ? `${a.name} (${a.business_name})` : a.name,
      account_id: c.account_id,
      account_name: c.account_name ?? c.account_id,
    }))
  }

  // Concurrency-limited fan-out via simple queue.
  const queue = [...connections]
  async function worker() {
    while (queue.length) {
      const c = queue.shift()
      if (!c) break
      try {
        const forms = await fetchForConnection(c)
        results.push(...forms)
      } catch (e: any) {
        errors.push(`${c.account_name ?? c.account_id}: ${e?.message ?? 'unknown'}`)
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()))

  // Sort: account_name then form_name for stable display
  results.sort((a, b) => {
    const accountCmp = a.account_name.localeCompare(b.account_name)
    return accountCmp !== 0 ? accountCmp : a.form_name.localeCompare(b.form_name)
  })

  return {
    source,
    forms: results,
    connection_count: connections.length,
    error_count: errors.length,
  }
})
