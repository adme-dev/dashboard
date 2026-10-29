import { describe, expect, it } from 'vitest'
import { createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import EdmBlockRenderer from '~~/app/components/email/builder/EdmBlockRenderer.vue'
import { MODERN_EDM_STARTER_TEMPLATES, MODERN_EDM_SECTION_PRESETS } from '~~/app/utils/edmModernPresets'
import { buildStarterTemplateDocument } from '~~/app/utils/edmPresets'
import { renderTemplateDocumentLocally } from '~~/workers/email-rendering/src/render/document'
import { buildCampaignPreflight } from '~~/server/utils/email-marketing/campaignSend'
const identity = (html:string) => buildCampaignPreflight({campaign:{subject:'Campaign',from_email:'news@example.com',body_html:html},toSend:1,sendingConfigured:true,senderDomainAuthenticated:true}).checks.find(c=>c.code==='footer_identity')?.status
describe('modern starter readiness',()=>{
 it('blocks all unfinished sender placeholders even when product copy contains numbers and street-like words',()=>{
  for(const starter of MODERN_EDM_STARTER_TEMPLATES) expect(identity(renderTemplateDocumentLocally(buildStarterTemplateDocument(starter.id))),starter.id).toBe('blocked')
 })
 it('ignores conditional metadata and decodes entities when checking real postal identity',()=>{
  expect(identity('<!--[if mso]><xml>96</xml><![endif]--><p>Drive to a better place &#8203;</p>')).toBe('blocked')
  expect(identity('<p>Example Studio · 12 Example Street, Melbourne VIC &#51;&#48;&#48;&#48;, Australia.</p>')).toBe('pass')
 })
 it('uses plain feature presentation consistently in new editor modules and delivery',async()=>{
  const row=MODERN_EDM_SECTION_PRESETS.find(s=>s.id==='modern-wellness-features')!.blocks.find(b=>b.type==='feature-grid')!
  expect(row.data.props?.cardStyle).toBe('plain')
  const app=createSSRApp({render:()=>h(EdmBlockRenderer,{type:row.type,props:row.data.props,style:row.data.style})});app.component('UIcon',{render:()=>h('span')})
  const preview=await renderToString(app)
  expect(preview).toContain('background-color:transparent')
  expect(preview).toContain('font-size:16px')
  expect(preview).toContain('font-size:14px')
  expect(preview).not.toContain('1px solid #e5e7eb')
 })
})
