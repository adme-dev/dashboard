// @vitest-environment happy-dom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { compileScript, parse } from '@vue/compiler-sfc'
import * as VueUseCore from '@vueuse/core'
import { defu } from 'defu'
import * as OhashUtils from 'ohash/utils'
import * as RekaUi from 'reka-ui'
import * as RekaUiNamespaced from 'reka-ui/namespaced'
import ts from 'typescript'
import * as Ufo from 'ufo'
import { afterEach, describe, expect, it } from 'vitest'
import * as Vue from 'vue'
import { computed, createApp, defineComponent, h, nextTick, ref, watch, type App } from 'vue'
import { createMemoryHistory, createRouter, RouterLink, useRoute } from 'vue-router'
import type { NavigationMenuItem } from '@nuxt/ui'
import { applyActiveSidebarNav } from '~~/app/utils/sidebarActiveNav'

const componentsDir = resolve(process.cwd(), 'node_modules/@nuxt/ui/dist/runtime/components')

const linkTheme = {
  base: 'link-base',
  variants: {
    active: {
      true: 'text-primary',
      false: 'text-muted'
    },
    disabled: {
      true: 'opacity-50'
    }
  }
}

const popoverTheme = {
  slots: {
    content: 'popover-content',
    arrow: 'popover-arrow'
  }
}

const navigationMenuTheme = {
  slots: {
    root: 'nav-root',
    list: 'nav-list',
    label: 'nav-label',
    item: 'nav-item',
    link: 'nav-link',
    linkLeadingIcon: 'nav-icon',
    linkLeadingAvatar: 'nav-avatar',
    linkLeadingAvatarSize: '2xs',
    linkTrailing: 'nav-trailing',
    linkTrailingBadge: 'nav-badge',
    linkTrailingBadgeSize: 'sm',
    linkTrailingIcon: 'nav-trailing-icon',
    linkLabel: 'nav-link-label',
    linkLabelExternalIcon: 'nav-ext-icon',
    childList: 'nav-child-list',
    childLabel: 'nav-child-label',
    childItem: 'nav-child-item',
    childLink: 'nav-child-link',
    childLinkIcon: 'nav-child-icon',
    childLinkWrapper: 'nav-child-wrapper',
    childLinkLabel: 'nav-child-label-text',
    childLinkLabelExternalIcon: 'nav-child-ext',
    childLinkDescription: 'nav-child-desc',
    separator: 'nav-sep',
    viewportWrapper: 'nav-viewport-wrapper',
    viewport: 'nav-viewport',
    content: 'nav-content',
    indicator: 'nav-indicator',
    arrow: 'nav-arrow'
  },
  variants: {
    active: {
      true: {
        link: 'text-primary before:bg-elevated',
        childLink: 'text-primary before:bg-elevated'
      },
      false: {
        link: 'text-muted',
        childLink: 'text-muted'
      }
    }
  }
}

const appConfigStub = {
  ui: {
    icons: {
      chevronDown: 'i-lucide-chevron-down',
      external: 'i-lucide-arrow-up-right'
    }
  }
}

const nuxtUiUtils = await import('../../node_modules/@nuxt/ui/dist/runtime/utils/index.js')
const nuxtUiLinkUtils = await import('../../node_modules/@nuxt/ui/dist/runtime/utils/link.js')
const nuxtUiOverlayUtils = await import('../../node_modules/@nuxt/ui/dist/runtime/utils/overlay.js')
const nuxtUiForwardProps = await import('../../node_modules/@nuxt/ui/dist/runtime/composables/useForwardProps.js')
const nuxtUiPortal = await import('../../node_modules/@nuxt/ui/dist/runtime/composables/usePortal.js')

const nuxtUiTv = {
  tv: (config: { extend?: { __slots?: Record<string, string>, __base?: string }, slots?: Record<string, string>, base?: string }) => {
    const slots = config?.slots ?? config?.extend?.__slots
    if (slots) {
      const fn = () => Object.fromEntries(
        Object.entries(slots).map(([slotName, baseClass]) => [
          slotName,
          (slotProps?: { active?: boolean, class?: unknown }) => {
            const activeClass = slotProps?.active ? 'text-primary before:bg-elevated' : 'text-muted'
            return [baseClass, activeClass, ...(Array.isArray(slotProps?.class) ? slotProps.class : [slotProps?.class])].filter(Boolean).join(' ')
          }
        ])
      )
      return Object.assign(fn, { __slots: slots })
    }
    const base = config?.base ?? config?.extend?.__base ?? ''
    const fn = (slotProps?: { active?: boolean, class?: unknown }) => [
      base,
      slotProps?.active ? 'text-primary' : 'text-muted',
      ...(Array.isArray(slotProps?.class) ? slotProps.class : [slotProps?.class])
    ].filter(Boolean).join(' ')
    return Object.assign(fn, { __base: base })
  }
}

function loadNuxtUiJs(relativePath: string) {
  const fullPath = resolve(process.cwd(), 'node_modules/@nuxt/ui/dist/runtime', relativePath)
  const source = readFileSync(fullPath, 'utf8')
  const js = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText
  const mod: { exports: Record<string, unknown> } = { exports: {} }
  const req = (id: string): unknown => {
    if (id === 'vue') return Vue
    if (id === 'reka-ui') return RekaUi
    if (id === 'defu') return { __esModule: true, default: defu, defu }
    if (id === '#imports') return { useAppConfig: () => appConfigStub }
    if (id === '../utils/index.js') return nuxtUiUtils
    throw new Error(`Unexpected import in ${relativePath}: ${id}`)
  }
  new Function('require', 'exports', 'module', js)(req, mod.exports, mod)
  return mod.exports
}

const useComponentPropsReal = loadNuxtUiJs('composables/useComponentProps.js')

const fieldGroupStub = {
  FieldGroupReset: defineComponent({
    setup(_props, { slots }) {
      return () => slots.default?.()
    }
  })
}

function compileNuxtUiSfc(fileName: string, localResolver: (id: string) => unknown) {
  const fullPath = resolve(componentsDir, fileName)
  const source = readFileSync(fullPath, 'utf8')
  const { descriptor } = parse(source, { filename: fullPath })
  const compiled = compileScript(descriptor, { id: `nuxt-ui-${fileName}`, inlineTemplate: true }).content
  const js = ts.transpileModule(compiled, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true
    }
  }).outputText

  const mod: { exports: { default?: unknown } } = { exports: {} }
  const customRequire = (id: string): unknown => {
    if (id === 'vue') return Vue
    if (id === 'reka-ui') return RekaUi
    if (id === 'reka-ui/namespaced') return RekaUiNamespaced
    if (id === '@vueuse/core') return VueUseCore
    if (id === 'defu') return { defu }
    if (id === 'ohash/utils') return OhashUtils
    if (id === 'ufo') return Ufo
    if (id === '#imports') {
      return {
        useRoute: () => useRoute(),
        useAppConfig: () => appConfigStub,
        useNuxtApp: () => ({})
      }
    }
    if (id === '#build/ui/link') return { __esModule: true, default: linkTheme }
    if (id === '#build/ui/popover') return { __esModule: true, default: popoverTheme }
    if (id === '#build/ui/navigation-menu') return { __esModule: true, default: navigationMenuTheme }
    if (id === '../utils') return nuxtUiUtils
    if (id === '../utils/link') return nuxtUiLinkUtils
    if (id === '../utils/overlay') return nuxtUiOverlayUtils
    if (id === '../utils/tv') return nuxtUiTv
    if (id === '../composables/useForwardProps') return nuxtUiForwardProps
    if (id === '../composables/usePortal') return nuxtUiPortal
    if (id === '../composables/useComponentProps') return useComponentPropsReal
    if (id === '../composables/useFieldGroup') return fieldGroupStub
    return localResolver(id)
  }

  new Function('require', 'exports', 'module', js)(customRequire, mod.exports, mod)
  return mod.exports.default
}

const ULinkBase = compileNuxtUiSfc('LinkBase.vue', (id) => {
  throw new Error(`Unexpected import in LinkBase.vue: ${id}`)
})

const ULink = compileNuxtUiSfc('Link.vue', (id) => {
  if (id === './LinkBase.vue') return { __esModule: true, default: ULinkBase }
  throw new Error(`Unexpected import in Link.vue: ${id}`)
})

const UPopover = compileNuxtUiSfc('Popover.vue', (id) => {
  throw new Error(`Unexpected import in Popover.vue: ${id}`)
})

const UAvatarStub = { template: '<span />' }
const UIconStub = { props: ['name'], template: '<i :data-icon="name" />' }
const UBadgeStub = { props: ['label'], template: '<span>{{ label }}</span>' }
const UChipStub = { template: '<span><slot /></span>' }
const UTooltipStub = defineComponent({
  setup(_props, { attrs, slots }) {
    return () => h(RekaUi.Slot, attrs, slots)
  }
})

const UNavigationMenu = compileNuxtUiSfc('NavigationMenu.vue', (id) => {
  if (id === './LinkBase.vue') return { __esModule: true, default: ULinkBase }
  if (id === './Link.vue') return { __esModule: true, default: ULink }
  if (id === './Popover.vue') return { __esModule: true, default: UPopover }
  if (id === './Avatar.vue') return { __esModule: true, default: UAvatarStub }
  if (id === './Icon.vue') return { __esModule: true, default: UIconStub }
  if (id === './Badge.vue') return { __esModule: true, default: UBadgeStub }
  if (id === './Chip.vue') return { __esModule: true, default: UChipStub }
  if (id === './Tooltip.vue') return { __esModule: true, default: UTooltipStub }
  throw new Error(`Unexpected import in NavigationMenu.vue: ${id}`)
})

const mountedApps: App[] = []

afterEach(() => {
  for (const app of mountedApps.splice(0)) app.unmount()
  document.body.innerHTML = ''
})

function buildTestRouter() {
  const Empty = { template: '<div />' }
  return createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/portal', component: Empty },
      { path: '/portal/analytics', component: Empty },
      { path: '/portal/analytics/:platform', component: Empty },
      {
        path: '/agency',
        component: Empty,
        children: [
          { path: '', component: Empty },
          { path: 'audio', component: Empty },
          { path: 'audio/projects', component: Empty },
          { path: 'audio/projects/:id', component: Empty },
          { path: 'ai/chat', component: Empty },
          { path: 'boards', component: Empty },
          { path: 'boards/:id', component: Empty },
          { path: 'w/:slug', component: Empty }
        ]
      }
    ]
  })
}

async function flushUi() {
  for (let i = 0; i < 4; i += 1) {
    await new Promise(resolveTimer => setTimeout(resolveTimer, 10))
    await nextTick()
  }
}

async function mountMenu(
  router: ReturnType<typeof buildTestRouter>,
  getGroups: () => NavigationMenuItem[][],
  options: { initialCollapsed?: boolean, popover?: boolean } = {}
) {
  const collapsed = ref(options.initialCollapsed ?? false)
  const usePopover = Boolean(options.popover)

  const Host = defineComponent({
    setup() {
      const route = useRoute()
      const openCollapsedPopovers = ref<Set<string>>(new Set())
      const handleCollapsedPopoverOpenChange = (key: string, isOpen: boolean) => {
        if (isOpen === openCollapsedPopovers.value.has(key)) return
        const next = new Set(openCollapsedPopovers.value)
        if (isOpen) next.add(key)
        else next.delete(key)
        openCollapsedPopovers.value = next
      }
      watch(() => route.fullPath, () => {
        if (openCollapsedPopovers.value.size) openCollapsedPopovers.value = new Set()
      })

      const resolved = computed(() => applyActiveSidebarNav(
        getGroups(),
        { path: route.path, query: route.query, matched: route.matched },
        collapsed.value
          ? {
              collapsed: true,
              ...(usePopover
                ? {
                    popover: true,
                    openPopoverKeys: openCollapsedPopovers.value,
                    onPopoverOpenChange: handleCollapsedPopoverOpenChange
                  }
                : {})
            }
          : undefined
      ))
      return () => h('aside', resolved.value.map(items => h(UNavigationMenu as never, {
        collapsed: collapsed.value,
        items,
        orientation: 'vertical',
        tooltip: true,
        ...(usePopover ? { popover: { openDelay: 0, closeDelay: 0, portal: false } } : {})
      })))
    }
  })

  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp(Host)
  app.use(router)
  app.provide(nuxtUiPortal.portalTargetInjectionKey, computed(() => 'body'))
  app.component('NuxtLink', RouterLink)
  mountedApps.push(app)
  app.mount(host)
  await nextTick()
  return { host, collapsed }
}

describe('rendered UNavigationMenu active-item behavior', () => {
  it('preserves a single visible current-page indicator across expanded -> collapsed -> expanded in portal Analytics', async () => {
    const router = buildTestRouter()
    await router.push('/portal/analytics?metric=leads')
    await router.isReady()

    const { host, collapsed } = await mountMenu(router, () => [[
      { label: 'Dashboard', to: '/portal', exact: true },
      {
        label: 'Analytics',
        to: '/portal/analytics?metric=leads',
        type: 'trigger',
        defaultOpen: true,
        children: [
          { label: 'Overview', to: '/portal/analytics?metric=leads' },
          { label: 'Google', to: '/portal/analytics/google' }
        ]
      }
    ]])

    // Expanded: Overview is the single visible current-page link.
    const expandedCurrent = [...host.querySelectorAll('a[aria-current="page"]')]
    expect(expandedCurrent).toHaveLength(1)
    expect(expandedCurrent[0]?.textContent?.trim()).toBe('Overview')

    // Collapsed: Overview unmounts; Analytics becomes the single visible current-page link.
    collapsed.value = true
    await nextTick()
    const collapsedCurrent = [...host.querySelectorAll('a[aria-current="page"]')]
    expect(collapsedCurrent).toHaveLength(1)
    expect(collapsedCurrent[0]?.getAttribute('href')).toBe('/portal/analytics?metric=leads')
    expect(collapsedCurrent[0]?.hasAttribute('data-active')).toBe(true)
    expect(collapsedCurrent[0]?.className).toContain('text-primary')

    // Re-expanded: Overview regains the single active indicator and Analytics is no longer active.
    collapsed.value = false
    await nextTick()
    const reExpandedCurrent = [...host.querySelectorAll('a[aria-current="page"]')]
    expect(reExpandedCurrent).toHaveLength(1)
    expect(reExpandedCurrent[0]?.textContent?.trim()).toBe('Overview')

    // Also verify a deeper Analytics child route (/portal/analytics/google) across collapse/expand.
    await router.push('/portal/analytics/google')
    await nextTick()
    expect([...host.querySelectorAll('a[aria-current="page"]')].map(el => el.textContent?.trim())).toEqual(['Google'])

    collapsed.value = true
    await nextTick()
    const collapsedGoogle = [...host.querySelectorAll('a[aria-current="page"]')]
    expect(collapsedGoogle).toHaveLength(1)
    expect(collapsedGoogle[0]?.getAttribute('href')).toBe('/portal/analytics?metric=leads')
    expect(collapsedGoogle[0]?.hasAttribute('data-active')).toBe(true)

    collapsed.value = false
    await nextTick()
    expect([...host.querySelectorAll('a[aria-current="page"]')].map(el => el.textContent?.trim())).toEqual(['Google'])
  })

  it('keeps strictly one current-page link across closed -> open -> closed transitions of a real collapsed workspace popover', async () => {
    const router = buildTestRouter()
    await router.push('/agency/boards/marketing')
    await router.isReady()

    const { host, collapsed } = await mountMenu(
      router,
      () => [
        [
          {
            label: 'Client Delivery',
            to: '/agency/w/client-delivery',
            defaultOpen: true,
            children: [
              { label: 'Marketing Board', to: '/agency/boards/marketing' },
              { label: 'Design Board', to: '/agency/boards/design' }
            ]
          }
        ],
        [
          { label: 'All Boards', to: '/agency/boards' }
        ]
      ],
      { initialCollapsed: false, popover: true }
    )

    // 0. Expanded: only the child board link is current.
    expect([...document.body.querySelectorAll('a[aria-current="page"]')].map(el => el.getAttribute('href')))
      .toEqual(['/agency/boards/marketing'])

    // 1. Collapsed with flyout closed: only the rail workspace link is current.
    collapsed.value = true
    await flushUi()
    let currentLinks = [...document.body.querySelectorAll('a[aria-current="page"]')]
    expect(currentLinks).toHaveLength(1)
    expect(currentLinks[0]?.getAttribute('href')).toBe('/agency/w/client-delivery')
    expect(currentLinks[0]?.className).toContain('text-primary')

    // 2. Open the real UPopover (HoverCard) flyout: only the child board link inside the flyout is current.
    const workspaceTrigger = host.querySelector<HTMLAnchorElement>('a[href="/agency/w/client-delivery"]')!
    expect(workspaceTrigger).toBeTruthy()
    workspaceTrigger.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true, pointerType: 'mouse' }))
    await flushUi()

    currentLinks = [...document.body.querySelectorAll('a[aria-current="page"]')]
    expect(currentLinks).toHaveLength(1)
    expect(currentLinks[0]?.getAttribute('href')).toBe('/agency/boards/marketing')
    expect(workspaceTrigger.getAttribute('aria-current')).toBeNull()
    expect(workspaceTrigger.className).not.toContain('text-primary')

    // 3. Close the flyout (Escape / pointerleave): rail workspace link cleanly regains the single current-page indicator.
    workspaceTrigger.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true, pointerType: 'mouse' }))
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    await flushUi()

    currentLinks = [...document.body.querySelectorAll('a[aria-current="page"]')]
    expect(currentLinks).toHaveLength(1)
    expect(currentLinks[0]?.getAttribute('href')).toBe('/agency/w/client-delivery')
    expect(workspaceTrigger.className).toContain('text-primary')

    // 4. Open flyout, then expand sidebar while open, then re-collapse: open state never gets stuck.
    workspaceTrigger.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true, pointerType: 'mouse' }))
    await flushUi()
    expect([...document.body.querySelectorAll('a[aria-current="page"]')].map(el => el.getAttribute('href')))
      .toEqual(['/agency/boards/marketing'])

    collapsed.value = false
    await flushUi()
    expect([...document.body.querySelectorAll('a[aria-current="page"]')].map(el => el.getAttribute('href')))
      .toEqual(['/agency/boards/marketing'])

    collapsed.value = true
    await flushUi()
    expect([...document.body.querySelectorAll('a[aria-current="page"]')].map(el => el.getAttribute('href')))
      .toEqual(['/agency/w/client-delivery'])
  })

  it('handles mixed-case static segments, distinct param slugs, and repeated query keys in a real Vue Router menu', async () => {
    const router = buildTestRouter()
    await router.push('/agency/AUDIO/projects?mediaType=av')
    await router.isReady()

    const { host } = await mountMenu(router, () => [
      [
        {
          label: 'Client Delivery',
          to: '/agency/w/client-delivery',
          defaultOpen: true,
          children: [
            { label: 'Marketing Board', to: '/agency/boards/marketing' }
          ]
        }
      ],
      [
        { label: 'All Boards', to: '/agency/boards' },
        { label: 'AI Chat', to: '/agency/ai/chat', exact: true },
        { label: 'Voice AI', to: '/agency/ai/chat?mode=voice', exact: true },
        { label: 'Audio Studio', to: '/agency/audio' },
        { label: 'Video Studio', to: '/agency/audio/projects?mediaType=av' },
        { label: 'Audio Projects', to: '/agency/audio/projects' }
      ]
    ])

    // Mixed-case static route resolves to Video Studio only
    let activeLinks = [...host.querySelectorAll('a[aria-current="page"]')]
    expect(activeLinks.map(el => el.textContent?.trim())).toEqual(['Video Studio'])

    // Repeated query key matches the page's scalar semantics (unfiltered list -> Audio Projects)
    await router.push('/agency/audio/projects?mediaType=av&mediaType=audio')
    await nextTick()
    activeLinks = [...host.querySelectorAll('a[aria-current="page"]')]
    expect(activeLinks.map(el => el.textContent?.trim())).toEqual(['Audio Projects'])

    // Repeated Voice AI query key matches AI Chat (scalar check `route.query.mode === 'voice'` is false)
    await router.push('/agency/ai/chat?mode=voice&mode=text')
    await nextTick()
    activeLinks = [...host.querySelectorAll('a[aria-current="page"]')]
    expect(activeLinks.map(el => el.textContent?.trim())).toEqual(['AI Chat'])

    // Mixed-case static segment with lowercase board slug matches Marketing Board
    await router.push('/agency/BOARDS/marketing')
    await nextTick()
    activeLinks = [...host.querySelectorAll('a[aria-current="page"]')]
    expect(activeLinks.map(el => el.textContent?.trim())).toEqual(['Marketing Board'])

    // Distinct uppercase board slug stays distinct from `marketing` and highlights All Boards
    await router.push('/agency/BOARDS/Marketing')
    await nextTick()
    activeLinks = [...host.querySelectorAll('a[aria-current="page"]')]
    expect(activeLinks.map(el => el.textContent?.trim())).toEqual(['All Boards'])
  })
})
