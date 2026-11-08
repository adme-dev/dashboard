/**
 * Operator-only reconciliation of ONE terminal video generation job with 'uncertain'
 * liability, backed by verifiable provider evidence. Dry-run by default.
 *
 *   DATABASE_URL=... pnpm exec tsx scripts/video-generation-reconcile-liability.ts \
 *     --operation-id <unique id> --job <uuid> --tenant <tenant id> --project <uuid> \
 *     --expected-cents <current liability_cents> --outcome reported|released \
 *     [--actual-cents <provider-proven cost>] --evidence-kind provider_log|provider_invoice|provider_support_case \
 *     --evidence-ref <provider log id / invoice line / case id> [--evidence-sha256 <hex>] \
 *     --actor <owner team_member uuid> [--note <text>] [--apply]
 *
 * Never use this to make a cap fit or to clear liability without proof: the evidence
 * row is permanent and audited (migration 509). Live jobs are rejected.
 */
import { Pool } from 'pg'
import { reconcileVideoGenerationLiabilityIn } from '../server/utils/video-generation/liabilityReconciliation'
import type { ReconcileVideoGenerationLiabilityInput, ReconciliationEvidenceKind, ReconciliationOutcome } from '../server/utils/video-generation/liabilityReconciliation'

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index > 0 ? process.argv[index + 1] : undefined
}

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required (it is never printed)')
  const apply = process.argv.includes('--apply')
  const actual = arg('actual-cents')
  const input: ReconcileVideoGenerationLiabilityInput = {
    operationId: arg('operation-id') ?? '',
    jobId: arg('job') ?? '',
    tenantId: arg('tenant') ?? '',
    projectId: arg('project') ?? '',
    expectedLiabilityCents: Number(arg('expected-cents')),
    outcome: arg('outcome') as ReconciliationOutcome,
    actualCostCents: actual === undefined ? null : Number(actual),
    evidenceKind: arg('evidence-kind') as ReconciliationEvidenceKind,
    evidenceReference: arg('evidence-ref') ?? '',
    evidenceSha256: arg('evidence-sha256') ?? null,
    note: arg('note') ?? null,
    actorId: arg('actor') ?? ''
  }
  const pool = new Pool({ connectionString, max: 1 })
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    await client.query('SET LOCAL lock_timeout = \'5s\'')
    const result = await reconcileVideoGenerationLiabilityIn(client, input, { apply })
    if (apply && result.ok) await client.query('COMMIT')
    else await client.query('ROLLBACK')
    console.log(JSON.stringify({ mode: apply ? 'apply' : 'dry-run', jobId: input.jobId, operationId: input.operationId, result }))
    if (!result.ok) process.exitCode = 2
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : 'reconciliation failed')
  process.exit(1)
})
