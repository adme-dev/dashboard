import { TemplateEditorScopeSchema } from '../../../shared/pageStudio/templateEditorHost'
import type { DomainTransaction } from './domainAttachment'
import { cloudflareTemplateEditorProvider } from './templateEditorProvider'
/** Private service only; callers independently retain original browser authority.
 * Resources are limited to an accepted native copy and its exact derived host. */
export async function ensureTemplateCopyEditorHost(input:unknown,env:Record<string,unknown>,transaction:DomainTransaction){
  const scope=TemplateEditorScopeSchema.parse(input)
  if(env.PAGE_STUDIO_RELEASE_ENVIRONMENT!=='production')throw new Error('Template editor host unavailable')
  const retained=()=>transaction(async db=>{
    const row=(await db.query(`SELECT site.id FROM page_studio_template_copies copy
      JOIN page_studio_sites site ON site.id=copy.site_id AND site.client_id=copy.client_id AND site.tenant_id=copy.tenant_id
      JOIN page_studio_entitlements plan ON plan.id=site.entitlement_id AND plan.client_id=site.client_id AND plan.tenant_id=site.tenant_id
      WHERE copy.tenant_id=$1 AND copy.client_id=$2 AND copy.site_id=$3 AND copy.state='ready'
        AND site.status IN ('draft','active') AND site.delivery_mode='static'
        AND plan.status IN ('trial','active') AND plan.effective_from<=clock_timestamp()
        AND (plan.effective_until IS NULL OR plan.effective_until>clock_timestamp()) FOR SHARE OF copy,site,plan`,[scope.tenantId,scope.clientId,scope.siteId])).rows[0]
    if(!row)throw new Error('Template editor host unavailable')
  })
  await retained()
  const domain=await cloudflareTemplateEditorProvider({accountId:String(env.PAGE_STUDIO_CLOUDFLARE_ACCOUNT_ID??''),zoneId:String(env.PAGE_STUDIO_CLOUDFLARE_ZONE_ID??''),apiToken:String(env.PAGE_STUDIO_CLOUDFLARE_API_TOKEN??'')}).attach(scope)
  // An allocated certificate is not proof of HTTPS. This fixed unauthenticated
  // method response comes from the Sandbox session exchange before any content.
  const response=await fetch(`https://${domain.hostname}/__xeroflow/session`,{redirect:'manual',signal:AbortSignal.timeout(10000)})
  await response.body?.cancel()
  if(response.status!==405)throw new Error('Template editor HTTPS is not ready')
  await retained()
  return {ready:true as const,hostname:domain.hostname}
}
