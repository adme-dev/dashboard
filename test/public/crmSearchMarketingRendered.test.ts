import { readFileSync } from 'node:fs'
import { computed, createSSRApp, h } from 'vue'
import { renderToString } from 'vue/server-renderer'
import { describe, expect, it, vi } from 'vitest'
import {
  CRM_SEARCH_MARKETING_CLAIMS,
  CRM_SEARCH_MARKETING_COPY
} from '../../app/utils/marketingClaimManifest'

const read = (path: string) => readFileSync(path, 'utf8')
type MarketingClaim = typeof CRM_SEARCH_MARKETING_CLAIMS.claims[number]
type DynamicMarketingClaim = MarketingClaim & { routeNeedle: string }

const dynamicFeatureClaims = () => CRM_SEARCH_MARKETING_CLAIMS.claims
  .filter(claim => claim.sourcePath === 'app/pages/features/[slug].vue') as readonly DynamicMarketingClaim[]

interface CapturedSeo {
  title?: string
  description?: string
  ogTitle?: string
  ogDescription?: string
}

const dynamicRouteExpectations = new Map([
  ['features.detail.crm_search_title', '/features/semantic-search'],
  ['features.detail.crm_search_agency', '/features/semantic-search'],
  ['features.detail.crm_search_assist', '/features/semantic-search'],
  ['features.detail.crm_search_sections_agency', '/features/semantic-search'],
  ['features.detail.crm_search_sections_portal', '/features/semantic-search'],
  ['features.detail.crm_search_sections_assist', '/features/semantic-search'],
  ['features.detail.ai_chat_context', '/features/ai-chat'],
  ['features.detail.intent_classifier', '/features/intent-classification'],
  ['features.detail.smart_watch_summary', '/features/smart-watch'],
  ['features.detail.smart_watch_title', '/features/smart-watch'],
  ['features.detail.smart_watch_subscription', '/features/smart-watch'],
  ['features.detail.composite_summary', '/features/composite-scoring'],
  ['features.detail.composite_formula', '/features/composite-scoring'],
  ['features.detail.composite_profiles', '/features/composite-scoring'],
  ['features.detail.semantic_reranking_title', '/features/composite-scoring'],
  ['features.detail.composite_reranking', '/features/composite-scoring'],
  ['features.detail.knowledge_upload', '/features/knowledge-base'],
  ['features.detail.vectorize_deduplication_title', '/features/knowledge-base'],
  ['features.detail.knowledge_deduplication', '/features/knowledge-base'],
  ['features.detail.knowledge_lifecycle', '/features/knowledge-base'],
  ['features.detail.rate_card_context', '/features/rate-cards']
])

async function renderFeatureRoute(route: string) {
  const seo: CapturedSeo = {}
  const slug = route.replace('/features/', '')

  Object.assign(globalThis, {
    computed,
    definePageMeta: vi.fn(),
    useRoute: () => ({ params: { slug } }),
    useSeoMeta: (value: CapturedSeo) => Object.assign(seo, value)
  })

  vi.resetModules()
  const FeaturePage = (await import('../../app/pages/features/[slug].vue')).default
  const app = createSSRApp({ render: () => h(FeaturePage) })
  app.component('MarketingNav', { template: '<nav class="bg-[#121317] text-white"><slot /></nav>' })
  app.component('MarketingFooter', { template: '<footer><slot /></footer>' })
  app.component('MarketingHeroBackground', { template: '<div data-marketing-hero-background />' })
  app.component('NuxtLink', { template: '<a><slot /></a>' })
  app.component('UIcon', { template: '<i />' })

  return { html: await renderToString(app), seo }
}

const ALWAYS_DARK_SURFACES = new Map([
  ['app/components/MarketingNav.vue', /<nav class="[^"]*bg-\[#121317\]/],
  ['app/pages/landing.vue', /min-h-screen bg-\[#0a0a0a\]/],
  ['app/pages/ai-training.vue', /min-h-screen bg-\[#0a0a0a\]/]
])

const REQUIRED_SOURCE_CLAIMS = [
  {
    sourcePath: 'app/pages/features/index.vue',
    required: [/keyword/i, /agency.assistant/i, /off by default/i]
  },
  {
    sourcePath: 'app/pages/features/[slug].vue',
    required: [/keyword ranking/i, /people, companies, and opportunities/i, /confirmed index/i, /portal/i]
  },
  {
    sourcePath: 'app/components/MarketingNav.vue',
    required: [/controlled/i, /agency.assistant/i]
  },
  {
    sourcePath: 'app/pages/platform/ai.vue',
    required: [/off by default/i, /agency.assistant/i, /keyword/i]
  },
  {
    sourcePath: 'app/pages/resources/ai-automation.vue',
    required: [/off by default/i, /confirmed index/i, /keyword/i]
  },
  {
    sourcePath: 'app/pages/resources/integrations.vue',
    required: [/authorized indexing/i, /confirmed/i, /off by default/i]
  },
  {
    sourcePath: 'app/pages/resources/index.vue',
    required: [/controlled CRM/i, /agency.assistant/i]
  },
  {
    sourcePath: 'app/pages/landing.vue',
    required: [/keyword/i, /agency.assistant/i, /off by default/i]
  },
  {
    sourcePath: 'app/pages/ai-training.vue',
    required: [/controlled CRM/i, /confirmed index/i]
  },
  {
    sourcePath: 'app/pages/index.vue',
    required: [/keyword/i, /agency.assistant/i]
  },
  {
    sourcePath: 'app/pages/creativity.vue',
    required: [/controlled CRM/i, /off by default/i]
  },
  {
    sourcePath: 'app/pages/privacy.vue',
    required: [/off by default/i, /Workers AI/i, /Vectorize/i, /not used to train/i, /confirmed erasure/i]
  },
  {
    sourcePath: 'app/_drafts/pricing-self-service.vue',
    required: [/controlled CRM/i, /off by default/i]
  }
] as const

describe('rendered CRM search marketing contract', () => {
  it.each(REQUIRED_SOURCE_CLAIMS)('binds qualified copy on $sourcePath', ({ sourcePath, required }) => {
    const source = read(sourcePath)
    const boundRenderedText = CRM_SEARCH_MARKETING_CLAIMS.claims
      .filter(claim => claim.sourcePath === sourcePath && source.includes(claim.sourceNeedle))
      .map(claim => claim.renderedText)
      .join('\n')
    for (const pattern of required) expect(`${source}\n${boundRenderedText}`).toMatch(pattern)
  })

  it('maps every dynamic feature claim to the route that actually renders it', () => {
    const dynamicClaims = dynamicFeatureClaims()

    expect(dynamicClaims).toHaveLength(dynamicRouteExpectations.size)
    for (const claim of dynamicClaims) {
      expect(claim.route, claim.key).toBe(dynamicRouteExpectations.get(claim.key))
      expect(claim.routeNeedle, claim.key).toBeTruthy()
    }
  })

  it('server-renders actual dynamic routes with their title, description, body, SEO, and theme contracts', async () => {
    const dynamicClaims = dynamicFeatureClaims()
    const routes = [...new Set(dynamicClaims.map(claim => claim.route))]

    for (const route of routes) {
      const { html, seo } = await renderFeatureRoute(route)
      const claims = dynamicClaims.filter(claim => claim.route === route)

      expect(html, `${route} title`).toContain(seo.title?.replace(' — XeroFlow', '').replace('&', '&amp;'))
      expect(html, `${route} description`).toContain(seo.description)
      expect(seo.ogTitle).toBe(seo.title)
      expect(seo.ogDescription).toBe(seo.description)
      expect(html, `${route} dark mode`).toContain('dark:')
      expect(html, `${route} light/dark surface`).toMatch(/bg-white[^"\n]*dark:bg/)

      for (const claim of claims) {
        expect(html, `${claim.key} must render on ${route}`).toContain(claim.routeNeedle)
      }
    }
  })

  it('qualifies every semantic-search SEO description', () => {
    const aiAutomation = read('app/pages/resources/ai-automation.vue')
    const featureDetail = read('app/pages/features/[slug].vue')

    expect(aiAutomation).toMatch(/description: '[^']*controlled CRM[^']*off by default[^']*'/i)
    expect(aiAutomation).toMatch(/ogDescription: '[^']*controlled CRM[^']*off by default[^']*'/i)
    expect(featureDetail).toContain('description: CRM_SEARCH_MARKETING_COPY.featureDescription')
    expect(featureDetail).toMatch(/description: feature\.value\?\.description[\s\S]*ogDescription: feature\.value\?\.description/)
    expect(CRM_SEARCH_MARKETING_COPY.featureDescription).toMatch(/keyword/i)
    expect(CRM_SEARCH_MARKETING_COPY.featureDescription).toMatch(/agency.assistant/i)
  })

  it('rejects stale training and continuous-learning claims from AI Training SEO metadata', () => {
    const training = read('app/pages/ai-training.vue')

    expect(training).not.toMatch(/(?:description|ogDescription):\s*'[^']*(?:trained on your data|learns from your unique workflows|private, continuous)[^']*'/i)
    expect(training).toMatch(/description:\s*'[^']*controlled[^']*off by default[^']*'/i)
    expect(training).toMatch(/ogDescription:\s*'[^']*keyword[^']*agency-assistant[^']*'/i)
  })

  it('describes the dedicated CRM Vectorize path without denying other Vectorize uses', () => {
    const integrations = read('app/pages/resources/integrations.vue')

    expect(integrations).toMatch(/dedicated CRM Vectorize (?:index|path)/i)
    expect(integrations).toMatch(/other XeroFlow features[^.]*separate Vectorize (?:indexes|paths)/i)
    expect(integrations).not.toMatch(/Vectorize(?:<\/strong>)? is reserved for controlled CRM/i)
    expect(integrations).not.toMatch(/Cloudflare Vectorize is used only for controlled CRM/i)
  })

  it('keeps visible and portal ranking deterministic while semantic assistance is controlled', () => {
    const renderedText = [
      ...REQUIRED_SOURCE_CLAIMS.map(({ sourcePath }) => read(sourcePath)),
      CRM_SEARCH_MARKETING_COPY.featureDescription,
      ...CRM_SEARCH_MARKETING_COPY.featureDetails.map(detail => detail.content)
    ].join('\n')

    expect(renderedText).toMatch(/visible CRM search[^.]*keyword/i)
    expect(renderedText).toMatch(/portal[^.]*keyword/i)
    expect(renderedText).toMatch(/semantic[^.]*agency.assistant/i)
    expect(renderedText).toMatch(/portal semantic ranking is unavailable/i)
    expect(renderedText).not.toMatch(/portal semantic ranking is (?:available|enabled|active)/i)
  })

  it.each(REQUIRED_SOURCE_CLAIMS)('retains a dark-mode treatment on $sourcePath', ({ sourcePath }) => {
    const source = read(sourcePath)
    const alwaysDarkContract = ALWAYS_DARK_SURFACES.get(sourcePath)

    if (alwaysDarkContract) {
      expect(source).toMatch(alwaysDarkContract)
      expect(source).toMatch(/class="[^"]*text-white/)
      return
    }

    expect(source).toMatch(/class="[^"]*dark:/)
    expect(source).toMatch(/class="[^"]*(?:bg-white|text-\[#121317\]|text-\[#45474D\])[^\n"]*dark:/)
  })
})
