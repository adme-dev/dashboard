import { TemplatePreviewPointerSchema, templatePreviewHostname } from '../../../shared/pageStudio/templatePreview'
import type { DomainDatabase } from './domainAttachment'
import { stagingArtifactPrefix } from './stagingStore'
export async function resolveTemplatePreview(db: DomainDatabase, hostname: string) {
  if (!/^template-[a-f0-9]{32}\.xeroflow\.io$/.test(hostname)) return null
  const row = (await db.query(`SELECT version.id AS version_id,version.source_tenant_id,version.source_client_id,version.source_site_id,
    version.source_checkpoint_id,version.source_digest,version.code_content,preview.snapshot_id,preview.artifact_prefix,preview.manifest_digest
    FROM page_studio_template_previews preview JOIN page_studio_template_versions version ON version.id=preview.version_id
    JOIN page_studio_template_entries entry ON entry.id=version.template_id
    JOIN page_studio_template_version_status state ON state.version_id=version.id
    WHERE preview.hostname=$1 AND entry.withdrawn_at IS NULL AND state.withdrawn_at IS NULL`, [hostname])).rows[0]
  if (!row) return null
  const pointer = TemplatePreviewPointerSchema.parse({ kind: 'template-preview', versionId: row.version_id,
    scope: { tenantId: row.source_tenant_id, clientId: row.source_client_id, siteId: row.source_site_id },
    id: row.snapshot_id, checkpointId: row.source_checkpoint_id, digest: row.source_digest,
    ...(row.code_content ? { codeContent: row.code_content } : {}), artifactPrefix: row.artifact_prefix, manifestDigest: row.manifest_digest })
  if (hostname !== templatePreviewHostname(pointer.versionId) || pointer.artifactPrefix !== stagingArtifactPrefix(pointer.scope, pointer.id)) return null
  return pointer
}
