import { requireRole } from '~~/server/utils/auth'
import { PERMISSIONS } from '~~/server/utils/permissions'
import { getSelectedTenant } from '~~/server/utils/session'
import {
  GoogleAiMaxExportLimitError,
  listGoogleAiMaxReadinessForExport,
  parseGoogleAiMaxReadinessQuery,
} from '~~/server/utils/googleAiMaxReadiness'
import { serializeSafeCsv } from '~~/server/utils/safeCsv'

const HEADERS = [
  'Client',
  'Google account',
  'Campaign',
  'Campaign status',
  'Readiness',
  'Migration reason',
  'AI Max enabled',
  'Search-term matching',
  'Text customisation',
  'Final URL expansion',
  'Risk flags',
  'Freshness',
  'Last scanned',
  'Owner',
  'Google Ads link',
]

export default eventHandler(async (event) => {
  await requireRole(event, PERMISSIONS.MEDIA_BUYING)
  const tenantId = await getSelectedTenant(event)
  if (!tenantId) {
    throw createError({ statusCode: 400, statusMessage: 'No Xero organisation selected' })
  }

  let filters
  try {
    filters = parseGoogleAiMaxReadinessQuery(getQuery(event))
  } catch {
    throw createError({ statusCode: 400, statusMessage: 'Invalid AI Max readiness query' })
  }

  let items
  try {
    items = await listGoogleAiMaxReadinessForExport({ tenantId, filters })
  } catch (error) {
    if (error instanceof GoogleAiMaxExportLimitError) {
      throw createError({
        statusCode: 413,
        statusMessage: 'AI Max export is too large; narrow the filters',
      })
    }
    throw error
  }

  const rows = items.map(item => [
    item.client?.name ?? '',
    item.accountName ?? '',
    item.campaignName,
    item.campaignStatus,
    item.readinessStatus,
    item.migrationReason,
    item.aiMaxEnabled == null ? 'unknown' : String(item.aiMaxEnabled),
    item.effectiveSettings.searchTermMatching,
    item.effectiveSettings.textCustomisation,
    item.effectiveSettings.finalUrlExpansion,
    item.risks.join('; '),
    item.freshness,
    item.lastObservedAt ?? '',
    item.owner?.name ?? '',
    item.deepLink ?? '',
  ])
  const csv = serializeSafeCsv(HEADERS, rows)
  const date = new Date().toISOString().slice(0, 10)

  setHeader(event, 'Content-Type', 'text/csv; charset=utf-8')
  setHeader(
    event,
    'Content-Disposition',
    `attachment; filename="google-ai-max-readiness-${date}.csv"`,
  )
  return csv
})
