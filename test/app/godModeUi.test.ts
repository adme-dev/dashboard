// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, createApp, h, nextTick, onMounted, readonly, ref, Suspense } from 'vue'

const authState = vi.hoisted(() => ({ user: undefined as unknown as ReturnType<typeof ref> }))
authState.user = ref<null | Record<string, unknown>>(null)

vi.mock('~/composables/useAuth', () => ({
  useAuth: () => ({
    user: readonly(authState.user),
    isAuthenticated: computed(() => Boolean(authState.user.value)),
    isGodMode: computed(() => authState.user.value?.godMode && (authState.user.value.godMode as { active?: boolean }).active === true),
    logout: vi.fn(),
    fetchUser: vi.fn()
  })
}))

Object.assign(globalThis, {
  computed,
  definePageMeta: vi.fn(),
  onMounted,
  readonly,
  ref,
  useAppConfig: () => ({ ui: { colors: { primary: 'blue', neutral: 'slate' } } }),
  useColorMode: () => ({ preference: 'dark' }),
  useToast: () => ({ add: vi.fn() })
})

const uiStubs = {
  UAvatar: { template: '<span><slot /></span>' },
  UAlert: { props: ['title', 'description'], template: '<aside><strong>{{ title }}</strong><span>{{ description }}</span><slot /></aside>' },
  UBadge: { template: '<span><slot /></span>' },
  UButton: { props: ['label'], template: '<button v-bind="$attrs">{{ label }}<slot /></button>' },
  UCard: { template: '<article><slot name="header" /><slot /></article>' },
  UDashboardGroup: { template: '<main><slot /></main>' },
  UDashboardSidebar: { template: '<aside><slot name="header" /><slot /><slot name="footer" /></aside>' },
  UDropdownMenu: { template: '<div><slot /></div>' },
  UFormField: { props: ['label', 'help'], template: '<label>{{ label }}<slot /><small>{{ help }}</small></label>' },
  UIcon: { template: '<i />' },
  UModal: { template: '<div><slot name="content" /></div>' },
  UNavigationMenu: { template: '<nav />' },
  USelect: { template: '<select />' },
  USwitch: { template: '<span />' },
  UTooltip: { template: '<span><slot /></span>' }
}

function registerUi(app: ReturnType<typeof createApp>) {
  for (const [name, component] of Object.entries(uiStubs)) app.component(name, component)
}

afterEach(() => {
  authState.user.value = null
  document.body.innerHTML = ''
})

describe('persistent owner God mode status', () => {
  it('renders in the agency UserMenu only from the server-issued active authority', async () => {
    authState.user.value = { name: 'Owner', godMode: { active: true, label: 'God mode active' } }
    const UserMenu = (await import('~~/app/components/UserMenu.vue')).default
    const host = document.createElement('div')
    const app = createApp(UserMenu)
    registerUi(app)
    app.mount(host)

    expect(host.textContent).toContain('God mode active')
    const statusTrigger = host.querySelector('button[aria-describedby]')
    expect(statusTrigger).not.toBeNull()
    expect(statusTrigger?.getAttribute('type')).toBe('button')
    expect(statusTrigger?.getAttribute('aria-label')).toContain('God mode active')
    const descriptionId = statusTrigger?.getAttribute('aria-describedby')
    expect(descriptionId).toBeTruthy()
    expect(host.querySelector(`#${descriptionId}`)?.textContent).toContain('registered application and MCP capabilities')

    authState.user.value = { name: 'Member', godMode: { active: false, label: 'God mode active' } }
    await nextTick()
    expect(host.textContent).not.toContain('God mode active')
    app.unmount()
  })

  it('renders in the admin layout only for active God mode authority', async () => {
    authState.user.value = { name: 'Owner', email: 'owner@example.test', godMode: { active: true, label: 'God mode active' } }
    const AdminLayout = (await import('~~/app/layouts/admin.vue')).default
    const host = document.createElement('div')
    const app = createApp(AdminLayout)
    registerUi(app)
    app.mount(host)

    expect(host.textContent).toContain('God mode active')
    const statusTrigger = host.querySelector('button[aria-describedby]')
    expect(statusTrigger).not.toBeNull()
    expect(statusTrigger?.getAttribute('type')).toBe('button')
    expect(statusTrigger?.getAttribute('aria-label')).toContain('God mode active')
    const descriptionId = statusTrigger?.getAttribute('aria-describedby')
    expect(descriptionId).toBeTruthy()
    expect(host.querySelector(`#${descriptionId}`)?.textContent).toContain('registered application and MCP capabilities')
    authState.user.value = { name: 'Admin', email: 'admin@example.test', godMode: { active: false, label: 'God mode active' } }
    await nextTick()
    expect(host.textContent).not.toContain('God mode active')
    app.unmount()
  })

  it('keeps the agency layout indicator persistent through UserMenu and adds no session toggle', () => {
    const agency = readFileSync('app/layouts/agency.vue', 'utf8')
    const menu = readFileSync('app/components/UserMenu.vue', 'utf8')
    const admin = readFileSync('app/layouts/admin.vue', 'utf8')

    expect(agency).toMatch(/<UserMenu\s+:collapsed="collapsed"/)
    expect(menu).toContain('v-if="isGodMode"')
    expect(admin).toContain('v-if="isGodMode"')
    expect([agency, menu, admin].join('\n')).not.toMatch(/God mode[^\n]*(USwitch|toggle)/i)
  })

  it('documents separate guarded Pages and standalone MCP Worker deployment procedures', () => {
    const runbook = readFileSync('docs/runbooks/owner-god-mode.md', 'utf8')
    const emergencySection = runbook.split('## Emergency disable')[1]?.split('## Audit verification')[0] ?? ''

    expect(emergencySection).toContain('pnpm deploy:check')
    expect(emergencySection).toContain('pnpm deploy:production')
    expect(emergencySection).toContain('workers/mcp-server/DEPLOYMENT.md')
    expect(emergencySection).toContain('docs/mcp-server-guide.md')
    expect(emergencySection).toMatch(/godMode:\s*true[^.]*rejected/i)
    expect(emergencySection).toMatch(/reconnect[^.]*godMode:\s*false/i)
  })

  it('documents ambiguous audit outcomes as non-terminal reconciliation evidence', () => {
    const runbook = readFileSync('docs/runbooks/owner-god-mode.md', 'utf8')
    const auditSection = runbook.split('## Audit verification')[1]?.split('## Role downgrade or deactivation')[0] ?? ''

    expect(auditSection).toMatch(/ambiguous[^.]*non-terminal/i)
    expect(auditSection).toMatch(/later[^.]*succeeded[^.]*failed/i)
    expect(auditSection).toMatch(/unresolved reconciliation[^.]*alert/i)
  })

  it('renders the truthful My Assistant authority card only for God mode coverage', async () => {
    const baseAuthority = {
      accessBasis: 'god_mode',
      coverageStatus: 'god_mode',
      runtimeMode: 'enforced',
      currentRole: 'owner',
      readOnly: false,
      permissionGroups: [],
      departments: [],
      clientScope: { mode: 'all_active', assignments: [] },
      activePacks: [],
      catalogMode: 'god_mode'
    }
    ;(globalThis as { $fetch?: unknown }).$fetch = vi.fn(async (url: string) => url.endsWith('/memories')
      ? { observed: [], shared: [] }
      : { personaKey: 'general', disabledTools: [], memoryEnabled: true, observedMemoryEnabled: false, authority: baseAuthority, tools: [], restrictions: [] })

    const MyAssistant = (await import('~~/app/pages/agency/ai/my-assistant.vue')).default
    const host = document.createElement('div')
    const app = createApp({ render: () => h(Suspense, null, { default: () => h(MyAssistant) }) })
    registerUi(app)
    app.mount(host)
    await new Promise(resolve => setTimeout(resolve, 0))
    await nextTick()

    expect(host.textContent).toContain('God mode active')
    expect(host.textContent).toContain('Authentication and session checks')
    expect(host.textContent).toContain('tenant, client and entity isolation')
    expect(host.textContent).toContain('mandatory audit')
    app.unmount()

    ;(globalThis as { $fetch?: unknown }).$fetch = vi.fn(async (url: string) => url.endsWith('/memories')
      ? { observed: [], shared: [] }
      : {
          personaKey: 'general', disabledTools: [], memoryEnabled: true, observedMemoryEnabled: false,
          authority: { ...baseAuthority, accessBasis: 'catalog_policy', coverageStatus: 'governed', currentRole: 'member', catalogMode: 'governed' },
          tools: [], restrictions: []
        })
    const governedHost = document.createElement('div')
    const governedApp = createApp({ render: () => h(Suspense, null, { default: () => h(MyAssistant) }) })
    registerUi(governedApp)
    governedApp.mount(governedHost)
    await new Promise(resolve => setTimeout(resolve, 0))
    await nextTick()
    expect(governedHost.textContent).not.toContain('God mode active')
    expect(governedHost.textContent).toContain('Governed catalog')
    governedApp.unmount()
  })
})
