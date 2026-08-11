import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { shouldIgnorePrerenderRoute } from '../../lib/prerender-ignore'
import { shouldRedirectAppHostPath } from '../../server/middleware/01-app-host-redirect'

const read = (path: string) => readFileSync(path, 'utf8')

describe('AI Assistants public launch surface', () => {
  it('truthfully separates always-on active-owner God mode from governed employees', () => {
    const detail = read('app/pages/features/[slug].vue')
    const index = read('app/pages/features/index.vue')
    const source = `${index}\n${detail}`

    expect(source).toContain('Owner God Mode')
    expect(source).toContain('active owners')
    expect(source.toLowerCase()).toContain('ordinary employees')
    expect(source.toLowerCase()).toContain('tenant')
    expect(source.toLowerCase()).toContain('audit')
    expect(source).not.toContain('Active company owners inherit every evaluation-approved')
  })

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

  it('keeps the established AI platform journey alongside governed assistants', () => {
    const navigation = read('app/components/MarketingNav.vue')
    const homepage = read('app/pages/index.vue')
    const aiPlatform = read('app/pages/platform/ai.vue')
    const assistants = read('app/pages/ai-assistants.vue')

    expect(navigation).toContain('title: \'AI Assistant\'')
    expect(navigation).toContain('to: \'/platform/ai\'')
    expect(navigation).toContain('title: \'Governed AI Assistants\'')
    expect(navigation).toContain('to: \'/ai-assistants\'')

    expect(homepage).toContain('AI-Powered Insights')
    expect(homepage).toContain('visible CRM keyword search')
    expect(homepage).toContain('semantic assistance is limited to approved agency-assistant contexts')
    expect(homepage).not.toContain('Groq-powered chat with @entity mentions, anomaly detection across 8 analyzers, semantic search, and proactive recommendations.')
    expect(homepage).toMatch(/<NuxtLink to="\/platform\/ai"[^>]*>\s*Learn more/)
    expect(homepage).toContain('{ title: \'AI Insights\'')
    expect(homepage).toContain('to: \'/platform/ai\'')
    expect(homepage).toContain('{ title: \'AI Assistants\'')

    expect(aiPlatform).toContain('Meet governed assistants')
    expect(aiPlatform).toContain('to="/ai-assistants"')
    expect(assistants).toContain('Explore the full AI platform')
    expect(assistants).toContain('to="/platform/ai"')
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
