// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { computed, createSSRApp, h, ref } from 'vue'
import { renderToString } from 'vue/server-renderer'
import SocialPublishingNav from '~~/app/components/social-publishing/SocialPublishingNav.vue'

// The SFC relies on Nuxt auto-imports; expose the ones it uses as globals.
Object.assign(globalThis, { ref, computed })

// Stubs for the Nuxt UI primitives the nav uses. UButton renders its `to` as an
// href and lets undeclared attrs (aria-current) fall through to its root <a>.
const stubs: Record<string, unknown> = {
  UButton: {
    name: 'UButton',
    props: ['to', 'icon', 'color', 'variant', 'size', 'block'],
    template: '<a :href="to" :data-icon="icon"><slot /></a>'
  },
  UBadge: {
    name: 'UBadge',
    props: ['color', 'variant', 'size'],
    template: '<span data-badge><slot /></span>'
  },
  UIcon: { name: 'UIcon', props: ['name'], template: '<i :data-icon="name" />' },
  UTooltip: { name: 'UTooltip', props: ['text'], template: '<span><slot /></span>' }
}

async function render(props: Record<string, unknown> = {}, routePath = '/agency/social/publishing') {
  ;(globalThis as any).useRoute = () => ({ path: routePath, query: {} })
  const app = createSSRApp({ render: () => h(SocialPublishingNav, props) })
  Object.entries(stubs).forEach(([name, comp]) => app.component(name, comp))
  return renderToString(app)
}

const badgeCount = (html: string) => (html.match(/data-badge/g) || []).length
// SSR wraps slot content in <!--[-->...<!--]--> markers, so pull the digit from
// the full span inner content rather than expecting it adjacent to '>'.
const badgeValues = (html: string) =>
  [...html.matchAll(/data-badge[^>]*>([\s\S]*?)<\/span>/g)]
    .map(m => (m[1].match(/\d+/) || [''])[0])
    .filter(Boolean)
    .sort()

describe('SocialPublishingNav', () => {
  it('renders the five enterprise suite groups', async () => {
    const html = await render()
    for (const label of ['Create', 'Schedule', 'Review', 'Connect', 'Measure']) {
      expect(html).toContain(label)
    }
  })

  it('renders all seven publishing tiles with their routes', async () => {
    const html = await render()
    for (const label of ['Compose', 'Calendar', 'Queue', 'Planner', 'Approvals', 'Accounts', 'Analytics']) {
      expect(html).toContain(label)
    }
    expect(html).toContain('href="/agency/social/publishing/compose"')
    expect(html).toContain('href="/agency/social/publishing/accounts"')
    expect(html).toContain('href="/agency/social/publishing/queue"')
    // Calendar is the suite root
    expect(html).toContain('href="/agency/social/publishing"')
  })

  it('shows a count badge only on badged tiles with a positive count', async () => {
    const html = await render({ counts: { accounts: 5, scheduled: 3, pendingApprovals: 2, drafts: 7 } })
    // exactly the four badged routes (accounts/calendar/approvals/compose) render a badge
    expect(badgeCount(html)).toBe(4)
    expect(badgeValues(html)).toEqual(['2', '3', '5', '7'])
  })

  it('hides badges when counts are zero or absent', async () => {
    expect(badgeCount(await render({ counts: { accounts: 0, scheduled: 0, pendingApprovals: 0, drafts: 0 } }))).toBe(0)
    expect(badgeCount(await render({ counts: null }))).toBe(0)
    expect(badgeCount(await render())).toBe(0)
  })

  it('marks exactly the active tile via aria-current', async () => {
    const html = await render({}, '/agency/social/publishing/compose')
    expect((html.match(/aria-current="page"/g) || []).length).toBe(1)
  })
})
