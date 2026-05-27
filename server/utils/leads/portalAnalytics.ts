export const PORTAL_VISIBLE_LEADS_EXISTS = `EXISTS (
  SELECT 1 FROM lead_form_rules r
  JOIN lead_rule_destinations d ON d.rule_id = r.id
  WHERE r.source = l.source AND r.form_id = l.form_id
    AND r.client_id = l.client_id
    AND r.enabled = TRUE
    AND d.destination_type = 'portal' AND d.enabled = TRUE
)`

export const PORTAL_LEAD_STATUS_SELECT = `
  COUNT(*)::int AS lead_count,
  COUNT(*) FILTER (WHERE l.status = 'new')::int AS lead_new_count,
  COUNT(*) FILTER (WHERE l.status = 'contacted')::int AS lead_contacted_count,
  COUNT(*) FILTER (WHERE l.status = 'qualified')::int AS lead_qualified_count,
  COUNT(*) FILTER (WHERE l.status = 'won')::int AS lead_won_count,
  COUNT(*) FILTER (WHERE l.status = 'lost')::int AS lead_lost_count
`

export function leadSourceForPlatformSql(alias = 'ms'): string {
  return `CASE
    WHEN ${alias}.platform = 'google_ads' THEN 'google'
    WHEN ${alias}.platform = 'meta' THEN 'meta'
    ELSE ${alias}.platform
  END`
}

export function leadPlatformForSourceSql(alias = 'l'): string {
  return `CASE
    WHEN ${alias}.source = 'google' THEN 'google_ads'
    WHEN ${alias}.source = 'meta' THEN 'meta'
    ELSE ${alias}.source
  END`
}

export function leadDateBucketSql(groupBy: string): string {
  if (groupBy === 'week') return `DATE_TRUNC('week', l.submitted_at)::date`
  if (groupBy === 'month') return `DATE_TRUNC('month', l.submitted_at)::date`
  return `l.submitted_at::date`
}
