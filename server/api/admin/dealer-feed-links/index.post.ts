import { requireRole } from '~~/server/utils/auth'
import { rowToDealerLinkRecord, upsertDealerLink } from '~~/server/utils/feeds/dealerLinkStore'
import { executeGodModeDealerFeedLinkUpsert } from '~~/server/utils/feeds/godModeMutations'
import { resolveDealerFeedOrganization } from '~~/server/utils/feeds/organizationResolver'
import { cloudflareRuntimeEnv } from '~~/server/utils/feeds/serverContext'

function queryOne(db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> }) {
  return async <T = unknown>(sql: string, params: unknown[] = []): Promise<T | null> => {
    const result = await db.query(sql, params)
    return (result.rows[0] as T | undefined) ?? null
  }
}

export default defineEventHandler(async (event) => {
  const user = await requireRole(event, ['admin', 'owner'])
  const body = await readBody(event)

  try {
    const result = await executeGodModeDealerFeedLinkUpsert(
      event,
      async (db) => {
        const transactionalQueryOne = queryOne(db)
        const externalOrgId = await resolveDealerFeedOrganization({
          clientId: body?.clientId,
          actingUserEmail: user.email || user.id,
          externalOrgId: body?.externalOrgId,
          sellerRefs: body?.sellerRefs,
          platforms: body?.platforms
        }, {
          queryOne: transactionalQueryOne,
          runtimeEnv: cloudflareRuntimeEnv(event)
        })

        const link = await upsertDealerLink({
          clientId: body?.clientId,
          providerId: body?.providerId,
          externalOrgId,
          sellerRefs: body?.sellerRefs,
          defaultFeedIds: body?.defaultFeedIds,
          status: body?.status
        }, { queryOne: transactionalQueryOne, actorId: user.id })
        return { id: link.id, link }
      },
      async (db, resultReference) => {
        const result = await db.query(
          `SELECT l.id, l.client_id, c.name AS client_name, l.provider_id, l.external_org_id,
                  l.seller_refs, l.default_feed_ids, l.status, l.created_at, l.updated_at
             FROM client_feed_links l
             LEFT JOIN agency_clients c ON c.id = l.client_id
            WHERE l.id = $1`,
          [resultReference]
        )
        if (!result.rows[0]) throw new Error('Replayed dealer feed link no longer exists')
        const link = rowToDealerLinkRecord(result.rows[0])
        return { id: link.id, link }
      }
    )

    return { ok: true, link: result.link }
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Failed to upsert dealer feed link'
    const statusCode = /required|not found/i.test(message) ? 400 : 500
    if (statusCode >= 500) console.error('[dealer-feed-links] upsert failed:', error)
    throw createError({ statusCode, statusMessage: message })
  }
})
