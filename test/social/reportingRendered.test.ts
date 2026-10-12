import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, createSSRApp, h, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'

const fixtures = vi.hoisted(() => ({ overview: null as any }))
vi.mock('~/composables/useSocialPublishingClient', () => ({ useSocialPublishingClient: () => ({ clientId: ref('client') }) }))
vi.mock('~/composables/useSocialReporting', () => ({ useSocialReporting: () => ({
  overview: ref(fixtures.overview), posts: ref([]), aiSummary: ref(null), loading: ref(false),
  days: ref(30), platform: ref('facebook'), load: vi.fn(), generateSummary: vi.fn(),
}) }))
vi.mock('~/composables/usePortalSocialReporting', () => ({ usePortalSocialReporting: () => ({
  overview: ref(fixtures.overview), aiSummary: ref(null), loading: ref(false),
  days: ref(30), platform: ref('facebook'), load: vi.fn(), generateSummary: vi.fn(),
}) }))

afterEach(() => vi.unstubAllGlobals())

describe('rendered reporting availability', () => {
  it.each(['analytics', 'agency', 'portal'])('%s shows missing metrics as em dashes and measured zeroes as zero', async (surface) => {
    fixtures.overview = {
      kpis: { posts: { value: 1, deltaPct: null }, ...Object.fromEntries(['impressions', 'reach', 'engagements', 'clicks', 'engagementRate'].map(key => [key, { value: null, deltaPct: null }])) },
      cadence: [],
      bestContent: [{ postId: 'p1', content: 'Test post', engagements: null, reach: null, engagementRate: null }],
      accountGrowth: [{ platform: 'facebook', snapshot_date: '2026-10-12', followers: 0, reach: null, impressions: null }],
    }
    for (const [key, value] of Object.entries({ ref, computed, watch: vi.fn(), onMounted: vi.fn(), definePageMeta: vi.fn(), useHead: vi.fn(), $fetch: vi.fn(), useFetch: async () => ({ data: ref([{ id: 'client', name: 'Client' }]) }) })) vi.stubGlobal(key, value)
    const Page = surface === 'analytics'
      ? (await import('../../app/pages/agency/social/publishing/analytics.vue')).default
      : surface === 'agency' ? (await import('../../app/pages/agency/social/reporting/index.vue')).default
        : (await import('../../app/pages/portal/social-reporting.vue')).default
    const app = createSSRApp({ render: () => h(Page) })
    for (const name of ['SocialPublishingShell', 'USelectMenu', 'UButton', 'UBadge', 'UCard', 'UIcon', 'SocialSuiteSectionNav', 'PortalSocialSectionNav', 'SocialReportSchedulesManager']) {
      app.component(name, { template: '<div><slot /><slot name="content" /></div>' })
    }
    const html = await renderToString(app)
    expect(html).toMatch(/Impressions<\/div><div[^>]*>—<\/div>/)
    expect(html).toMatch(/Reach<\/div><div[^>]*>—<\/div>/)
    expect(html).toMatch(/Eng\. rate<\/div><div[^>]*>—<\/div>/)
    expect(html).not.toContain('null%')
    expect(html).not.toContain('0%')
    expect(html).not.toContain('-100%')
    expect(html).toContain('unavailable or incomplete provider data')
    if (surface === 'analytics') expect(html).toMatch(/Followers<\/div>\s*<div[^>]*>0<\/div>/)
  })
})
