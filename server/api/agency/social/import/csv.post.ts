/**
 * POST /api/agency/social/import/csv
 * Bulk CSV import of spend data for any platform.
 * Expects multipart form: file (CSV), platform (string), period (YYYY-MM).
 */
import { requireAuth } from '~~/server/utils/auth'
import { queryOne, execute } from '~~/server/utils/db'

function parseCSVLine(line: string): string[] {
  const fields: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        current += '"'
        i++ // skip escaped quote
      } else if (ch === '"') {
        inQuotes = false
      } else {
        current += ch
      }
    } else {
      if (ch === '"') {
        inQuotes = true
      } else if (ch === ',') {
        fields.push(current.trim())
        current = ''
      } else {
        current += ch
      }
    }
  }
  fields.push(current.trim())
  return fields
}

export default defineEventHandler(async (event) => {
  await requireAuth(event)

  const formData = await readMultipartFormData(event)
  if (!formData) {
    throw createError({ statusCode: 400, statusMessage: 'No form data received' })
  }

  let csvContent = ''
  let platform = ''
  let period = ''

  for (const part of formData) {
    if (part.name === 'file' && part.data) {
      csvContent = Buffer.from(part.data).toString('utf-8')
    } else if (part.name === 'platform' && part.data) {
      platform = Buffer.from(part.data).toString('utf-8').trim()
    } else if (part.name === 'period' && part.data) {
      period = Buffer.from(part.data).toString('utf-8').trim()
    }
  }

  if (!csvContent) {
    throw createError({ statusCode: 400, statusMessage: 'No CSV file provided' })
  }
  if (!platform) {
    throw createError({ statusCode: 400, statusMessage: 'Platform is required' })
  }
  if (!period || !/^\d{4}-\d{2}$/.test(period)) {
    throw createError({ statusCode: 400, statusMessage: 'Period must be in YYYY-MM format' })
  }

  const lines = csvContent
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0)

  if (lines.length < 2) {
    throw createError({ statusCode: 400, statusMessage: 'CSV must contain a header row and at least one data row' })
  }

  // Parse header to find column indices
  const headerLine = lines[0]
  if (!headerLine) {
    throw createError({ statusCode: 400, statusMessage: 'CSV must contain a header row' })
  }
  const header = parseCSVLine(headerLine).map(h => h.toLowerCase().replace(/\s+/g, '_'))
  const colIdx = {
    date: header.indexOf('date'),
    campaign_name: header.indexOf('campaign_name'),
    spend: header.indexOf('spend'),
    impressions: header.indexOf('impressions'),
    clicks: header.indexOf('clicks'),
    conversions: header.indexOf('conversions'),
  }

  if (colIdx.date === -1 || colIdx.campaign_name === -1 || colIdx.spend === -1) {
    throw createError({ statusCode: 400, statusMessage: 'CSV must have columns: date, campaign_name, spend' })
  }

  let imported = 0
  let skipped = 0
  const errors: string[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]
    if (!line) continue
    const fields = parseCSVLine(line)
    const row = {
      date: fields[colIdx.date] || '',
      campaignName: fields[colIdx.campaign_name] || '',
      spend: fields[colIdx.spend] || '0',
      impressions: colIdx.impressions >= 0 ? fields[colIdx.impressions] || '0' : '0',
      clicks: colIdx.clicks >= 0 ? fields[colIdx.clicks] || '0' : '0',
      conversions: colIdx.conversions >= 0 ? fields[colIdx.conversions] || '0' : '0',
    }

    // Validate row
    if (!row.date || !row.campaignName) {
      errors.push(`Row ${i + 1}: missing date or campaign_name`)
      skipped++
      continue
    }

    if (!/^\d{4}-\d{2}-\d{2}$/.test(row.date)) {
      errors.push(`Row ${i + 1}: invalid date format "${row.date}" (expected YYYY-MM-DD)`)
      skipped++
      continue
    }

    const spendNum = parseFloat(row.spend)
    if (isNaN(spendNum) || spendNum < 0) {
      errors.push(`Row ${i + 1}: invalid spend "${row.spend}"`)
      skipped++
      continue
    }

    const impressionsNum = parseInt(row.impressions) || 0
    const clicksNum = parseInt(row.clicks) || 0
    const conversionsNum = parseInt(row.conversions) || 0

    const campaignId = `csv_${platform}_${row.campaignName.replace(/\s+/g, '_').toLowerCase()}`

    try {
      // Upsert media_spend — aggregate at campaign+period level
      // For CSV import, we accumulate spend across daily rows into the campaign total
      const spendRow = await queryOne<{ id: string }>(
        `INSERT INTO media_spend (platform, campaign_name, campaign_id, period, actual_spend, budget_allocated, impressions, clicks, conversions, synced_at)
         VALUES ($1, $2, $3, $4, 0, 0, 0, 0, 0, NOW())
         ON CONFLICT (platform, campaign_id, period) WHERE connection_id IS NULL
         DO UPDATE SET synced_at = NOW()
         RETURNING id`,
        [platform, row.campaignName, campaignId, period]
      )

      if (!spendRow) {
        errors.push(`Row ${i + 1}: failed to upsert media_spend`)
        skipped++
        continue
      }

      // Upsert daily_spend
      await execute(
        `INSERT INTO daily_spend (media_spend_id, spend_date, spend, impressions, clicks, conversions)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (media_spend_id, spend_date)
         DO UPDATE SET spend = EXCLUDED.spend,
                       impressions = EXCLUDED.impressions,
                       clicks = EXCLUDED.clicks,
                       conversions = EXCLUDED.conversions`,
        [spendRow.id, row.date, spendNum, impressionsNum, clicksNum, conversionsNum]
      )

      // Update media_spend totals from daily aggregation
      await execute(
        `UPDATE media_spend
         SET actual_spend = (SELECT COALESCE(SUM(spend), 0) FROM daily_spend WHERE media_spend_id = $1),
             impressions = (SELECT COALESCE(SUM(impressions), 0) FROM daily_spend WHERE media_spend_id = $1),
             clicks = (SELECT COALESCE(SUM(clicks), 0) FROM daily_spend WHERE media_spend_id = $1),
             conversions = (SELECT COALESCE(SUM(conversions), 0) FROM daily_spend WHERE media_spend_id = $1)
         WHERE id = $1`,
        [spendRow.id]
      )

      imported++
    } catch (err: any) {
      errors.push(`Row ${i + 1}: ${err.message}`)
      skipped++
    }
  }

  return { imported, skipped, errors: errors.slice(0, 20) }
})
