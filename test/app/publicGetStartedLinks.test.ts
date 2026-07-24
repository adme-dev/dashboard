import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const marketingPages = [
  'app/pages/ai-training.vue',
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
  'app/pages/platform/templates.vue',
  'app/pages/platform/time-tracking.vue',
  'app/pages/resources/bulk-ad-launch.vue',
  'app/pages/resources/client-portal-admin.vue',
  'app/pages/resources/financial-operations.vue',
  'app/pages/resources/first-automation.vue',
  'app/pages/resources/quick-start.vue',
  'app/pages/resources/setting-up-clients.vue',
  'app/pages/voice-ai.vue'
]

const marketingLinks = marketingPages.flatMap((pagePath) => {
  const source = readFileSync(pagePath, 'utf8')
  return source.match(/<NuxtLink\b[\s\S]*?<\/NuxtLink>/g) ?? []
})

describe('public marketing CTAs', () => {
  it('routes former Get Started links to the contact page', () => {
    const getStartedLinks = marketingLinks.filter(link => /\bGet Started(?: Free)?\b/i.test(link))
    const contactLinks = marketingLinks.filter(link =>
      link.includes('to="/contact"') && /\bTalk to us\b/i.test(link)
    )

    expect(getStartedLinks).toEqual([])
    expect(contactLinks).toHaveLength(31)
  })
})
