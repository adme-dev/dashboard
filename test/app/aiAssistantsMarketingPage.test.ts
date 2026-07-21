import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { shouldIgnorePrerenderRoute } from '../../lib/prerender-ignore'
import { shouldRedirectAppHostPath } from '../../server/middleware/01-app-host-redirect'

const read = (path: string) => readFileSync(path, 'utf8')

describe('AI Assistants public launch surface', () => {
  it('publishes a dedicated, indexable page with honest product positioning', () => {
    const page = read('app/pages/ai-assistants.vue')
    const hero = read('app/components/marketing/AiAssistantsHero.vue')
    const specialists = read('app/components/marketing/AiAssistantSpecialists.vue')
    const governance = read('app/components/marketing/AiAssistantGovernance.vue')
    const launchSurface = [page, hero, specialists, governance].join('\n')

    expect(page).toContain('layout: false')
    expect(page).toContain('public: true')
    expect(page).toContain('MarketingAiAssistantsHero')
    expect(page).toContain('MarketingAiAssistantSpecialists')
    expect(page).toContain('MarketingAiAssistantGovernance')
    expect(launchSurface).toContain('AI assistants for every person')
    expect(launchSurface).toContain('Spend Controller')
    expect(launchSurface).toContain('Publishing Planner')
    expect(launchSurface).toContain('Financial Watch')
    expect(launchSurface).toContain('Traffic Controller')
    expect(launchSurface).toContain('Human approval stays in control')
    expect(page).toContain('https://xeroflow.io/ai-assistants')
  })

  it('makes the page discoverable from primary marketing surfaces', () => {
    const navigation = read('app/components/MarketingNav.vue')
    const homepage = read('app/pages/index.vue')
    const features = read('app/pages/features/index.vue')
    const aiPlatform = read('app/pages/platform/ai.vue')
    const footer = read('app/components/MarketingFooter.vue')

    for (const source of [navigation, homepage, features, aiPlatform, footer]) {
      expect(source).toContain('/ai-assistants')
    }
  })

  it('prerenders the canonical AI Assistants route', () => {
    const config = read('nuxt.config.ts')
    const authMiddleware = read('app/middleware/auth.global.ts')

    expect(config).toMatch(/['"]\/ai-assistants['"]:\s*\{\s*prerender:\s*true\s*\}/)
    expect(shouldIgnorePrerenderRoute('/ai-assistants')).toBe(false)
    expect(authMiddleware).toMatch(/'\/ai-assistants'/)
    expect(shouldRedirectAppHostPath('/ai-assistants')).toBe(true)
  })
})
