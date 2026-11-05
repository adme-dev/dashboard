import { TemplatePreviewPointerSchema } from '../../../shared/pageStudio/templatePreview'
import { sameCodeContent } from '../../../shared/pageStudio/codeContent'
import type { DomainTransaction } from './domainAttachment'
import { cloudflareTemplatePreviewProvider } from './templateEditorProvider'
import { stagingArtifactPrefix } from './stagingStore'

/** Private service only. Exact retained version/snapshot authority is checked
 * before and after provider I/O; this allocates a host, never publishes content. */
export async function ensureTemplatePreviewHost(input: unknown, env: Record<string, unknown>, transaction: DomainTransaction) {
  const pointer = TemplatePreviewPointerSchema.parse(input)
  const unavailable = () => new Error('Template preview hostname is unavailable')
  if (env.PAGE_STUDIO_RELEASE_ENVIRONMENT !== 'production'
    || pointer.artifactPrefix !== stagingArtifactPrefix(pointer.scope, pointer.id)) throw unavailable()
  const retained = () => transaction(async db => {
    const row = (await db.query(`SELECT version.code_content, deployment.code_content AS deployment_code_content
      FROM page_studio_template_versions version
      JOIN page_studio_template_entries entry ON entry.id=version.template_id
      JOIN page_studio_template_version_status state ON state.version_id=version.id
      JOIN page_studio_staging_deployments deployment ON deployment.id=$2
        AND deployment.tenant_id=version.source_tenant_id AND deployment.client_id=version.source_client_id
        AND deployment.site_id=version.source_site_id AND deployment.checkpoint_id=version.source_checkpoint_id
        AND deployment.checkpoint_digest=version.source_digest AND deployment.state='succeeded'
      WHERE version.id=$1 AND version.source_tenant_id=$3 AND version.source_client_id=$4
        AND version.source_site_id=$5 AND version.source_checkpoint_id=$6 AND version.source_digest=$7
        AND entry.owner_tenant_id=$3 AND entry.withdrawn_at IS NULL AND state.withdrawn_at IS NULL
        AND deployment.artifact_prefix=$8 AND deployment.artifact_manifest_digest=$9
      FOR SHARE OF version,entry,state,deployment`, [pointer.versionId, pointer.id, pointer.scope.tenantId,
      pointer.scope.clientId, pointer.scope.siteId, pointer.checkpointId, pointer.digest, pointer.artifactPrefix, pointer.manifestDigest])).rows[0]
    if (!row || !sameCodeContent(row.code_content ?? undefined, pointer.codeContent)
      || !sameCodeContent(row.deployment_code_content ?? undefined, pointer.codeContent)) throw unavailable()
  })
  await retained()
  const domain = await cloudflareTemplatePreviewProvider({
    accountId: String(env.PAGE_STUDIO_CLOUDFLARE_ACCOUNT_ID ?? ''),
    zoneId: String(env.PAGE_STUDIO_CLOUDFLARE_ZONE_ID ?? ''),
    apiToken: String(env.PAGE_STUDIO_CLOUDFLARE_API_TOKEN ?? '')
  }).attach(pointer.versionId)
  await retained()
  return { hostname: domain.hostname }
}
