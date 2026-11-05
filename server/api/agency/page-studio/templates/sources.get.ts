import { createError, defineEventHandler, setHeader } from 'h3'
import { z } from 'zod'
import { queryRowsFresh } from '~~/server/utils/db'
import { templateActorAuthorizer } from '~~/server/utils/pageStudio/templateCatalogueHttp'
export default defineEventHandler(async event=>{
  setHeader(event,'Cache-Control','private, no-store')
  const authorize=templateActorAuthorizer(event,'agency','PAGE_STUDIO_PUBLISH'),actor=await authorize()
  if(actor.kind!=='agency')throw createError({statusCode:403})
  let approved:Array<{siteId:string,slug:string}>
  try{approved=z.array(z.object({siteId:z.string().uuid(),slug:z.string().regex(/^[a-z0-9][a-z0-9-]{0,79}$/)}).strict()).max(50).parse(JSON.parse(String(event.context.cloudflare?.env?.PAGE_STUDIO_TEMPLATE_SOURCES??'[]')))}catch{throw createError({statusCode:503})}
  const read=()=>queryRowsFresh<{siteId:string,name:string}>('SELECT id AS "siteId",name FROM page_studio_sites WHERE tenant_id=$1 AND id=ANY($2::uuid[]) AND status<>\'archived\' ORDER BY name',[actor.tenantId,approved.map(source=>source.siteId)])
  await read()
  if(JSON.stringify(await authorize())!==JSON.stringify(actor))throw createError({statusCode:403})
  return {items:(await read()).map(site=>({...site,slug:approved.find(source=>source.siteId===site.siteId)!.slug}))}
})
