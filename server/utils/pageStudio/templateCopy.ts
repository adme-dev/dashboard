import { createError } from 'h3'
import { z } from 'zod'
import { transactionWithoutRetry } from '~~/server/utils/db'
import { CodeContentBindingSchema, sameCodeContent, verifyCodePageImport } from '~~/shared/pageStudio/codeContent'
import { loadPageStudioCheckpoint, type PageStudioCheckpointBucket } from '~~/shared/pageStudio/checkpointReader'
import type { PageStudioQueryClient, PageStudioControlScope } from '~~/shared/pageStudio/controlTypes'
import { templateCopyEditorHostname } from '~~/shared/pageStudio/templateEditorHost'
import { PageStudioTemplateUseRequest, PageStudioTemplateUseSchema } from '~~/shared/pageStudio/templateCatalogue'
import { requireSelectedTemplate, assertTemplateActor, templateDenied, type TemplateActionPrincipal } from './templateActionAuthority'
import { readTemplateRegistrationSource, verifyTemplateRegistrationSource } from './templateRegistrationSource'
import { createPageStudioSite } from './sites'
import { commitPageStudioCheckpoint } from './controlStore'

const Packet = z.object({ checkpointId: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/),
  scope: z.object({ tenantId: z.string(),clientId: z.string().uuid(),siteId: z.string().uuid() }).strict(),
  digest: z.string().regex(/^[a-f0-9]{64}$/), etag: z.string().min(1).max(200),objectKey:z.string().min(1).max(1100),
  createdAt:z.string().datetime(),userId:z.string().min(1).max(128),codeContent:CodeContentBindingSchema.optional() }).strict()
interface CopyRow { id:string, actor_kind:string, actor_id:string, account_key:string, version_id:string, tenant_id:string,client_id:string,site_id:string,request_payload:unknown,base_checkpoint_id:string,checkpoint_id:string,state:'ready'|'preparing',created_at:string|Date }
interface Version { source_tenant_id:string,source_client_id:string,source_site_id:string,source_checkpoint_id:string,source_digest:string,code_content:unknown,format:string }
interface Entitlement { id:string,pages_per_site_limit:number,storage_bytes_limit:string|number,active_site_limit:number }
const unavailable = () => createError({statusCode:503,statusMessage:'Independent template copying is unavailable.'})
const conflict = () => createError({statusCode:409,statusMessage:'This template request conflicts with an earlier operation.'})

/** Browser input never selects source storage, destination scope, checkpoint IDs
 * or author identity. The private service prepares bytes; only native SQL accepts. */
export async function copyTemplateVersion(versionId:string, raw:unknown, context:{
  principal:TemplateActionPrincipal,env:Record<string,unknown>,reauthorize:()=>Promise<void>
}) {
  const input=PageStudioTemplateUseRequest.parse(raw),actor=context.principal.actor
  if (actor.kind!=='agency' && input.clientId) throw templateDenied()
  if (actor.kind==='agency' && !input.clientId) throw createError({statusCode:400,statusMessage:'Choose a destination client.'})
  const actorId=actor.kind==='customer'?actor.identityId:actor.userId
  const accountKey=actor.kind==='customer'?`customer:${actor.workspaceId}`:`${actor.kind}:${actor.tenantId}:${actor.kind==='portal'?actor.clientId:input.clientId}`
  const service=context.env.PAGE_STUDIO_TEMPLATE_SERVICE as {prepareTemplateCopy?:(input:unknown)=>Promise<unknown>}|undefined
  const bucket=context.env.PAGE_STUDIO_CHECKPOINTS as PageStudioCheckpointBucket|undefined
  if (!service?.prepareTemplateCopy || !bucket?.get) throw unavailable()
  const selected=async(db:PageStudioQueryClient)=>{
    await requireSelectedTemplate(db,context.principal,versionId,context.env,true)
    if(!(await db.query('SELECT version_id FROM page_studio_template_previews WHERE version_id=$1',[versionId])).rows.length)throw createError({statusCode:409,statusMessage:'The template preview must be published before this template can be used.'})
  }
  const source=await transactionWithoutRetry(async db=>{
    await selected(db)
    const version=(await db.query<Version>('SELECT * FROM page_studio_template_versions WHERE id=$1',[versionId])).rows[0]!
    if(version.format!=='code-pages') throw createError({statusCode:422,statusMessage:'This template format is not available for copying yet.'})
    return readTemplateRegistrationSource(db,{tenantId:version.source_tenant_id,clientId:version.source_client_id,siteId:version.source_site_id},version.source_checkpoint_id,version.source_digest)
  })
  const verifiedSource=await verifyTemplateRegistrationSource(source,bucket)
  await context.reauthorize()
  const destination=async(db:PageStudioQueryClient):Promise<{tenantId:string,clientId:string}>=>{
    await assertTemplateActor(db,context.principal,context.env,true)
    if(actor.kind!=='customer') return {tenantId:actor.tenantId,clientId:actor.kind==='portal'?actor.clientId:input.clientId!}
    const owner=(await db.query<{id:string}>(`SELECT id FROM page_studio_business_owners WHERE workspace_id=$1 AND agency_client_id IS NULL FOR SHARE`,[actor.workspaceId])).rows[0]
    if(!owner) throw templateDenied()
    return {tenantId:`studio-customer-${owner.id}`,clientId:owner.id}
  }
  const capacity=async(db:PageStudioQueryClient,scope:{tenantId:string,clientId:string},newSite:boolean)=>{
    const rows=(await db.query<Entitlement>(`SELECT id,pages_per_site_limit,storage_bytes_limit,active_site_limit FROM page_studio_entitlements
      WHERE tenant_id=$1 AND client_id=$2 AND status IN ('trial','active') AND effective_from<=clock_timestamp()
        AND (effective_until IS NULL OR effective_until>clock_timestamp())
        ${actor.kind==='portal'?'AND portal_creation_enabled=TRUE':''}
        ${actor.kind==='customer'?"AND status='active' AND plan_key<>'customer_preview_v1' AND plan_metadata->'publishingEnabled'='true'::jsonb AND plan_metadata->'managedBy'='\"platform\"'::jsonb AND plan_metadata->'allowedModules' @> '[\"business-content\"]'::jsonb":''} FOR UPDATE`,[scope.tenantId,scope.clientId])).rows
    if(rows.length!==1) throw templateDenied()
    const entitlement=rows[0]!
    if(verifiedSource.pageCount>entitlement.pages_per_site_limit || verifiedSource.totalBytes>Number(entitlement.storage_bytes_limit)) throw createError({statusCode:409,statusMessage:'The template exceeds this account’s page or storage allowance.'})
    const count=Number((await db.query<{count:string}>(`SELECT COUNT(*)::text AS count FROM page_studio_sites WHERE tenant_id=$1 AND client_id=$2 AND status<>'archived'`,[scope.tenantId,scope.clientId])).rows[0]!.count)
    if(count+(newSite?1:0)>entitlement.active_site_limit) throw createError({statusCode:409,statusMessage:'This account has reached its website limit.'})
    return entitlement
  }
  const reserved=await transactionWithoutRetry(async db=>{
    await selected(db)
    const scope=await destination(db)
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,0))',[`template-copy:${input.requestId}`])
    const prior=(await db.query<CopyRow>('SELECT * FROM page_studio_template_copies WHERE id=$1 FOR UPDATE',[input.requestId])).rows[0]
    if(prior){
      if(prior.actor_kind!==actor.kind||prior.actor_id!==actorId||prior.account_key!==accountKey||prior.version_id!==versionId||!sameCodeContent(prior.request_payload,input))throw conflict()
      const currentEntitlement=await capacity(db,scope,false)
      const site=(await db.query(`SELECT id FROM page_studio_sites WHERE id=$1 AND tenant_id=$2 AND client_id=$3 AND status<>'archived' AND entitlement_id=$4 FOR SHARE`,[prior.site_id,scope.tenantId,scope.clientId,currentEntitlement.id])).rows[0]
      if(!site)throw templateDenied()
      await selected(db)
      return prior
    }
    const entitlement=await capacity(db,scope,true)
    let siteId:string
    if(actor.kind==='customer'){
      siteId=(await db.query<{id:string}>(`INSERT INTO page_studio_sites(tenant_id,client_id,entitlement_id,name,route,starter_version,status,delivery_mode)
        VALUES($1,$2,$3,$4,$5,$6,'draft','static') RETURNING id`,[scope.tenantId,scope.clientId,entitlement.id,input.name,input.route,`template:${versionId}`])).rows[0]!.id
    }else{
      const site=await createPageStudioSite({actorId,actorRole:actor.kind==='agency'?'agency':'client',...scope,name:input.name,route:input.route,starterVersion:`template:${versionId}`,...(actor.kind==='portal'?{portalUserId:actorId}:{})},{runTransaction:work=>work(db)})
      siteId=site.id
    }
    const row=(await db.query<CopyRow>(`INSERT INTO page_studio_template_copies(id,actor_kind,actor_id,account_key,version_id,tenant_id,client_id,site_id,request_payload,base_checkpoint_id,checkpoint_id)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11) RETURNING *`,[input.requestId,actor.kind,actorId,accountKey,versionId,scope.tenantId,scope.clientId,siteId,JSON.stringify(input),`template_base_${input.requestId}`,`template_copy_${input.requestId}`])).rows[0]!
    await selected(db)
    return row
  })
  const result=(status:'preparing'|'ready')=>PageStudioTemplateUseSchema.parse({requestId:input.requestId,versionId,siteId:reserved.site_id,status})
  const scope:PageStudioControlScope={tenantId:reserved.tenant_id,clientId:reserved.client_id,siteId:reserved.site_id}
  const ensureEditor=async()=>{
    const management=context.env.PAGE_STUDIO_MANAGEMENT as {ensureTemplateCopyEditorHost?:(input:unknown)=>Promise<unknown>}|undefined
    if(!management?.ensureTemplateCopyEditorHost)throw unavailable()
    const host=z.object({ready:z.literal(true),hostname:z.string()}).strict().parse(await management.ensureTemplateCopyEditorHost(scope))
    if(host.hostname!==await templateCopyEditorHostname(scope))throw conflict()
    await context.reauthorize()
    await transactionWithoutRetry(async db=>{
      await selected(db)
      if(!sameCodeContent(await destination(db),{tenantId:scope.tenantId,clientId:scope.clientId}))throw templateDenied()
      const entitlement=await capacity(db,scope,false)
      if(!(await db.query(`SELECT id FROM page_studio_sites WHERE id=$1 AND tenant_id=$2 AND client_id=$3
        AND entitlement_id=$4 AND status IN ('draft','active') FOR SHARE`,[scope.siteId,scope.tenantId,scope.clientId,entitlement.id])).rows.length)throw templateDenied()
    })
  }
  if(reserved.state==='ready'){await ensureEditor();return result('ready')}
  const createdAt=new Date(reserved.created_at).toISOString()
  await context.reauthorize()
  const prepared=z.object({base:Packet,checkpoint:Packet}).strict().parse(await service.prepareTemplateCopy({
    source:{scope:source.checkpoint.scope,checkpointId:source.checkpoint.checkpointId,digest:source.checkpoint.digest,codeContent:source.checkpoint.codeContent},
    destination:{scope,expectedCheckpointId:null},operation:{baseCheckpointId:reserved.base_checkpoint_id,checkpointId:reserved.checkpoint_id,operationId:input.requestId,createdAt},actorId
  }))
  for(const packet of [prepared.base,prepared.checkpoint]) if(!sameCodeContent(packet.scope,scope)||packet.userId!==actorId||packet.createdAt!==createdAt)throw conflict()
  if(prepared.base.checkpointId!==reserved.base_checkpoint_id||prepared.base.codeContent||prepared.checkpoint.checkpointId!==reserved.checkpoint_id
    ||prepared.checkpoint.codeContent?.operationId!==input.requestId||prepared.checkpoint.codeContent?.contentDigest!==verifiedSource.codeContent.contentDigest)throw conflict()
  await loadPageStudioCheckpoint({bucket,scope,checkpointId:prepared.base.checkpointId,objectKey:prepared.base.objectKey,digests:[prepared.base.digest]})
  const verified=await verifyCodePageImport({checkpoint:prepared.checkpoint,expectedCheckpointId:prepared.base.checkpointId},bucket)
  if(verified.inventoryDigest!==verifiedSource.inventoryDigest||verified.totalBytes!==verifiedSource.totalBytes)throw conflict()
  await context.reauthorize()
  const accepted=await transactionWithoutRetry(async db=>{
    const authorize=async()=>{
      await selected(db)
      if(!sameCodeContent(await destination(db),{tenantId:scope.tenantId,clientId:scope.clientId}))throw templateDenied()
      const entitlement=await capacity(db,scope,false)
      if(!(await db.query(`SELECT id FROM page_studio_sites WHERE id=$1 AND tenant_id=$2 AND client_id=$3
        AND entitlement_id=$4 AND status IN ('draft','active') AND delivery_mode='static' FOR SHARE`,[scope.siteId,scope.tenantId,scope.clientId,entitlement.id])).rows.length)throw templateDenied()
    }
    await authorize()
    const retained=(await db.query<CopyRow>('SELECT * FROM page_studio_template_copies WHERE id=$1 FOR UPDATE',[input.requestId])).rows[0]
    if(!retained||retained.site_id!==scope.siteId||retained.actor_id!==actorId)throw conflict()
    if(retained.state==='ready'){await authorize();return result('ready')}
    const dependencies={runTransaction:<T>(work:(db:PageStudioQueryClient)=>Promise<T>)=>work(db),authorize}
    await commitPageStudioCheckpoint({checkpoint:prepared.base,expectedCheckpointId:null},dependencies)
    const committed=await commitPageStudioCheckpoint({checkpoint:prepared.checkpoint,expectedCheckpointId:prepared.base.checkpointId},{...dependencies,verifiedCodeContent:verified})
    if(!committed.isCurrent)throw conflict()
    await db.query("UPDATE page_studio_template_copies SET state='ready' WHERE id=$1",[input.requestId])
    await authorize()
    return result('ready')
  })
  await ensureEditor()
  return accepted
}
