import { createError, getRouterParam, readBody, setHeader, type H3Event } from 'h3'
import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { sameCodeContent, verifyCodePageImport } from '~~/shared/pageStudio/codeContent'
import type { PageStudioCheckpointBucket } from '~~/shared/pageStudio/checkpointReader'
import type { PageStudioQueryClient } from '~~/shared/pageStudio/controlTypes'
import { readCustomerSession, readCustomerSetup } from './customerSignup'
import { customerSessionToken, guardCustomerRequest, limitCustomerRequest } from './customerSignupHttp'
import { resolveCustomerWorkspaceAccess } from './customerWorkspaces'
import { customerEditorBrowserConfiguration } from './customerEditorLaunchHttp'
import { customerDestinationGuard } from './customerActivation'
import { readCustomerEditorAuthority } from './customerEditorAuthority'
import { issueCustomerEditorHandoff } from './customerEditorHandoff'
import { readTemplateRegistrationSource } from './templateRegistrationSource'
import { templateCopyEditorHostname } from '~~/shared/pageStudio/templateEditorHost'
import { digestPortalSessionToken } from '~~/server/utils/portalSession'
const denied=()=>createError({statusCode:403,statusMessage:'This copied website is not available to this account.'})
async function customer(db:PageStudioQueryClient,token:string){
  const run=<T>(work:(db:PageStudioQueryClient)=>Promise<T>)=>work(db)
  const user=await readCustomerSession(token,run), setup=await readCustomerSetup(token,run)
  if(!setup.workspaceId)throw denied()
  const access=await resolveCustomerWorkspaceAccess({workspaceId:setup.workspaceId,identityId:user.identityId},run)
  if(access.legacyBinding)throw denied()
  return {identityId:user.identityId,workspaceId:setup.workspaceId,role:access.role}
}
export async function customerTemplateCopiesHandler(event:H3Event){
  guardCustomerRequest(event,'GET')
  setHeader(event,'cache-control','private, no-store')
  const token=customerSessionToken(event)
  return transactionWithoutRetry(async db=>{
    const actor=await customer(db,token)
    const rows=(await db.query<{siteId:string,name:string,requestId:string,versionId:string,status:'preparing'|'ready',actorId:string}>(`SELECT site.id AS "siteId",site.name,copy.id AS "requestId",copy.version_id AS "versionId",copy.state AS status,copy.actor_id AS "actorId"
      FROM page_studio_template_copies copy JOIN page_studio_business_owners owner ON owner.workspace_id=$1
      JOIN page_studio_sites site ON site.id=copy.site_id AND site.client_id=owner.id AND site.tenant_id='studio-customer-'||owner.id::text
      WHERE copy.account_key='customer:'||$1::text AND copy.actor_kind='customer' AND (copy.state='ready' OR (copy.state='preparing' AND copy.actor_id=$2))
        AND copy.client_id=site.client_id AND copy.tenant_id=site.tenant_id AND owner.agency_client_id IS NULL
        AND site.status IN ('draft','active') ORDER BY copy.created_at DESC,copy.id LIMIT 50`,[actor.workspaceId,actor.identityId])).rows
    if(!sameCodeContent(actor,await customer(db,token)))throw denied()
    return {items:rows.map(({actorId,...row})=>({...row,canOpen:actor.role==='owner'&&row.status==='ready',canResume:actor.role==='owner'&&row.status==='preparing'&&actorId===actor.identityId}))}
  })
}
/** Explicit selected-copy handoff, with no setup/site pointer mutation. */
export async function customerTemplateEditorHandler(event:H3Event){
  guardCustomerRequest(event,'POST')
  setHeader(event,'referrer-policy','no-referrer')
  const token=customerSessionToken(event), siteId=z.string().uuid().parse(getRouterParam(event,'siteId'))
  z.object({}).strict().parse(await readBody(event))
  await limitCustomerRequest(event,`template-editor:${await digestPortalSessionToken(token)}`,10)
  const env=event.context.cloudflare?.env??{},configuration=customerEditorBrowserConfiguration(event)
  const bucket=env.PAGE_STUDIO_CHECKPOINTS as PageStudioCheckpointBucket|undefined
  if(configuration?.environment!=='production'||!bucket?.get)throw denied()
  const assertWorkspace=customerDestinationGuard(env)
  const loginHash=await digestPortalSessionToken(token)
  const snapshot=async(db:PageStudioQueryClient)=>{
    const actor=await customer(db,token)
    if(actor.role!=='owner')throw denied()
    assertWorkspace(actor.workspaceId)
    const row=(await db.query<{entitlement_id:string,current_checkpoint_id:string}>(`SELECT site.entitlement_id,site.current_checkpoint_id
      FROM page_studio_template_copies copy JOIN page_studio_sites site ON site.id=copy.site_id
      WHERE copy.site_id=$1 AND copy.account_key='customer:'||$2::text AND copy.actor_kind='customer'
        AND copy.state='ready' AND copy.tenant_id=site.tenant_id AND copy.client_id=site.client_id
        AND site.status IN ('draft','active') AND site.delivery_mode='static' FOR SHARE OF copy,site`,[siteId,actor.workspaceId])).rows[0]
    if(!row?.current_checkpoint_id)throw denied()
    const authority=await readCustomerEditorAuthority(db,{environment:'production',entitlement_id:row.entitlement_id,site_id:siteId,login_session_hash:loginHash,purpose:'editor'})
    if(authority.identityId!==actor.identityId||authority.owned.workspaceId!==actor.workspaceId)throw denied()
    const scope=authority.owned.scope
    const checkpoint=(await db.query<{digest:string}>('SELECT digest FROM page_studio_checkpoints WHERE tenant_id=$1 AND client_id=$2 AND site_id=$3 AND id=$4',[scope.tenantId,scope.clientId,siteId,row.current_checkpoint_id])).rows[0]
    if(!checkpoint)throw denied()
    const source=await readTemplateRegistrationSource(db,{tenantId:scope.tenantId,clientId:scope.clientId,siteId},row.current_checkpoint_id,checkpoint.digest)
    return {actor,source,entitlementId:row.entitlement_id}
  }
  const before=await transactionWithoutRetry(snapshot)
  await verifyCodePageImport(before.source,bucket)
  const management=env.PAGE_STUDIO_MANAGEMENT as {ensureTemplateCopyEditorHost?:(input:unknown)=>Promise<unknown>}|undefined
  if(!management?.ensureTemplateCopyEditorHost)throw createError({statusCode:503,statusMessage:'The copied website editor is being prepared.'})
  const host=z.object({ready:z.literal(true),hostname:z.string()}).strict().parse(await management.ensureTemplateCopyEditorHost(before.source.checkpoint.scope))
  if(host.hostname!==await templateCopyEditorHostname(before.source.checkpoint.scope))throw denied()
  return transactionWithoutRetry(async db=>{
    if(!sameCodeContent(before,await snapshot(db)))throw createError({statusCode:409,statusMessage:'This website changed. Open it again.'})
    return issueCustomerEditorHandoff(token,configuration,{selectedCopySiteId:siteId,assertWorkspace,runTransaction:work=>work(db)})
  })
}
