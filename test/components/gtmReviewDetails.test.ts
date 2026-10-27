import { describe, it, expect } from 'vitest'
import { createSSRApp, defineComponent, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import Review from '../../app/components/marketing/GtmReviewDetails.vue'

async function render(review: any) {
  const app = createSSRApp(Review, { review })
  app.component('UButton', defineComponent({ props: ['to'], setup: (p, { slots }) => () => h('a', { href: p.to }, slots.default?.()) }))
  app.component('UAlert', defineComponent({ props: ['title','description'], setup: p => () => h('div', `${p.title}: ${p.description}`) }))
  return renderToString(app)
}
describe('exact GTM review rendering', () => {
  it.each(['publish','rollback'])('shows pending %s target, fingerprints, source link and full replacement changes', async action => {
    const html = await render({ action, base: { path: 'versions/3', fingerprint: 'base-fp', configuration: { tag: [{name:'Previous'}] } }, target: { path: 'versions/4', fingerprint: 'target-fp', configuration: { tag: [{name:'Reviewed'}] } }, sourceProposalId:'source-123',sourceProposalHref:'/agency/marketing/reviews/gtm#proposal-source-123', changes:[{action:'update',name:'Google measurement',before:{tagId:'G-BEFORE'},after:{tagId:'G-AFTER'}}],validation:'Compilation unavailable',cost:'Cost unavailable' })
    for(const text of ['versions/3','base-fp','versions/4','target-fp','source-123','Google measurement','G-BEFORE','G-AFTER','Compilation unavailable','Cost unavailable','Complete version replacement configuration']) expect(html).toContain(text)
    expect(html).toContain('href="/agency/marketing/reviews/gtm#proposal-source-123"')
  })
  it('shows safe installation configuration before approval and separate publication requirement', async () => {
    const html=await render({action:'installation',base:{path:'versions/3',fingerprint:'base-fp'},target:null,installation:{siteName:'Example site',collectorOrigin:'https://collector.example.test',spa:true},installationHash:'payload-sha',changes:[{action:'install',name:'Example site',before:null,after:{scriptUrl:'https://collector.example.test/track.js',writeKeyHash:'key-sha'}}],validation:'Unavailable',cost:'Unavailable'})
    for(const text of ['Example site','https://collector.example.test','Single-page navigation: Enabled','payload-sha','key-sha','separate publication review required']) expect(html).toContain(text)
  })
  it('requires a new proposal when exact evidence is missing', async()=>{
    expect(await render(null)).toContain('Prepare a new proposal before approving')
  })
})
