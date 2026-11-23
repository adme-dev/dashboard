import { createError, defineEventHandler, getQuery, setHeader } from 'h3'
import { z } from 'zod'
import { requireAuth } from '~~/server/utils/auth'
import { queryRowsFresh } from '~~/server/utils/db'
import { resolveGodModeAuthority, isActiveGodModeAuthority } from '~~/server/utils/godMode/authority'
import { requireBannerClientAccess } from '~~/server/utils/banner/clientAccess'
import { bannerImportRecovery, type ImportRecoveryRow } from '~~/server/utils/banner/importRecovery'

const input = z.object({ clientId: z.uuid(), hashes: z.string().max(9750).transform(value => value.split(',')).pipe(z.array(z.string().regex(/^[a-f0-9]{64}$/)).min(1).max(150)) })

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  if (!isActiveGodModeAuthority(await resolveGodModeAuthority(event, user.id), user.id)) throw createError({ statusCode: 403, statusMessage: 'Audited owner upload recovery is required' })
  const parsed = input.safeParse(getQuery(event))
  if (!parsed.success) throw createError({ statusCode: 400, statusMessage: 'Invalid import recovery request' })
  const { clientId, hashes } = parsed.data
  await requireBannerClientAccess(event, clientId)
  setHeader(event, 'Cache-Control', 'private, no-store')
  const keys = [...new Set(hashes)].map(hash => `thebrief-asset:${clientId}:${hash}`)
  // Reject a key owned by another actor as well as incomplete or uncertain outcomes.
  // The actual upload coordinator revalidates digests and performs any lease recovery.
  const rows = await queryRowsFresh<ImportRecoveryRow>(`SELECT ledger.actor_user_id AS "actorId", ledger.state, ledger.execution_phase AS phase,
    ledger.updated_at < NOW() - INTERVAL '2 minutes' AS stale, ledger.result_reference AS "resultReference", ledger.execution_metadata AS metadata,
    asset.id AS "assetId", asset.client_id AS "assetClientId", asset.uploaded_by AS "assetUploadedBy"
    FROM god_mode_execution_ledger ledger LEFT JOIN banner_assets asset ON asset.id::text = ledger.result_reference
    WHERE ledger.channel = 'application' AND ledger.route_or_tool = 'POST /api/agency/banner-studio/assets/upload' AND ledger.idempotency_key = ANY($1::text[])`, [keys])
  return bannerImportRecovery(rows, user.id, clientId, keys.length)
})
