import { createError } from 'h3'
import type { GodModeTransactionDb } from '~~/server/utils/godMode/transactionCoordinator'

export interface TheBriefProjectIdentity {
  clientId: string
  sourceHashTag: string
  tags: string[]
}

/** Import identity is explicit provenance, never inferred from an artwork name. */
export function readTheBriefProjectIdentity(clientId: unknown, tags: unknown): TheBriefProjectIdentity | null {
  const tagList = Array.isArray(tags) ? tags : []
  const isImport = tagList.includes('source:thebrief')
  const sourceTags = tagList.filter(tag => typeof tag === 'string' && tag.toLowerCase().startsWith('source-sha256'))
  if (!isImport && !sourceTags.length) return null
  if (!isImport || tagList.some(tag => typeof tag !== 'string') || sourceTags.length !== 1 || !/^source-sha256:[a-f0-9]{64}$/i.test(sourceTags[0])) {
    throw createError({ statusCode: 400, statusMessage: 'TheBrief imports require one valid source SHA-256 tag' })
  }
  if (typeof clientId !== 'string' || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(clientId)) {
    throw createError({ statusCode: 400, statusMessage: 'TheBrief imports require a valid client' })
  }
  const sourceHashTag = sourceTags[0].toLowerCase()
  return { clientId: clientId.toLowerCase(), sourceHashTag, tags: tagList.map(tag => tag === sourceTags[0] ? sourceHashTag : tag) }
}

/** Must run inside the project creation transaction, before its INSERT. */
export async function findExistingTheBriefProject(db: GodModeTransactionDb, identity: TheBriefProjectIdentity) {
  // The transaction-scoped lock also covers ordinary authenticated requests. It is held through commit/rollback.
  await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
    `banner-thebrief-import:${identity.clientId}:${identity.sourceHashTag}`
  ])
  const client = await db.query('SELECT id FROM agency_clients WHERE id = $1 FOR KEY SHARE', [identity.clientId])
  if (!client.rows.length) throw createError({ statusCode: 400, statusMessage: 'TheBrief import client does not exist' })
  const existing = await db.query(`
    SELECT id, name, client_id AS "clientId", canvas_data AS "canvasData",
      thumbnail_url AS "thumbnailUrl", status, tags, created_by AS "createdBy",
      created_at AS "createdAt", updated_at AS "updatedAt"
    FROM banner_projects
    WHERE client_id = $1 AND 'source:thebrief' = ANY(tags)
      AND EXISTS (SELECT 1 FROM unnest(tags) AS source_tag WHERE lower(source_tag) = $2)
    ORDER BY created_at ASC, id ASC
    LIMIT 1
  `, [identity.clientId, identity.sourceHashTag])
  return existing.rows[0]
}
