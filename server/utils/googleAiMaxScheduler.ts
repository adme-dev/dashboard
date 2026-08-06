import { queryRows } from '~~/server/utils/db'
import { loadGoogleAiMaxScanContext } from '~~/server/utils/googleAiMaxConnections'
import { runGoogleAiMaxPortfolioScan } from '~~/server/utils/googleAiMaxScanner'

interface TenantRow {
  tenant_id: string
}

interface GoogleAiMaxSchedulerDependencies {
  listTenants: () => Promise<TenantRow[]>
  loadContext: typeof loadGoogleAiMaxScanContext
  runScan: typeof runGoogleAiMaxPortfolioScan
}

const defaultDependencies: GoogleAiMaxSchedulerDependencies = {
  listTenants: () => queryRows<TenantRow>(`
    SELECT tenant_id
    FROM xero_org_connection
    WHERE tenant_id <> '__default__'
    ORDER BY updated_at DESC, tenant_id
  `),
  loadContext: loadGoogleAiMaxScanContext,
  runScan: runGoogleAiMaxPortfolioScan
}

export interface GoogleAiMaxScheduledScanResult {
  tenantCount: number
  started: number
  skipped: number
  failed: number
  results: Array<{
    tenantId: string
    status: 'completed' | 'partial' | 'failed' | 'overlap' | 'no_connections'
    runId?: string
    error?: string
  }>
}

function safeError(error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown scheduled scan error'
  return message
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, 'Bearer [REDACTED]')
    .slice(0, 160)
}

export async function runGoogleAiMaxScheduledScans(
  input: { observedAt?: string },
  dependencies: GoogleAiMaxSchedulerDependencies = defaultDependencies
): Promise<GoogleAiMaxScheduledScanResult> {
  const tenants = await dependencies.listTenants()
  const result: GoogleAiMaxScheduledScanResult = {
    tenantCount: tenants.length,
    started: 0,
    skipped: 0,
    failed: 0,
    results: []
  }

  for (const tenant of tenants) {
    try {
      const context = await dependencies.loadContext({ tenantId: tenant.tenant_id })
      if (context.accounts.length === 0) {
        result.skipped += 1
        result.results.push({ tenantId: tenant.tenant_id, status: 'no_connections' })
        continue
      }

      const scan = await dependencies.runScan({
        tenantId: tenant.tenant_id,
        trigger: 'scheduled',
        developerToken: context.developerToken,
        observedAt: input.observedAt ?? new Date().toISOString(),
        accounts: context.accounts
      })
      if (!scan.accepted) {
        result.skipped += 1
        result.results.push({ tenantId: tenant.tenant_id, status: 'overlap' })
        continue
      }

      result.started += 1
      const status = scan.run.status === 'partial'
        ? 'partial'
        : scan.run.status === 'failed'
          ? 'failed'
          : 'completed'
      result.results.push({ tenantId: tenant.tenant_id, status, runId: scan.run.id })
    } catch (error) {
      result.failed += 1
      result.results.push({
        tenantId: tenant.tenant_id,
        status: 'failed',
        error: safeError(error)
      })
    }
  }

  console.log('[google-ai-max-cron]', {
    tenantCount: result.tenantCount,
    started: result.started,
    skipped: result.skipped,
    failed: result.failed
  })
  return result
}
