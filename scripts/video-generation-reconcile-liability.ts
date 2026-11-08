/**
 * Operator-only reconciliation of ONE terminal video generation job with 'uncertain'
 * liability, backed by verifiable provider evidence. Dry-run by default.
 *
 *   DATABASE_URL=... pnpm exec tsx scripts/video-generation-reconcile-liability.ts \
 *     --operation-id <unique id> --job <uuid> --tenant <tenant id> --project <uuid> \
 *     --expected-cents <current liability_cents> --outcome reported|released \
 *     [--actual-cents <operator-attested cost in USD cents>] --evidence-kind provider_log|provider_invoice|provider_support_case \
 *     --evidence-ref <provider log id / invoice line / case id> --evidence-sha256 <sha256 of the retained artifact> \
 *     --validation-method provider_console_lookup|provider_api_export|invoice_line_match|provider_support_confirmation \
 *     --provider-identity <provider-side id of this exact job> --currency USD \
 *     --actor <owner team_member uuid> [--note <text>] [--apply]
 *
 * The SHA-256 only fingerprints the retained artifact for later review; it is not proof.
 *
 * Never use this to make a cap fit or to clear liability without proof: the evidence
 * row is permanent and audited (migration 509). Live jobs are rejected.
 */
import { parseArgs } from 'node:util'
import { Pool } from 'pg'
import { reconcileVideoGenerationLiabilityIn } from '../server/utils/video-generation/liabilityReconciliation'
import type { ReconcileVideoGenerationLiabilityInput, ReconciliationEvidenceKind, ReconciliationOutcome } from '../server/utils/video-generation/liabilityReconciliation'

// Strict parsing: unknown or duplicated flags, and flags missing a value, are errors;
// --apply is only ever the boolean flag, never a value consumed by another option.
const { values } = parseArgs({
  strict: true,
  allowPositionals: false,
  options: Object.fromEntries([
    ...['operation-id', 'job', 'tenant', 'project', 'expected-cents', 'outcome', 'actual-cents', 'evidence-kind',
      'evidence-ref', 'evidence-sha256', 'validation-method', 'provider-identity', 'currency', 'actor', 'note']
      .map(name => [name, { type: 'string' as const }]),
    ['apply', { type: 'boolean' as const, default: false }]
  ])
}) as { values: Record<string, string | boolean | undefined> }

for (const name of Object.keys(values)) {
  const occurrences = process.argv.filter(token => token === `--${name}` || token.startsWith(`--${name}=`)).length
  if (occurrences > 1) throw new Error(`--${name} was given more than once`)
}

function arg(name: string): string | undefined {
  const value = values[name]
  return typeof value === 'string' ? value : undefined
}

async function main() {
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required (it is never printed)')
  const apply = values.apply === true
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
    evidenceSha256: arg('evidence-sha256') ?? '',
    validationMethod: arg('validation-method') as ReconcileVideoGenerationLiabilityInput['validationMethod'],
    providerIdentity: arg('provider-identity') ?? '',
    currency: (arg('currency') ?? '') as 'USD',
    note: arg('note') ?? null,
    actorId: arg('actor') ?? ''
  }
  const pool = new Pool({ connectionString, max: 1, application_name: 'video-generation-reconcile-liability' })
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
