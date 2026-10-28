import { readClientKpiTargets, replaceClientKpiTargets } from '~~/server/utils/clients/kpiTargets'
import { queryRowsFresh, transaction } from '~~/server/utils/db'
import { requireMarketingDepartment } from './departmentAuthority'
import { resolveMarketingReadScope, requireScopedClient } from './readScope'
import { departmentUtilityContracts } from './departmentUtilitySchemas'
import { claimExecution, claimOutcome, finishExecution, sha256, validExecutionIdentity, refuse, refusalOf } from './departmentExecutionLedger'
import { createQrCodeRecord } from '~~/server/utils/qr/codeCreation'
import { CreateQrSchema } from '~~/server/utils/qr/schemas'
import { shortUrl } from '~~/server/utils/qr/access'
import { validateDestinationUrl, isDestinationInvalid } from '~~/shared/qr/destination'
import { fail, ok, type ToolContext, type ToolResult } from '../toolContext'

function destination(value: string): URL {
  const parsed = validateDestinationUrl(value)

  if (isDestinationInvalid(parsed))
    refuse(parsed.reason, 'bad_args')

  const url = new URL((parsed as {
    url: string
  }).url)

  if (url.username || url.password)
    refuse('Credentials are not permitted in campaign URLs', 'bad_args')

  return url
}
function page<T extends {
  id: unknown
}>(rows: T[], limit: number) {
  const items = rows.slice(0, limit)
  return { items, nextCursor: rows.length > limit ? items.at(-1)?.id : null, storedOnly: true }
}
export async function executeDepartmentUtilityOperation(name: string, raw: unknown, ctx: ToolContext, key: string, digest: string): Promise<ToolResult> {
  try {
    const contract = departmentUtilityContracts.find(([n]) => n === name)

    if (!contract)
      return fail('Unknown campaign utility', 'not_found')

    const parsed = contract[1].safeParse(raw)

    if (!parsed.success)
      return fail('Invalid campaign utility arguments', 'bad_args')

    const args = parsed.data, write = contract[2]

    if (write && !validExecutionIdentity(key, digest))
      return fail('Verified request identity required', 'bad_args')

    const fresh = await requireMarketingDepartment(ctx, write)

    await requireScopedClient(await resolveMarketingReadScope(fresh), args.clientId)

    if (name.includes('_qr_') && !fresh.permissionGroups?.includes('QR_CODES'))
      return fail('QR permission required', 'forbidden')

    if (name === 'marketing_get_client_kpi_targets') {
      return ok({ clientId: args.clientId, ...await readClientKpiTargets({ query: async (sql, params) => ({ rows: await queryRowsFresh(sql, params) }) }, args.clientId), storedOnly: true })
    }

    if (name === 'marketing_set_client_kpi_targets') {
      const input = departmentUtilityContracts[6][1].parse(raw)
      return await transaction(async (db) => {
        await requireMarketingDepartment(fresh, true)
        const identity = { actorId: fresh.userId, key, digest, tool: name, clientId: input.clientId, inputHash: sha256(input), executor: 'local-transactional' as const }
        const claim = await claimExecution(db, identity)
        if (claim.kind !== 'fresh') return claimOutcome(claim)
        const saved = await replaceClientKpiTargets(db, input.clientId, input.targets, input.expectedRevision)
        const result = { clientId: input.clientId, count: saved.targets.length, revision: saved.revision, providerChanged: false }
        await finishExecution(db, identity, result)
        return ok(result)
      })
    }

    if (name === 'marketing_build_campaign_url') {
      const args = departmentUtilityContracts[2][1].parse(raw)

      const url = destination(args.url)

      for (const field of ['source', 'medium', 'campaign', 'content', 'term'] as const)
        if (args[field] !== undefined)
          url.searchParams.set(`utm_${field}`, args[field])

      return ok({ clientId: args.clientId, url: url.toString(), published: false })
    }

    if (name === 'marketing_list_lead_followups') {
      const args = departmentUtilityContracts[0][1].parse(raw)

      const rows = await queryRowsFresh<{
        id: string
      }>(`SELECT l.id,l.source,l.status,l.campaign_name,l.submitted_at,l.contacted_at,l.assigned_to,tm.name AS assignee_name
    FROM leads l JOIN agency_clients c ON c.id=l.client_id AND c.is_active = TRUE LEFT JOIN team_members tm ON tm.id=l.assigned_to
    WHERE l.client_id = $1 AND l.deleted_at IS NULL AND l.is_test = FALSE AND ($2::text IS NULL OR l.status=$2)
    AND ($3::uuid IS NULL OR l.id>$3) ORDER BY l.id LIMIT $4`, [args.clientId, args.status ?? null, args.afterId ?? null, args.limit + 1])

      return ok(page(rows, args.limit))
    }

    if (name === 'marketing_list_qr_codes') {
      const args = departmentUtilityContracts[1][1].parse(raw)

      const rows = await queryRowsFresh<{
        id: string
        code: string
      }>(`SELECT q.id,q.code,q.name,q.destination_url,q.is_active,q.scan_count,q.last_scanned_at,q.updated_at
    FROM qr_codes q JOIN agency_clients c ON c.id=q.client_id AND c.is_active = TRUE WHERE q.client_id=$1
    AND ($2::uuid IS NULL OR q.id>$2) ORDER BY q.id LIMIT $3`, [args.clientId, args.afterId ?? null, args.limit + 1])

      return ok(page(rows.map(r => ({ ...r, shortUrl: shortUrl(r.code) })), args.limit))
    }

    if (name === 'marketing_get_qr_metrics') {
      const args = departmentUtilityContracts[4][1].parse(raw)

      const rows = await queryRowsFresh<{
        day: string | null
        scans: number
        unique_devices: number
      }>(`SELECT to_char(s.scanned_at AT TIME ZONE 'Australia/Melbourne','YYYY-MM-DD') AS day,
    COUNT(s.id)::int AS scans,COUNT(DISTINCT s.ip_hash)::int AS unique_devices FROM qr_codes q
    JOIN agency_clients c ON c.id=q.client_id AND c.is_active=TRUE
    LEFT JOIN qr_scans s ON s.qr_code_id=q.id AND s.scanned_at>=NOW()-($3::int*INTERVAL '1 day')
    WHERE q.id=$1 AND q.client_id=$2 GROUP BY q.id,1 ORDER BY 1`, [args.qrCodeId, args.clientId, args.days])

      if (!rows.length)
        return fail('QR code unavailable for this client', 'not_found')

      return ok({ clientId: args.clientId, qrCodeId: args.qrCodeId, days: args.days, timezone: 'Australia/Melbourne', daily: rows.filter(row => row.day !== null), storedOnly: true, definition: 'Distinct hashed IPs are an approximate device count, not identified people.' })
    }

    const { ack: _ack, ...qrInput } = departmentUtilityContracts[3][1].parse(raw)

    const body = CreateQrSchema.parse(qrInput)

    body.destinationUrl = destination(body.destinationUrl).toString()

    return await transaction(async (db) => {
      const identity = { actorId: fresh.userId, key, digest, tool: name, clientId: body.clientId, inputHash: sha256(body), executor: 'local-transactional' as const }

      const claim = await claimExecution(db, identity)

      if (claim.kind !== 'fresh')
        return claimOutcome(claim)

      if (!(await db.query('SELECT id FROM agency_clients WHERE id=$1 AND is_active = TRUE FOR UPDATE', [body.clientId])).rows[0])
        refuse('Client no longer active', 'forbidden')

      const row = await createQrCodeRecord(db, body, fresh.userId)

      const result = { clientId: body.clientId, qrCodeId: String(row.id), shortUrl: shortUrl(String(row.code)), distributed: false }

      await finishExecution(db, identity, result)

      return ok(result)
    })
  } catch (error) {
    const status = (error as { statusCode?: number })?.statusCode
    if (status === 409) return fail('KPI targets changed; reload before saving', 'conflict')
    if (status === 404) return fail('Client or resource not found', 'not_found')
    if (status === 400) return fail('Invalid campaign utility arguments', 'bad_args')
    return refusalOf(error) ?? fail('Campaign utility unavailable or not permitted', 'unavailable')
  }
}
