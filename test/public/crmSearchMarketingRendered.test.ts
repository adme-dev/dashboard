import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  CRM_SEARCH_MARKETING_CLAIMS,
  CRM_SEARCH_MARKETING_COPY
} from '../../app/utils/marketingClaimManifest'

const read = (path: string) => readFileSync(path, 'utf8')

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
  it.each(REQUIRED_SOURCE_CLAIMS)('renders qualified copy on $sourcePath', ({ sourcePath, required }) => {
    const source = read(sourcePath)
    const boundRenderedText = CRM_SEARCH_MARKETING_CLAIMS.claims
      .filter(claim => claim.sourcePath === sourcePath && source.includes(claim.sourceNeedle))
      .map(claim => claim.renderedText)
      .join('\n')
    for (const pattern of required) expect(`${source}\n${boundRenderedText}`).toMatch(pattern)
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
