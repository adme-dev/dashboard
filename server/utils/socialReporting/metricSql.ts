// SUM ignores NULL, so a partially measured group must be checked before exposing a total.
// Column names below are fixed application constants, never request input.
const POST_METRICS = ['impressions', 'reach', 'engagements', 'clicks', 'likes', 'comments_count', 'shares', 'saves', 'video_views', 'reactions']
const ACCOUNT_METRICS = ['followers', 'reach', 'impressions']

function completeSum(column: string, alias: string) {
  return `CASE WHEN COUNT(${column}) = COUNT(*) THEN SUM(${column})::int ELSE NULL END AS ${alias}`
}

export const POST_METRIC_TOTALS_SQL = POST_METRICS.map(column => completeSum(`m.${column}`, column)).join(',\n')
export const ACCOUNT_METRIC_TOTALS_SQL = ACCOUNT_METRICS.map(column => completeSum(column, column)).join(',\n')
