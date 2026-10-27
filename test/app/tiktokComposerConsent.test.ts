// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest'
import { createApp, h, Suspense, computed, watch, ref, nextTick } from 'vue'
import { emptyComposerState } from '~/composables/useSocialComposer'
const state=ref(emptyComposerState())
Object.assign(globalThis,{ computed,watch,ref,nextTick,$fetch:vi.fn(),useToast:()=>({add:vi.fn()}),useState:()=>state,
 useFetch:async()=>({data:ref({creator_nickname:'Exact creator',creator_username:'fixture',privacy_level_options:['SELF_ONLY']}),error:ref(null)}) })
const {default:Composer}=await import('~~/app/components/social-publishing/PostComposer.vue')
const {default:Consent}=await import('~~/app/components/social-publishing/TikTokConsent.vue')
async function flush(){for(let i=0;i<15;i++){await Promise.resolve();await nextTick()}}
describe('mounted parent composer consent',()=>{
 it.each(['hashtags','linkUrl','mediaUrls','options'])('I3 previews effective copy and invalidates consent on %s change',async field=>{
  state.value={...emptyComposerState(),id:'post-1',content:'Caption',platforms:['tiktok'],accountIds:['account'],mediaUrls:['https://media.test/a.jpg'],hashtags:['original'],linkUrl:'https://site.test/offer'}
  const host=document.createElement('div');document.body.append(host)
  const app=createApp({render:()=>h(Suspense,{}, {default:()=>h(Composer,{clientId:'client',accounts:[{id:'account',platform:'tiktok',is_active:true,platform_account_id:'creator'}]})})})
  app.component('SocialPublishingTikTokConsent',Consent)
  for(const name of ['UFormField','UButton','UAlert','UIcon','UBadge','USelectMenu','UTabs','UPopover','UCalendar','UModal','UTooltip','SocialPublishingBannerPicker','ChatEmojiPicker']) app.component(name,{template:'<div><slot/></div>'})
  for(const name of ['UInput','UTextarea','USelect'])app.component(name,{props:['modelValue'],template:'<input :value="modelValue" />'})
  app.component('UCheckbox',{props:['modelValue','label'],emits:['update:modelValue'],template:`<label><input type="checkbox" :checked="modelValue" @change="$emit('update:modelValue',$event.target.checked)"/>{{label}}</label>`})
  try{
   app.mount(host);await flush()
   expect(host.textContent).toContain('#original')
   expect(host.textContent).toContain('utm_campaign=post_post-1')
   const consent=[...host.querySelectorAll('label')].find(l=>l.textContent?.includes('Music Usage Confirmation'))!.querySelector('input')!
   consent.checked=true;consent.dispatchEvent(new Event('change',{bubbles:true}));await flush()
   expect(state.value.publishTargets.find(t=>t.platform==='tiktok')?.options?.consent).toBe(true)
   if(field==='hashtags') state.value.hashtags=['changed']
   if(field==='linkUrl') state.value.linkUrl='https://site.test/new'
   if(field==='mediaUrls') state.value.mediaUrls=['https://media.test/b.jpg']
   if(field==='options') state.value.publishTargets[0]!.options={...state.value.publishTargets[0]!.options,title:'New title'}
   await flush();expect(state.value.publishTargets.find(t=>t.platform==='tiktok')?.options?.consent).toBe(false)
   if(field==='hashtags')expect(host.textContent).toContain('#changed')
   if(field==='linkUrl')expect(host.textContent).toContain('https://site.test/new?utm_source=tiktok')
  }finally{app.unmount();host.remove()}
 })
})
