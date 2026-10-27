// @vitest-environment happy-dom
// Real mounted composer -> API composable -> serialized HTTP -> Nitro route -> SQL/review/adapter.
import { createServer, request as httpRequest } from 'node:http'
import { createApp as createH3App, createRouter, defineEventHandler, toNodeListener, getQuery, getRouterParam, readBody, createError } from 'h3'
import { createApp, h, Suspense, computed, watch, ref, nextTick, onMounted } from 'vue'
import { beforeAll, beforeEach, afterAll, describe, it, expect, vi } from 'vitest'
import { guardedSocialTask3Pool, resetSocialTask3Schema, socialTask3DbModule } from '../helpers/socialRevisionPostgres'
import { emptyComposerState, useSocialComposer } from '~/composables/useSocialComposer'
import { useSocialPublishing } from '~/composables/useSocialPublishing'
const f=vi.hoisted(()=>({db:null as any,request:vi.fn(),etag:'exact-bytes',selectedClient:null as any}))
vi.mock('~~/server/utils/db',()=>Object.fromEntries(['execute','queryOne','queryRows','queryOneFresh','queryRowsFresh','transaction','transactionOnce'].map(k=>[k,(...args:any[])=>f.db[k](...args)])))
vi.mock('~~/server/utils/auth',()=>({requireAuth:async()=>({id:S,role:'creative',permissionGroups:['CREATIVE']}),requireRole:async()=>({id:S,role:'creative',permissionGroups:['CREATIVE']})}))
vi.mock('~/composables/useSocialPublishingClient',()=>({useSocialPublishingClient:()=>({clientId:f.selectedClient})}))
vi.mock('~~/server/utils/notifications',()=>({createBulkNotifications:async()=>{}}))
vi.mock('~~/server/utils/social-providers/http',async original=>({...await original<any>(),providerFetch:(...args:any[])=>f.request(...args),providerFetchRaw:(...args:any[])=>f.request(...args)}))
// Explicit dormant eligibility override, shared production registry remains false.
vi.mock('~~/server/utils/socialPublishing/platformReadiness',async original=>({...await original<any>(),productionReadyPublishPlatformsError:()=>null,assertProductionReadyPublishPlatforms:()=>{}}))
// Dormant TikTok transport exercise only; production provider eligibility remains blocked.
vi.mock('~~/shared/socialCapabilityReadiness',async original=>{const actual=await original<any>();return {...actual,providerOperationSupport:(platform:string,operation:string)=>platform==='tiktok' && operation==='organic_publish'?{state:'available',reason:'Explicit dormant test override'}:actual.providerOperationSupport(platform,operation)}})
const C='0a000000-0000-4000-8000-00000000000a',S='51000000-0000-4000-8000-000000000001',ADMIN='ad000000-0000-4000-8000-000000000001',A='fa000000-0000-4000-8000-00000000000a',IMG='aa000000-0000-4000-8000-000000000001'
const dsn=process.env.SOCIAL_TASK5_TEST_DSN??''
const state=ref(emptyComposerState())
const creator={creator_nickname:'Exact creator',creator_username:'fixture',privacy_level_options:['SELF_ONLY'],comment_disabled:false,duet_disabled:true,stitch_disabled:true,max_video_post_duration_sec:300}
const env=()=>({MCP_MARKETING_STAFF_GRANTS:JSON.stringify({[S]:['social_draft']}),APP_URL:'https://fixture.example',RENDER_LINK_SECRET:'private-fixture-signing-secret-at-least-32-bytes',MEDIA_BUCKET:{head:async()=>({size:10,etag:f.etag}),get:async()=>({size:10,etag:f.etag,body:new Response('0123456789').body})}})
const event=()=>({context:{cloudflare:{env:env()}}} as any)
let pool:ReturnType<typeof guardedSocialTask3Pool>,server:ReturnType<typeof createServer>,port:number
async function http(path:string,options:any={}) {
 return await new Promise<any>((resolve,reject)=>{
  const request=httpRequest({host:'127.0.0.1',port,path,method:options.method??'GET',headers:{'content-type':'application/json'}},response=>{
   let text='';response.on('data',chunk=>text+=chunk);response.on('end',()=>{
    const data=JSON.parse(text);if(response.statusCode!>=400)reject(Object.assign(new Error(data.statusMessage??data.message),{data}));else resolve(data)
   })
  });request.on('error',reject);request.end(options.body===undefined?undefined:JSON.stringify(options.body))
 })
}
async function flush(){for(let i=0;i<15;i++){await Promise.resolve();await nextTick()}}
async function mounted(accounts:any[]=[{id:A,platform:'tiktok',is_active:true,platform_account_id:'creator'}], discovery?:ReturnType<typeof ref<any>>, page?:any){
 const {default:Composer}=await import('~~/app/components/social-publishing/PostComposer.vue')
 const {default:Consent}=await import('~~/app/components/social-publishing/TikTokConsent.vue')
 const host=document.createElement('div');document.body.append(host)
 const app=createApp({render:()=>h(Suspense,{}, {default:()=>h(page ?? Composer,page ? {} : {clientId:C,accounts,accountsResolved:true,...discovery?.value})})})
 app.component('SocialPublishingTikTokConsent',Consent)
 app.component('SocialPublishingPostComposer',Composer)
 app.component('SocialPublishingShell',{template:'<div><slot/></div>'})
 app.component('SocialPublishingPlatformPreviewPane',{template:'<div />'})
 for(const name of ['UFormField','UIcon','UBadge','UTabs','UPopover','UCalendar','UModal','UTooltip','ChatEmojiPicker'])app.component(name,{template:'<div><slot/></div>'})
 for(const name of ['UInput','UTextarea','USelect'])app.component(name,{props:['modelValue'],template:'<input :value="modelValue" />'})
 app.component('UAlert',{props:['title','description'],template:'<aside>{{title}} {{description}}</aside>'})
 app.component('UButton',{props:['label','disabled','loading'],template:'<button :disabled="disabled || loading"><slot/>{{label}}</button>'})
 app.component('UCheckbox',{props:['modelValue','label','disabled'],emits:['update:modelValue'],template:`<label><input type="checkbox" :disabled="disabled" :checked="modelValue" @change="$emit('update:modelValue',$event.target.checked)"/>{{label}}</label>`})
 // Interactive model adapter exercises the production USelectMenu v-model/listener and watcher paths.
 app.component('USelectMenu',{props:{modelValue:null,items:Array,multiple:Boolean,placeholder:String},emits:['update:modelValue'],
  template:`<select :multiple="multiple" :aria-label="placeholder" @change="$emit('update:modelValue',multiple ? Array.from($event.target.selectedOptions).map(o=>o.value) : $event.target.value)"><option v-for="item in items" :key="item.value" :value="item.value" :selected="multiple ? modelValue?.includes(item.value) : modelValue===item.value">{{item.label}}</option></select>`})
 app.mount(host);await flush()
 return {host,select:async(label:string,values:string[],index=0)=>{
  const select=host.querySelectorAll<HTMLSelectElement>(`select[aria-label="${label}"]`)[index]!
  expect(select).toBeTruthy()
  for(const option of select.options)option.selected=values.includes(option.value)
  select.dispatchEvent(new Event('change',{bubbles:true}));await flush()
 },close:()=>{app.unmount();host.remove()},consent:async(value:boolean)=>{
  const input=[...host.querySelectorAll('label')].find(l=>l.textContent?.includes('Music Usage Confirmation'))!.querySelector('input')!
  expect(input.disabled).toBe(false);input.checked=value;input.dispatchEvent(new Event('change',{bubbles:true}));await flush()
 }}
}
describe.skipIf(!dsn)('R2 mounted composer HTTP save/review/dispatch',()=>{
 beforeAll(async()=>{
  pool=guardedSocialTask3Pool(dsn);f.db=socialTask3DbModule(pool)
  Object.assign(globalThis,{computed,watch,ref,nextTick,defineEventHandler,getQuery,getRouterParam,readBody,createError,$fetch:http,useState:()=>state,useToast:()=>({add:vi.fn()}),useFetch:async()=>({data:ref(creator),error:ref(null)})})
  const app=createH3App(),router=createRouter(),base='/api/agency/social/publishing/posts'
  app.use(defineEventHandler(e=>{e.context.cloudflare={env:env()} as any}))
  router.get(`${base}/:id`,(await import('~~/server/api/agency/social/publishing/posts/[id]/index.get')).default)
  router.patch(`${base}/:id`,(await import('~~/server/api/agency/social/publishing/posts/[id]/index.patch')).default)
  router.post(`${base}/:id/request-approval`,(await import('~~/server/api/agency/social/publishing/posts/[id]/request-approval.post')).default)
  router.post(base,(await import('~~/server/api/agency/social/publishing/posts/index.post')).default)
  app.use(router);server=createServer(toNodeListener(app));await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));port=(server.address() as any).port
 })
 afterAll(async()=>{await pool?.end();if(server)await new Promise<void>((resolve,reject)=>server.close(e=>e?reject(e):resolve()))})
 beforeEach(async()=>{
  await resetSocialTask3Schema(pool);f.etag='exact-bytes'
  await pool.query("INSERT INTO agency_clients VALUES($1,'Client',TRUE)",[C])
  await pool.query("INSERT INTO team_members(id,role,user_role) VALUES($1,'creative','creative'),($2,'admin','admin')",[S,ADMIN])
  await pool.query('INSERT INTO client_team_assignments VALUES($1,$2)',[S,C])
  await pool.query("INSERT INTO social_accounts(id,client_id,platform,platform_account_id,refresh_token,token_expires_at,metadata) VALUES($1,$2,'tiktok','creator','refresh',NOW()+INTERVAL '1 day',$3::jsonb)",[A,C,JSON.stringify({grantedScopes:['video.publish'],refreshTokenExpiresAt:'2099-01-01T00:00:00Z'})])
  await pool.query("INSERT INTO banner_assets(id,name,mime_type,file_size,r2_key,url,uploaded_by,client_id) VALUES($1,'Photo','image/jpeg',10,$2,'unused',$3,$4)",[IMG,`banner-assets/${S}/${IMG}/photo.jpg`,S,C])
  f.request.mockReset().mockImplementation(async(url:string)=>url.includes('creator_info')?{data:creator,error:{code:'ok'}}:{data:{publish_id:'v_pub_file~exact'},error:{code:'ok'}})
  state.value=emptyComposerState();Object.assign(globalThis,{$fetch:http})
 })
 const FB='fb000000-0000-4000-8000-000000000001',FB2='fb000000-0000-4000-8000-000000000002',LI='11000000-0000-4000-8000-000000000001'
 async function supportedAccounts(){
  for(const [id,platform,providerId,scope] of [[FB,'facebook','page-one','pages_manage_posts'],[FB2,'facebook','page-two','pages_manage_posts'],[LI,'linkedin','12345','w_organization_social']]) {
   await pool.query("INSERT INTO social_accounts(id,client_id,platform,platform_account_id,token_expires_at,metadata) VALUES($1,$2,$3,$4,NOW()+INTERVAL '30 days',$5::jsonb)",[id,C,platform,providerId,JSON.stringify({grantedScopes:[scope]})])
  }
  return [{id:FB,platform:'facebook',is_active:true,platform_account_id:'page-one'},{id:FB2,platform:'facebook',is_active:true,platform_account_id:'page-two'},{id:LI,platform:'linkedin',is_active:true,platform_account_id:'12345'},{id:A,platform:'tiktok',is_active:true,platform_account_id:'creator'}]
 }
 it.each(['add-linkedin','replace-facebook','remove-facebook','mixed-tiktok-facebook'])('selected targets survive mounted controls, HTTP, review and outgoing dispatch: %s',async mode=>{
  const accounts=await supportedAccounts(),api=useSocialPublishing()
  const {createSocialPostDraft}=await import('~~/server/utils/socialPublishing/drafts')
  const initialTargets=mode==='remove-facebook'?[{platform:'facebook',accountId:FB},{platform:'linkedin',accountId:LI}]:[{platform:'facebook',accountId:FB}]
  const id=mode==='mixed-tiktok-facebook'?await load():(await f.db.transaction((db:any)=>createSocialPostDraft({actorId:S,clientIds:[C],event:event()},{clientId:C,content:'Selected destinations',targets:initialTargets},db))).postId
  useSocialComposer().loadFromPost(await api.getPost(id))
  const ui=await mounted(accounts)
  try {
   if(mode==='add-linkedin')await ui.select('Select networks',['facebook','linkedin'])
   if(mode==='replace-facebook')await ui.select('Select account',[FB2])
   if(mode==='remove-facebook')await ui.select('Select networks',['linkedin'])
   if(mode==='mixed-tiktok-facebook') {
    // TikTok remains dormant; preserve the loaded target while using the real account control for Facebook.
    state.value.platforms=['tiktok','facebook'];await flush();await ui.select('Select account',[FB],1);await ui.consent(true)
   }
   const expected=mode==='add-linkedin'?[FB,LI]:mode==='replace-facebook'?[FB2]:mode==='remove-facebook'?[LI]:[A,FB]
   expect(state.value.accountIds.slice().sort()).toEqual(expected.slice().sort())
   const selected=[...ui.host.querySelectorAll<HTMLSelectElement>('select[aria-label="Select account"]')].flatMap(select=>[...select.selectedOptions].map(o=>o.value))
   expect(selected.sort()).toEqual(expected.slice().sort())
   const body=useSocialComposer().toBody(C)
   await api.updatePost(id,body)
   const saved=(await pool.query('SELECT * FROM social_posts WHERE id=$1',[id])).rows[0]
   expect(saved.publish_targets.map((t:any)=>t.accountId).sort()).toEqual(expected.slice().sort())
   expect(saved.account_ids.slice().sort()).toEqual(expected.slice().sort())
   const submitted=await api.requestApproval(id) as any
   const revision=(await pool.query('SELECT * FROM social_post_revisions WHERE id=$1',[submitted.revisionId])).rows[0]
   expect(revision.snapshot.targets.map((t:any)=>t.accountId).sort()).toEqual(expected.slice().sort())
   await f.db.transaction((db:any)=>(import('~~/server/utils/socialPublishing/revisions')).then(m=>m.reviewSocialPostRevision(db,{event:event(),postId:id,revisionId:submitted.revisionId,reviewerId:ADMIN,decision:'approved'})))
   f.request.mockReset().mockImplementation(async(url:string)=>{
    if(url.includes('creator_info'))return {data:creator,error:{code:'ok'}}
    if(url.includes('/content/init/'))return {data:{publish_id:'v_pub_file~exact'},error:{code:'ok'}}
    if(url.endsWith('/rest/posts'))return {headers:new Headers({'x-restli-id':'urn:li:share:fixture'})}
    if(/\/(feed|photos)$/.test(url))return {id:'page_post'}
    throw new Error('Unexpected fixture transport '+url)
   })
   await(await import('~~/server/utils/socialPublishing/dispatch')).claimAndPublishSocialPost({event:event(),postId:id,revisionId:submitted.revisionId,clientId:C,claimStatuses:['approved'],source:'manual'})
   const outgoing=f.request.mock.calls.flatMap(([url,options])=>url.endsWith('/rest/posts')?[LI]:url.endsWith('/page-one/feed')||url.endsWith('/page-one/photos')?[FB]:url.endsWith('/page-two/feed')||url.endsWith('/page-two/photos')?[FB2]:url.includes('/content/init/')?[A]:[])
   expect([...new Set(outgoing)].sort()).toEqual(expected.slice().sort())
   const receipts=(await pool.query('SELECT a.account_id FROM social_post_target_receipts r JOIN social_post_target_attempts a ON a.id=r.attempt_id WHERE a.revision_id=$1',[submitted.revisionId])).rows
   expect(receipts.map((r:any)=>r.account_id).sort()).toEqual(expected.slice().sort())
  }finally{ui.close()}
 })
 it.each(['pending','failed-then-retry'])('preserves saved Instagram story through delayed account discovery: %s',async mode=>{
  const IG='16000000-0000-4000-8000-000000000001'
  await pool.query("INSERT INTO social_accounts(id,client_id,platform,platform_account_id,token_expires_at,metadata) VALUES($1,$2,'instagram','ig-story',NOW()+INTERVAL '30 days',$3::jsonb)",[IG,C,JSON.stringify({grantedScopes:['instagram_content_publish']})])
  const {createSocialPostDraft}=await import('~~/server/utils/socialPublishing/drafts')
  const id=(await f.db.transaction((db:any)=>createSocialPostDraft({actorId:S,clientIds:[C],event:event()},{clientId:C,content:'Saved story',targets:[{platform:'instagram',accountId:IG,options:{type:'story'}}],mediaAssets:[{kind:'banner_asset',id:IMG}]},db))).postId
  const api=useSocialPublishing()
  useSocialComposer().loadFromPost(await api.getPost(id))
  const discovery=ref({accounts:[] as any[],accountsLoading:true,accountsResolved:false}),ui=await mounted([],discovery)
  const original=[{platform:'instagram',accountId:IG,options:{type:'story'}}]
  try {
   expect(state.value.publishTargets).toEqual(original)
   expect(state.value.accountIds).toEqual([IG])
   if(mode==='failed-then-retry') {
    discovery.value={accounts:[],accountsLoading:false,accountsResolved:false};await flush()
    expect(state.value.publishTargets).toEqual(original)
    discovery.value.accountsLoading=true;await flush()
   }
   discovery.value={accounts:[{id:IG,platform:'instagram',is_active:true,platform_account_id:'ig-story'}],accountsLoading:false,accountsResolved:true};await flush()
   expect(state.value.publishTargets).toEqual(original)
   await api.updatePost(id,useSocialComposer().toBody(C))
   const saved=(await pool.query('SELECT publish_targets FROM social_posts WHERE id=$1',[id])).rows[0]
   expect(saved.publish_targets).toEqual(original)
   const submitted=await api.requestApproval(id) as any
   const revision=(await pool.query('SELECT * FROM social_post_revisions WHERE id=$1',[submitted.revisionId])).rows[0]
   expect(revision.snapshot.targets).toEqual(original)
   const {resolveEffectiveSocialTargets}=await import('~~/shared/socialEffectivePayload')
   expect(resolveEffectiveSocialTargets(revision.snapshot,revision.snapshot.media)[0]?.options.type).toBe('story')
   await f.db.transaction((db:any)=>(import('~~/server/utils/socialPublishing/revisions')).then(m=>m.reviewSocialPostRevision(db,{event:event(),postId:id,revisionId:submitted.revisionId,reviewerId:ADMIN,decision:'approved'})))
   f.request.mockReset().mockImplementation(async(url:string)=>url.endsWith('/media')?{id:'container'}:url.endsWith('/media_publish')?{id:'story-post'}:{permalink:'https://fixture.example/story'})
   await(await import('~~/server/utils/socialPublishing/dispatch')).claimAndPublishSocialPost({event:event(),postId:id,revisionId:submitted.revisionId,clientId:C,claimStatuses:['approved'],source:'manual'})
   expect(f.request.mock.calls.find(([url])=>url.endsWith('/ig-story/media'))?.[1].body.media_type).toBe('STORIES')
  }finally{ui.close()}
 })
 it.each(['retry-success','stale-client-response'])('page reports only successful current-client account discovery: %s',async mode=>{
  const {default:Page}=await import('~~/app/pages/agency/social/publishing/compose.vue')
  const calls:Array<{clientId:string,resolve:(value:any)=>void,reject:(error:any)=>void}>=[]
  f.selectedClient=ref(C)
  Object.assign(globalThis,{onMounted,definePageMeta:()=>{},useRoute:()=>({query:{}}),useRouter:()=>({replace:async()=>{}}),$fetch:(path:string,options:any={})=>{
   if(path==='/api/agency/clients')return Promise.resolve([{id:C,name:'Client'}])
   if(path.endsWith('/accounts'))return new Promise((resolve,reject)=>calls.push({clientId:options.query.clientId,resolve,reject}))
   return http(path,options)
  }})
  const ui=await mounted([],undefined,Page)
  try {
   state.value={...emptyComposerState(),id:'saved',platforms:['instagram'],accountIds:['exact'],publishTargets:[{platform:'instagram',accountId:'exact',options:{type:'story'}}]};await flush()
   expect(calls).toHaveLength(1)
   calls[0]!.reject(new Error('discovery failed'));await flush()
   expect(ui.host.textContent).toContain('Could not load publishing accounts')
   expect(state.value.publishTargets[0]?.options?.type).toBe('story')
   const retry=[...ui.host.querySelectorAll('button')].find(b=>b.textContent?.includes('Retry accounts'))!
   retry.click();await flush();expect(calls).toHaveLength(2)
   if(mode==='retry-success') {
    calls[1]!.resolve([{id:'exact',platform:'instagram',is_active:true,platform_account_id:'ig-story'}]);await flush()
    expect(state.value.publishTargets[0]?.options?.type).toBe('story')
    expect(ui.host.textContent).not.toContain('Could not load publishing accounts')
   }else{
    f.selectedClient.value='other-client';await flush();expect(calls).toHaveLength(3)
    calls[2]!.resolve([]);await flush()
    expect(state.value.publishTargets).toEqual([])
    calls[1]!.resolve([{id:'exact',platform:'instagram',is_active:true,platform_account_id:'ig-story'}]);await flush()
    expect(state.value.accountIds).toEqual([])
    expect(state.value.publishTargets).toEqual([])
   }
  }finally{ui.close();Object.assign(globalThis,{$fetch:http})}
 })
 async function load(){
  const {createSocialPostDraft}=await import('~~/server/utils/socialPublishing/drafts')
  const draft=await f.db.transaction((db:any)=>createSocialPostDraft({actorId:S,clientIds:[C],event:event()},{clientId:C,content:'Caption',hashtags:['original'],linkUrl:'https://site.test/offer',targets:[{platform:'tiktok',accountId:A,options:{privacy_level:'SELF_ONLY',title:'Target title',consent:true}}],mediaAssets:[{kind:'banner_asset',id:IMG}]},db))
  useSocialComposer().loadFromPost(await useSocialPublishing().getPost(draft.postId))
  return draft.postId as string
 }
 it.each(['hashtags','linkUrl','withdrawal','unchanged'])('attests authoritative target through HTTP PATCH and submission: %s',async mode=>{
  const id=await load(),ui=await mounted(),api=useSocialPublishing()
  try {
   if(mode==='hashtags')state.value.hashtags=['renewed']
   if(mode==='linkUrl')state.value.linkUrl='https://site.test/renewed'
   await flush()
   if(mode!=='unchanged')await ui.consent(mode!=='withdrawal')
   await api.updatePost(id,useSocialComposer().toBody(C))
   const saved=(await pool.query('SELECT * FROM social_posts WHERE id=$1',[id])).rows[0]
   expect(saved.publish_targets[0].options.consent).toBe(mode!=='withdrawal')
   if(mode==='withdrawal') {await expect(api.requestApproval(id)).rejects.toThrow(/consent/i);return}
   const submitted=await api.requestApproval(id) as any
   const revision=(await pool.query('SELECT * FROM social_post_revisions WHERE id=$1',[submitted.revisionId])).rows[0]
   const {resolveEffectiveSocialTargets}=await import('~~/shared/socialEffectivePayload')
   const effective=resolveEffectiveSocialTargets(revision.snapshot,revision.snapshot.media)[0]!
   expect(ui.host.textContent).toContain(effective.content)
   expect(saved.publish_targets[0].options.title).toBe('Target title')
   expect(ui.host.querySelector('img')?.src).toContain('/api/public/social-media/')
   await f.db.transaction((db:any)=>(import('~~/server/utils/socialPublishing/revisions')).then(m=>m.reviewSocialPostRevision(db,{event:event(),postId:id,revisionId:submitted.revisionId,reviewerId:ADMIN,decision:'approved'})))
   await(await import('~~/server/utils/socialPublishing/dispatch')).claimAndPublishSocialPost({event:event(),postId:id,revisionId:submitted.revisionId,clientId:C,claimStatuses:['approved'],source:'manual'})
   const init=f.request.mock.calls.find(([url])=>url.includes('/content/init/'))
   expect(init?.[1].body.post_info.description).toBe(effective.content)
   expect(init?.[1].body.post_info.title).toBe('Target title')
  }finally{ui.close()}
 })
 it('browser POST then PATCH delivers the same effective copy the mounted preview attested',async()=>{
  state.value={...emptyComposerState(),content:'Browser caption',platforms:['tiktok'],accountIds:[A],mediaUrls:['https://fixture.example/photo.jpg'],hashtags:['browser'],linkUrl:'https://site.test/browser',customizePerNetwork:true,platformOverrides:{tiktok:{options:{privacy_level:'SELF_ONLY',title:'Browser title'}}}}
  const api=useSocialPublishing(),row=await api.createPost(useSocialComposer().toBody(C))
  useSocialComposer().loadFromPost(row)
  const ui=await mounted()
  try {
   await ui.consent(true)
   await api.updatePost(row.id,useSocialComposer().toBody(C))
   const {resolveEffectiveSocialTargets}=await import('~~/shared/socialEffectivePayload')
   const effective=resolveEffectiveSocialTargets({postId:row.id,content:state.value.content,hashtags:state.value.hashtags,linkUrl:state.value.linkUrl,platformOverrides:state.value.platformOverrides,targets:[{platform:'tiktok',accountId:A}]},[{mediaType:'image'}])[0]!
   expect(ui.host.textContent).toContain(effective.content)
   await(await import('~~/server/utils/socialPublishing/dispatch')).claimAndPublishSocialPost({event:event(),postId:row.id,clientId:C,claimStatuses:['draft'],source:'manual'})
   const init=f.request.mock.calls.find(([url])=>url.includes('/content/init/'))
   expect(init?.[1].body.post_info.description).toBe(effective.content)
  }finally{ui.close()}
 })
 it.each(['copy','account','media'])('legacy save cannot reuse attestation after %s drift',async mode=>{
  state.value={...emptyComposerState(),content:'Browser caption',platforms:['tiktok'],accountIds:[A],mediaUrls:['https://fixture.example/photo.jpg'],customizePerNetwork:true,platformOverrides:{tiktok:{options:{privacy_level:'SELF_ONLY'}}}}
  const api=useSocialPublishing(),row=await api.createPost(useSocialComposer().toBody(C))
  useSocialComposer().loadFromPost(row)
  const ui=await mounted()
  try {await ui.consent(true);await api.updatePost(row.id,useSocialComposer().toBody(C))}finally{ui.close()}
  if(mode==='copy')await api.updatePost(row.id,{hashtags:['unseen']})
  if(mode==='media')await api.updatePost(row.id,{mediaUrls:['https://fixture.example/other.jpg']})
  if(mode==='account')await pool.query("UPDATE social_accounts SET platform_account_id='replacement'")
  f.request.mockClear()
  const result=await(await import('~~/server/utils/socialPublishing/dispatch')).claimAndPublishSocialPost({event:event(),postId:row.id,clientId:C,claimStatuses:['draft'],source:'manual'})
  expect(result.status).toBe('failed')
  expect(f.request).not.toHaveBeenCalled()
 })
 it('reload with replaced media clears stale checked consent before interaction',async()=>{
  const id=await load();f.etag='replacement-bytes'
  useSocialComposer().loadFromPost(await useSocialPublishing().getPost(id))
  const ui=await mounted()
  try {
   const checkbox=[...ui.host.querySelectorAll('label')].find(l=>l.textContent?.includes('Music Usage Confirmation'))!.querySelector('input')!
   expect(checkbox.checked).toBe(false)
  }finally{ui.close()}
 })
 it.each(['bytes','account'])('cannot renew a preview replaced before HTTP save: %s',async mode=>{
  const id=await load(),ui=await mounted(),api=useSocialPublishing()
  try {
   state.value.hashtags=['renewed'];await flush();await ui.consent(true)
   if(mode==='bytes')f.etag='replacement-bytes'
   else await pool.query("UPDATE social_accounts SET platform_account_id='replacement'")
   await api.updatePost(id,useSocialComposer().toBody(C));f.request.mockClear()
   await expect(api.requestApproval(id)).rejects.toThrow(/consent/i)
   expect(f.request).not.toHaveBeenCalled()
  }finally{ui.close()}
 })
 it('a boolean echoed through HTTP PATCH cannot renew changed consent',async()=>{
  const id=await load(),api=useSocialPublishing()
  state.value.hashtags=['unattested']
  const body=useSocialComposer().toBody(C)
  body.platformOverrides={tiktok:{options:{consent:true}}}
  await api.updatePost(id,body)
  await expect(api.requestApproval(id)).rejects.toThrow(/consent/i)
 })
})
