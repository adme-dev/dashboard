/**
 * Bounded, provider-read-only Google Ads AI Max audit.
 *
 * Output is deliberately aggregate-only: no tenant, connection, customer,
 * campaign, ad-group, user, or credential identifiers are emitted.
 */

import process from 'node:process'

// Nitro auto-imports this in production. The operational script supplies an
// empty runtime config so the shared resolver reads the already-loaded env.
Object.assign(globalThis, { useRuntimeConfig: () => ({}) })

const [
  { queryOne, queryRows },
  { getGoogleAiMaxRows },
  { loadGoogleAiMaxScanContext },
  {
    parseGoogleAiMaxAuditLimit,
    redactGoogleAiMaxAuditError,
    runGoogleAiMaxLiveAudit
  }
] = await Promise.all([
  import('~~/server/utils/db'),
  import('~~/server/utils/googleAdsClient'),
  import('~~/server/utils/googleAiMaxConnections'),
  import('~~/server/utils/googleAiMaxLiveAudit')
])

try {
  const selectedTenantId = process.env.AI_MAX_TENANT_ID
    || (await queryOne<{ tenant_id: string }>(`
      SELECT tenant_id
      FROM xero_org_connection
      WHERE tenant_id <> '__default__'
      ORDER BY updated_at DESC
      LIMIT 1
    `))?.tenant_id

  if (!selectedTenantId) throw new Error('No Xero tenant is available for the live audit')

  const limit = parseGoogleAiMaxAuditLimit(process.env.AI_MAX_AUDIT_LIMIT)
  const requestedConnectionId = process.env.AI_MAX_CONNECTION_ID || undefined
  const useLegacyFallback = !process.env.REPO_TOKEN_ENCRYPTION_KEY && !requestedConnectionId
  const contexts = useLegacyFallback
    ? await Promise.all((await queryRows<{ id: string }>(`
        SELECT social_connections.id::text AS id
        FROM social_connections
        LEFT JOIN media_spend ON media_spend.connection_id = social_connections.id
        WHERE social_connections.platform = 'google'
          AND social_connections.status = 'active'
          AND social_connections.google_credential_profile_id IS NULL
        GROUP BY social_connections.id
        ORDER BY MAX(media_spend.synced_at) DESC NULLS LAST,
                 social_connections.updated_at DESC,
                 social_connections.id
        LIMIT $1
      `, [limit])).map(row => loadGoogleAiMaxScanContext({
        tenantId: selectedTenantId,
        connectionId: row.id
      })))
    : [await loadGoogleAiMaxScanContext({
        tenantId: selectedTenantId,
        connectionId: requestedConnectionId
      })]
  const accounts = contexts.flatMap(context => context.accounts)
  const developerToken = contexts[0]?.developerToken || process.env.GOOGLE_DEVELOPER_TOKEN || ''
  if (accounts.length === 0) {
    throw new Error('No active Google Ads connections are available for the selected tenant')
  }

  const result = await runGoogleAiMaxLiveAudit({
    developerToken,
    accounts,
    limit
  }, {
    fetchRows: getGoogleAiMaxRows
  })

  process.stdout.write(`${JSON.stringify({
    apiVersion: 'v23',
    generatedAt: new Date().toISOString(),
    providerReadOnly: true,
    identifiersEmitted: false,
    credentialScope: useLegacyFallback ? 'legacy_fallback' : 'all_configured',
    ...result
  }, null, 2)}\n`)
  if (result.status === 'failed') process.exitCode = 1
} catch (error) {
  process.stderr.write(`${redactGoogleAiMaxAuditError(error, [
    process.env.GOOGLE_DEVELOPER_TOKEN || '',
    process.env.GOOGLE_CLIENT_SECRET || '',
    process.env.AI_MAX_TENANT_ID || '',
    process.env.AI_MAX_CONNECTION_ID || ''
  ])}\n`)
  process.exitCode = 1
}
