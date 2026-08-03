import { createHash } from 'node:crypto'

import type { SearchAuthorityTrustFindingCandidate } from '~~/server/utils/searchAuthority/trustChecks'

type QueryExecutor = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>

interface ReconcileTrustFindingsInput {
  clientId: string
  domainId: string
  pageId: string
  runId: string
  canonicalUrl: string
  observationComplete: boolean
  findings: SearchAuthorityTrustFindingCandidate[]
}

export async function reconcileSearchAuthorityTrustFindings(
  query: QueryExecutor,
  input: ReconcileTrustFindingsInput
): Promise<void> {
  const observedFingerprints: string[] = []

  for (const finding of input.findings) {
    const fingerprint = trustFindingFingerprint(input.domainId, input.canonicalUrl, finding.checkKey)
    observedFingerprints.push(fingerprint)
    await query(`
      INSERT INTO search_authority_trust_findings (
        client_id, domain_id, page_id, last_observed_run_id, fingerprint,
        check_key, severity, owner, title, summary, evidence
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
      ON CONFLICT (domain_id, fingerprint) DO UPDATE SET
        page_id = EXCLUDED.page_id,
        last_observed_run_id = EXCLUDED.last_observed_run_id,
        severity = EXCLUDED.severity,
        owner = EXCLUDED.owner,
        title = EXCLUDED.title,
        summary = EXCLUDED.summary,
        evidence = EXCLUDED.evidence,
        recurrence_count = search_authority_trust_findings.recurrence_count + 1,
        lifecycle_status = CASE
          WHEN search_authority_trust_findings.lifecycle_status = 'dismissed' THEN 'dismissed'
          ELSE 'open'
        END,
        last_seen_at = NOW(),
        resolved_at = CASE
          WHEN search_authority_trust_findings.lifecycle_status = 'dismissed'
            THEN search_authority_trust_findings.resolved_at
          ELSE NULL
        END,
        resolved_by = CASE
          WHEN search_authority_trust_findings.lifecycle_status = 'dismissed'
            THEN search_authority_trust_findings.resolved_by
          ELSE NULL
        END,
        updated_at = NOW()
    `, [
      input.clientId,
      input.domainId,
      input.pageId,
      input.runId,
      fingerprint,
      finding.checkKey,
      finding.severity,
      finding.owner,
      finding.title.slice(0, 300),
      finding.summary.slice(0, 2000),
      boundedEvidence(finding.evidence)
    ])
  }

  if (!input.observationComplete) return
  await query(`
    UPDATE search_authority_trust_findings
    SET lifecycle_status = 'resolved',
        resolved_at = NOW(),
        resolved_by = NULL,
        updated_at = NOW()
    WHERE client_id = $1
      AND domain_id = $2
      AND page_id = $3
      AND lifecycle_status IN ('open', 'actioned')
      AND NOT (fingerprint::text = ANY($5::text[]))
      AND last_observed_run_id <> $4
  `, [input.clientId, input.domainId, input.pageId, input.runId, observedFingerprints])
}

export function trustFindingFingerprint(domainId: string, canonicalUrl: string, checkKey: string): string {
  return createHash('sha256')
    .update(`${domainId}\n${canonicalUrl}\n${checkKey}`, 'utf8')
    .digest('hex')
}

function boundedEvidence(evidence: Record<string, string | number | boolean | null>): string {
  const entries = Object.entries(evidence).slice(0, 30).map(([key, value]) => [
    key.slice(0, 120),
    typeof value === 'string' ? value.slice(0, 1000) : value
  ])
  let json = JSON.stringify(Object.fromEntries(entries))
  if (Buffer.byteLength(json, 'utf8') <= 8000) return json
  json = JSON.stringify({ truncated: true, keys: entries.map(([key]) => key).slice(0, 20) })
  return json
}
