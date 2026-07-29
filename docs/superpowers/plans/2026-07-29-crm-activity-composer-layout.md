# CRM Activity Composer Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Recompose the CRM Communications & activity form into a labelled, full-width, container-responsive Nuxt UI layout without changing communication behavior.

**Architecture:** Keep `CrmCommTimeline` as the single owner of communication form state, API calls, filtering, and timeline rendering. Change only its form composition and touched-file type hygiene, protected by DOM-level tests that mount the real component with lightweight Nuxt UI controls.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, Nuxt UI v4, Tailwind CSS container queries, Vitest, happy-dom.

## Global Constraints

- Use only Nuxt UI v4 form controls and wrap every composer field in `UFormField`.
- The component must continue to work with both `/api/crm` and injected `/api/client-portal/crm`.
- Keep the existing POST, GET, DELETE, refresh, filter, timeline, and toast contracts unchanged.
- Use `@container` with `grid grid-cols-1 gap-4 @md:grid-cols-2`.
- All select, input, and textarea controls use `w-full`.
- No API, database, permission, timeline-entry, or marketing-page changes.

---

### Task 1: Protect the composer layout and behavior

**Files:**
- Create: `test/app/crmCommTimeline.test.ts`
- Inspect: `app/components/crm/CommTimeline.vue`

**Interfaces:**
- Consumes: `CrmCommTimeline` props `{ clientId: string, targetType: 'person' | 'company', targetId: string }` and injected `crmApiBase`.
- Produces: regression coverage for responsive layout, conditional direction, unchanged POST payload, successful reset/refresh, disabled empty submission, filter wiring, and timeline rendering.

- [ ] **Step 1: Write the failing DOM-level tests**

Create a happy-dom test harness that mounts the real component with:

```ts
const fetchMock = vi.fn()
Object.assign(globalThis, {
  computed,
  inject,
  reactive,
  ref,
  watch,
  useToast: () => ({ add: toastAddMock }),
  $fetch: (...args: unknown[]) => fetchMock(...args)
})
```

Use interactive stubs for `USelect`, `UInput`, `UTextarea`, `UButton`, and a labelled `UFormField`:

```ts
UFormField: {
  props: ['label', 'hint'],
  template: '<label :data-label="label" :data-hint="hint"><slot /></label>'
}
```

Assert the initial Note composer:

```ts
expect(host.querySelector('form')?.classList.contains('@container')).toBe(true)
expect(host.querySelector('.grid.grid-cols-1.gap-4.\\@md\\:grid-cols-2')).not.toBeNull()
expect(host.querySelector('[data-label="Activity type"]')?.classList.contains('@md:col-span-2')).toBe(true)
expect(host.querySelector('[data-label="Direction"]')).toBeNull()
expect(host.querySelector('[data-label="Subject"]')?.getAttribute('data-hint')).toBe('Optional')
expect(host.querySelector('[data-label="Details"] textarea')?.getAttribute('rows')).toBe('4')
expect(host.querySelectorAll('select.w-full, input.w-full, textarea.w-full')).toHaveLength(3)
expect((host.querySelector('button[type="submit"]') as HTMLButtonElement).disabled).toBe(true)
```

Change activity type to Email and assert Direction appears, the type field stops spanning, and four composer controls are full width. Enter a subject and details, submit, then assert:

```ts
expect(fetchMock).toHaveBeenCalledWith('/api/client-portal/crm/communications', {
  method: 'POST',
  body: {
    client_id: 'client-1',
    person_id: 'person-1',
    channel: 'email',
    direction: 'inbound',
    subject: 'Follow-up',
    body: 'Customer replied'
  }
})
```

Also assert the form clears, the GET refresh occurs again, the success toast fires, the filter can switch to Email, and a returned timeline entry remains rendered.

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
PATH=/opt/homebrew/bin:/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:/usr/local/bin:/usr/bin:/bin pnpm vitest run test/app/crmCommTimeline.test.ts
```

Expected: FAIL because the current composer is not a form, has no `UFormField` labels, uses unconditional two-column layout, leaves controls narrow, and renders two textarea rows.

- [ ] **Step 3: Commit the failing regression test**

```bash
git add test/app/crmCommTimeline.test.ts
git commit -m "test: cover CRM activity composer"
```

### Task 2: Implement the approved composer composition

**Files:**
- Modify: `app/components/crm/CommTimeline.vue`
- Test: `test/app/crmCommTimeline.test.ts`

**Interfaces:**
- Consumes: existing `form`, `showDirection`, `channelOptions`, `directionOptions`, `logging`, and `log()`.
- Produces: a labelled semantic form whose submission continues to call the existing `log()` function.

- [ ] **Step 1: Replace the composer template**

Replace the current log-form card with:

```vue
<form
  class="@container space-y-4 rounded-lg border border-default p-4"
  @submit.prevent="log"
>
  <div class="grid grid-cols-1 gap-4 @md:grid-cols-2">
    <UFormField
      label="Activity type"
      :class="{ '@md:col-span-2': !showDirection }"
    >
      <USelect
        v-model="form.channel"
        class="w-full"
        :items="channelOptions.slice(1)"
        value-key="value"
        size="sm"
      />
    </UFormField>
    <UFormField v-if="showDirection" label="Direction">
      <USelect
        v-model="form.direction"
        class="w-full"
        :items="directionOptions"
        value-key="value"
        size="sm"
      />
    </UFormField>
  </div>

  <UFormField label="Subject" hint="Optional">
    <UInput
      v-model="form.subject"
      class="w-full"
      placeholder="Add a short summary"
      size="sm"
    />
  </UFormField>

  <UFormField label="Details">
    <UTextarea
      v-model="form.body"
      class="w-full"
      :rows="4"
      placeholder="What happened?"
      size="sm"
    />
  </UFormField>

  <div class="flex justify-end">
    <UButton
      type="submit"
      size="sm"
      icon="i-lucide-plus"
      :loading="logging"
      :disabled="!form.subject.trim() && !form.body.trim()"
    >
      Log {{ form.channel }}
    </UButton>
  </div>
</form>
```

- [ ] **Step 2: Clean touched-file type and formatting issues**

Replace broad catch bindings with `unknown` plus a narrow error shape:

```ts
type FetchFailure = {
  data?: { statusMessage?: string }
  message?: string
}
```

Split compact multi-statement lines, retain the same error messages, and leave all request payloads unchanged.

- [ ] **Step 3: Run the focused test and verify GREEN**

Run:

```bash
PATH=/opt/homebrew/bin:/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:/usr/local/bin:/usr/bin:/bin pnpm vitest run test/app/crmCommTimeline.test.ts
```

Expected: PASS.

- [ ] **Step 4: Commit the implementation**

```bash
git add app/components/crm/CommTimeline.vue
git commit -m "fix: improve CRM activity composer layout"
```

### Task 3: Battle-test, publish, merge, and deploy

**Files:**
- Review: `app/components/crm/CommTimeline.vue`
- Review: `test/app/crmCommTimeline.test.ts`
- Review: `docs/superpowers/specs/2026-07-29-crm-activity-composer-layout-design.md`
- Review: `docs/superpowers/plans/2026-07-29-crm-activity-composer-layout.md`

**Interfaces:**
- Consumes: the completed activity composer branch.
- Produces: a merged GitHub PR and guarded Cloudflare Pages production deployment.

- [ ] **Step 1: Run targeted quality checks**

```bash
pnpm exec eslint app/components/crm/CommTimeline.vue test/app/crmCommTimeline.test.ts
pnpm exec nuxt prepare
pnpm vitest run test/app/crmCommTimeline.test.ts test/app/crmRecordFormLayout.test.ts test/app/crmRecordSidePanelFunctionality.test.ts
```

Expected: all commands pass.

- [ ] **Step 2: Run enforced repository gates**

```bash
pnpm run test:social-publishing
pnpm run test:deployment-guards
pnpm deploy:check
```

Expected: 741 social-publishing tests pass, 9 deployment-guard tests pass, and the target is `agency-dashboard / main`.

- [ ] **Step 3: Perform the mandatory pre-publication review**

Re-read every changed file and verify:

- no API path, payload property, permission, filter, delete, or timeline behavior changed;
- no raw form controls, duplicate UI sections, empty select values, or viewport-dependent grids were added;
- every composer field uses `UFormField`;
- all form controls use `w-full`;
- the submit button remains disabled for whitespace-only content;
- `git diff --check` passes.

- [ ] **Step 4: Commit the plan**

```bash
git add docs/superpowers/plans/2026-07-29-crm-activity-composer-layout.md
git commit -m "docs: plan CRM activity composer layout"
```

- [ ] **Step 5: Push and create a ready PR**

Push `fix/crm-activity-composer-layout`, create a ready PR targeting `main`, and disclose the known unrelated full-suite baseline if it remains non-green.

- [ ] **Step 6: Merge and deploy**

Merge the PR against its exact tested head SHA. Fetch `origin/main`, confirm its tree matches the tested branch, then run:

```bash
PATH=/opt/homebrew/bin:/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:/usr/local/bin:/usr/bin:/bin pnpm deploy:production
```

Expected: production build and worker-size guard pass, followed by a successful `agency-dashboard / main` Pages deployment.

- [ ] **Step 7: Verify production**

Confirm the immutable Pages deployment and `https://app.xeroflow.io/portal/crm` both return HTTP 200 with matching HTML hashes. Report the PR, merge SHA, deployment URL, tests, and rollback path.
