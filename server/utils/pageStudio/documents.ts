import { randomUUID } from 'node:crypto'

import type { PageStudioDocument } from '~~/shared/pageStudio/document'
import { queryOneFresh } from '~~/server/utils/db'
import { PageStudioSavedPagesSchema, type PageStudioSavedPages } from '~~/shared/pageStudio/savedPages'
import { loadPageStudioCheckpoint, type PageStudioCheckpointBucket } from '~~/server/utils/pageStudio/releaseCheckpoint'
import type { PageStudioQueryClient } from '~~/server/utils/pageStudio/sites'

export class PageStudioDocumentError extends Error {
  constructor(
    readonly code: 'DOCUMENT_CONFLICT' | 'PAGE_LIMIT_REACHED' | 'SITE_NOT_FOUND' | 'STUDIO_DOCUMENT_REQUIRED' | 'CHECKPOINT_UNAVAILABLE',
    readonly statusCode: number,
    message: string
  ) {
    super(message)
    this.name = 'PageStudioDocumentError'
  }
}

interface DocumentRow {
  client_id: string
  current_checkpoint_id: string | null
  checkpoint_digest: string | null
  checkpoint_object_key: string | null
  checkpoint_created_at: string | null
  document: PageStudioDocument | null
  name: string
  pages_per_site_limit: number
  revision: string | null
  route: string
  updated_at: string | null
}

export interface PageStudioDocumentState {
  id: string
  document: PageStudioDocument | null
  studio?: PageStudioSavedPages
  pageLimit: number
  revision: number
  site: {
    clientId: string
    id: string
    name: string
    route: string
  }
  updatedAt: string | null
}

export function defaultPageStudioDocument(siteName: string): PageStudioDocument {
  return {
    schemaVersion: 1,
    pages: [{
      id: randomUUID(),
      parentId: null,
      title: 'Home',
      slug: '',
      visibility: 'visible',
      seoTitle: siteName,
      seoDescription: `Welcome to ${siteName}.`,
      blocks: [{
        id: randomUUID(),
        type: 'hero',
        eyebrow: 'Welcome',
        heading: siteName,
        body: 'Build this page with reusable sections, then submit a version for review.',
        buttonLabel: 'Get started',
        buttonHref: '#contact',
        imageUrl: '',
        imageAlt: '',
        alignment: 'left',
        background: 'dark'
      }]
    }]
  }
}

function mapState(siteId: string, row: DocumentRow): PageStudioDocumentState {
  return {
    id: siteId,
    document: row.document ?? defaultPageStudioDocument(row.name),
    pageLimit: row.pages_per_site_limit,
    revision: Number(row.revision ?? 0),
    site: {
      clientId: row.client_id,
      id: siteId,
      name: row.name,
      route: row.route
    },
    updatedAt: row.updated_at
  }
}

const scopedDocumentSql = `
  SELECT site.client_id, site.name, site.route, site.current_checkpoint_id,
         checkpoint.digest AS checkpoint_digest, checkpoint.object_key AS checkpoint_object_key,
         checkpoint.created_at AS checkpoint_created_at,
         entitlement.pages_per_site_limit,
         draft.revision::text, draft.document, draft.updated_at
  FROM page_studio_sites site
  JOIN page_studio_entitlements entitlement
    ON entitlement.tenant_id = site.tenant_id
   AND entitlement.client_id = site.client_id
   AND entitlement.id = site.entitlement_id
  LEFT JOIN page_studio_documents draft
    ON draft.tenant_id = site.tenant_id
   AND draft.client_id = site.client_id
   AND draft.site_id = site.id
  LEFT JOIN page_studio_checkpoints checkpoint
    ON checkpoint.tenant_id = site.tenant_id
   AND checkpoint.client_id = site.client_id
   AND checkpoint.site_id = site.id
   AND checkpoint.id = site.current_checkpoint_id
  WHERE site.tenant_id = $1 AND site.id = $2 AND site.status <> 'archived'`

export async function getPageStudioDocument(
  tenantId: string,
  siteId: string,
  bucket?: PageStudioCheckpointBucket
): Promise<PageStudioDocumentState> {
  const row = await queryOneFresh<DocumentRow>(scopedDocumentSql, [tenantId, siteId])
  if (!row) throw new PageStudioDocumentError('SITE_NOT_FOUND', 404, 'Page Studio site not found')
  if (!row.current_checkpoint_id) return mapState(siteId, row)
  if (!bucket || !row.checkpoint_digest || !row.checkpoint_object_key) {
    throw new PageStudioDocumentError('CHECKPOINT_UNAVAILABLE', 503, 'The saved website could not be loaded. Please try again.')
  }
  const checkpoint = await loadPageStudioCheckpoint({
    scope: { tenantId, clientId: row.client_id, siteId },
    bucket,
    checkpointId: row.current_checkpoint_id,
    objectKey: row.checkpoint_object_key,
    digests: [row.checkpoint_digest]
  })
  const parsed = PageStudioSavedPagesSchema.safeParse(checkpoint.manifest)
  if (!parsed.success) {
    throw new PageStudioDocumentError('CHECKPOINT_UNAVAILABLE', 422, 'This saved website must be opened in Studio.')
  }
  return {
    id: siteId,
    document: null,
    studio: { checkpointId: checkpoint.checkpointId, pages: parsed.data.pages },
    pageLimit: row.pages_per_site_limit,
    revision: Number(row.revision ?? 0),
    site: { clientId: row.client_id, id: siteId, name: row.name, route: row.route },
    updatedAt: row.checkpoint_created_at
  }
}

export async function savePageStudioDocument(
  db: PageStudioQueryClient,
  input: {
    actorId: string
    document: PageStudioDocument
    expectedRevision: number
    siteId: string
    tenantId: string
  }
): Promise<PageStudioDocumentState> {
  const scoped = await db.query<DocumentRow>(`${scopedDocumentSql} FOR UPDATE OF site, entitlement`, [input.tenantId, input.siteId])
  const row = scoped.rows[0]
  if (!row) throw new PageStudioDocumentError('SITE_NOT_FOUND', 404, 'Page Studio site not found')
  requireDashboardDocument(row)
  if (input.document.pages.length > row.pages_per_site_limit) {
    throw new PageStudioDocumentError('PAGE_LIMIT_REACHED', 409, `This subscription allows ${row.pages_per_site_limit} pages per site`)
  }

  const currentRevision = Number(row.revision ?? 0)
  if (currentRevision !== input.expectedRevision) {
    throw new PageStudioDocumentError('DOCUMENT_CONFLICT', 409, 'This draft changed in another session. Refresh before saving again.')
  }
  const nextRevision = currentRevision + 1
  const saved = await db.query<{ document: PageStudioDocument, revision: string, updated_at: string }>(
    `INSERT INTO page_studio_documents (
       tenant_id, client_id, site_id, revision, document, updated_by
     ) VALUES ($1, $2, $3, $4, $5::jsonb, $6)
     ON CONFLICT (tenant_id, client_id, site_id) DO UPDATE
       SET revision = EXCLUDED.revision,
           document = EXCLUDED.document,
           updated_by = EXCLUDED.updated_by,
           updated_at = NOW()
     WHERE page_studio_documents.revision = $7
     RETURNING revision::text, document, updated_at`,
    [input.tenantId, row.client_id, input.siteId, nextRevision, JSON.stringify(input.document), input.actorId, currentRevision]
  )
  if (!saved.rows[0]) {
    throw new PageStudioDocumentError('DOCUMENT_CONFLICT', 409, 'This draft changed in another session. Refresh before saving again.')
  }

  await db.query(
    `UPDATE page_studio_sites SET updated_at = NOW()
     WHERE tenant_id = $1 AND client_id = $2 AND id = $3`,
    [input.tenantId, row.client_id, input.siteId]
  )
  await db.query(
    `INSERT INTO page_studio_audit_events (
       tenant_id, client_id, site_id, actor_id, actor_role, action,
       resource_type, resource_id, metadata
     ) VALUES ($1, $2, $3, $4, 'agency', 'document.saved', 'document', ($3::uuid)::text, $5::jsonb)`,
    [input.tenantId, row.client_id, input.siteId, input.actorId, JSON.stringify({ revision: nextRevision })]
  )

  return mapState(input.siteId, {
    ...row,
    document: saved.rows[0].document,
    revision: saved.rows[0].revision,
    updated_at: saved.rows[0].updated_at
  })
}

export async function replayPageStudioDocumentSave(
  db: PageStudioQueryClient,
  tenantId: string,
  siteId: string
): Promise<PageStudioDocumentState> {
  const row = await db.query<DocumentRow>(scopedDocumentSql, [tenantId, siteId])
  if (!row.rows[0]) throw new PageStudioDocumentError('SITE_NOT_FOUND', 404, 'Page Studio site not found')
  requireDashboardDocument(row.rows[0])
  return mapState(siteId, row.rows[0])
}

function requireDashboardDocument(row: DocumentRow) {
  if (row.current_checkpoint_id) {
    throw new PageStudioDocumentError('STUDIO_DOCUMENT_REQUIRED', 409, 'This website is edited in Studio. Reload Pages to see the saved website.')
  }
}
