import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const conversionCtaPages = [
  'app/pages/index.vue',
  'app/pages/banner-studio/dynamic-ads.vue',
  'app/pages/banner-studio/index.vue',
  'app/pages/creativity.vue',
  'app/pages/features/[slug].vue',
  'app/pages/features/ad-platform-export.vue',
  'app/pages/features/bulk-ad-launch.vue',
  'app/pages/features/index.vue',
  'app/pages/platform/ad-spend.vue',
  'app/pages/platform/ai.vue',
  'app/pages/platform/automations.vue',
  'app/pages/platform/boards.vue',
  'app/pages/platform/calendar.vue',
  'app/pages/platform/chat.vue',
  'app/pages/platform/client-portal.vue',
  'app/pages/platform/financials.vue',
  'app/pages/platform/office.vue',
  'app/pages/platform/templates.vue',
  'app/pages/platform/time-tracking.vue'
]

describe('public marketing CTA effects', () => {
  it.each(conversionCtaPages)('%s renders the shared ambient particle field', (pagePath) => {
    const source = readFileSync(pagePath, 'utf8')

    expect(source).toMatch(/<MarketingCtaParticles\b/)
  })
})
