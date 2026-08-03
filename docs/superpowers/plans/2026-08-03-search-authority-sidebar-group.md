# Search Authority Sidebar Group Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the single agency-sidebar Search Authority link with an expandable Overview/Connections group.

**Architecture:** Keep navigation construction in the existing `searchAuthorityNavItems` helper. Pass the current agency route into the helper so it can return one Nuxt UI v4 trigger with deterministic child destinations and route-aware default expansion; retain all permission and feature-flag gates in the agency layout.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, Nuxt UI v4 `NavigationMenuItem`, TypeScript, Vitest, ESLint.

## Global Constraints

- Preserve the existing `canAccessMediaBuying` permission boundary.
- Preserve the existing public Search Authority feature flag.
- Keep the group in the **Budget Tracker** agency-sidebar section.
- Do not change client-portal navigation, route middleware, API access, public marketing navigation, or feature entitlements.
- Use Nuxt UI v4 navigation structures; do not introduce raw navigation markup.

---

### Task 1: Add the route-aware Search Authority navigation group

**Files:**
- Modify: `app/utils/searchAuthorityNavigation.ts`
- Modify: `app/layouts/agency.vue`
- Test: `test/app/searchAuthorityConnections.test.ts`

**Interfaces:**
- Consumes: `searchAuthorityNavItems(enabled: boolean, currentPath: string, close: () => void)` arguments from the agency layout.
- Produces: one `NavigationMenuItem` trigger containing Overview and Connections children when enabled, or an empty array when disabled.

- [ ] **Step 1: Write the failing navigation-contract tests**

Replace the existing navigation assertion with route-aware behavior assertions:

```ts
it('only contributes agency navigation when presentation gating is enabled', () => {
  const close = vi.fn()
  expect(searchAuthorityNavItems(false, '/agency/search-authority', close)).toEqual([])

  expect(searchAuthorityNavItems(true, '/agency/search-authority/connections', close)).toEqual([
    expect.objectContaining({
      label: 'Search Authority',
      icon: 'i-lucide-search-check',
      type: 'trigger',
      defaultOpen: true,
      children: [
        expect.objectContaining({
          label: 'Overview',
          to: '/agency/search-authority',
          onSelect: close
        }),
        expect.objectContaining({
          label: 'Connections',
          to: '/agency/search-authority/connections',
          onSelect: close
        })
      ]
    })
  ])
})

it.each([
  ['/agency/search-authority', true],
  ['/agency/search-authority/connections', true],
  ['/agency/search-authority/content/example', true],
  ['/agency/analytics', false]
])('sets route-aware expansion for %s', (currentPath, defaultOpen) => {
  const [item] = searchAuthorityNavItems(true, currentPath, vi.fn())
  expect(item?.defaultOpen).toBe(defaultOpen)
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
pnpm exec vitest run test/app/searchAuthorityConnections.test.ts
```

Expected: FAIL because the existing helper accepts no route argument and returns a direct link without `type`, `defaultOpen`, or `children`.

- [ ] **Step 3: Implement the minimal grouped navigation helper**

Update `app/utils/searchAuthorityNavigation.ts`:

```ts
import type { NavigationMenuItem } from '@nuxt/ui'

const SEARCH_AUTHORITY_PATH = '/agency/search-authority'

export function searchAuthorityNavItems(
  enabled: boolean,
  currentPath: string,
  close: () => void
): NavigationMenuItem[] {
  if (!enabled) return []

  return [{
    label: 'Search Authority',
    icon: 'i-lucide-search-check',
    type: 'trigger',
    defaultOpen: currentPath === SEARCH_AUTHORITY_PATH
      || currentPath.startsWith(`${SEARCH_AUTHORITY_PATH}/`),
    children: [{
      label: 'Overview',
      to: SEARCH_AUTHORITY_PATH,
      onSelect: close
    }, {
      label: 'Connections',
      to: `${SEARCH_AUTHORITY_PATH}/connections`,
      onSelect: close
    }]
  }]
}
```

Update the call in `app/layouts/agency.vue`:

```ts
...searchAuthorityNavItems(
  Boolean(runtimeConfig.public.searchAuthorityEnabled),
  route.path,
  close
)
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
pnpm exec vitest run test/app/searchAuthorityConnections.test.ts test/server/api/portalSearchAuthorityAvailability.test.ts
```

Expected: 2 test files pass with no failures. The portal test guards against accidental changes to client availability behavior.

- [ ] **Step 5: Lint and perform the pre-commit review**

Run:

```bash
pnpm exec eslint app/utils/searchAuthorityNavigation.ts app/layouts/agency.vue test/app/searchAuthorityConnections.test.ts
git diff --check
```

Then reread all three modified files. Confirm the helper call order matches its signature, disabled output remains empty, Overview and Connections are not duplicated elsewhere in the agency sidebar, and no portal or feature-entitlement code changed.

- [ ] **Step 6: Commit the implementation**

```bash
git add app/utils/searchAuthorityNavigation.ts app/layouts/agency.vue test/app/searchAuthorityConnections.test.ts
git commit -m "feat: group Search Authority sidebar navigation"
```

