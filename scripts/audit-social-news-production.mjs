import pg from 'pg'

const { Client } = pg
const client = new Client({ connectionString: process.env.DATABASE_URL })

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is required')
  process.exit(1)
}

await client.connect()
try {
  const tables = await client.query(`
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public'
       AND table_name IN (
         'social_news_items', 'social_news_sources', 'social_news_client_profiles',
         'social_news_feedback_events', 'social_content_packages',
         'social_content_package_versions', 'social_content_package_assignments',
         'client_operational_evidence', 'social_posts'
       )
     ORDER BY table_name`)
  const source = await client.query(`
    SELECT source_key, endpoint_url, enabled
      FROM social_news_sources
     WHERE source_key = 'mcp_news'`)
  const publishTargets = await client.query(`
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'social_posts' AND column_name = 'publish_targets'`)
  const counts = await client.query(`
    SELECT
      (SELECT COUNT(*)::int FROM social_news_items) AS news_items,
      (SELECT COUNT(*)::int FROM social_news_client_profiles) AS client_profiles,
      (SELECT COUNT(*)::int FROM social_news_feedback_events) AS feedback_events,
      (SELECT COUNT(*)::int FROM social_content_package_assignments WHERE status = 'active') AS active_packages,
      (SELECT COUNT(*)::int FROM client_operational_evidence WHERE review_status = 'approved') AS approved_evidence,
      (SELECT COUNT(*)::int FROM client_operational_evidence WHERE review_status = 'pending') AS pending_evidence`)

  const result = {
    ok: tables.rows.length === 9 && source.rows.length === 1 && publishTargets.rows.length === 1,
    tables: tables.rows.map(row => row.table_name),
    source: source.rows[0] || null,
    publishTargetsColumn: publishTargets.rows.length === 1,
    counts: counts.rows[0],
  }
  console.log(JSON.stringify(result, null, 2))
  process.exitCode = result.ok ? 0 : 1
} finally {
  await client.end()
}
