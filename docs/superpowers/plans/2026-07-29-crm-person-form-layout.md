# CRM Person Form Layout Implementation Plan

> **For Codex:** Execute this plan inline using the executing-plans and test-driven-development workflows.

**Goal:** Make the CRM person editor slideover wider and give its record and contact-preference fields a professional, container-responsive layout without changing data or save behavior.

**Architecture:** Keep the existing Nuxt UI `USlideover`, `UFormField`, and form controls. Override only the slideover content width, then make each form its own Tailwind container so one-column/two-column decisions respond to the panel width rather than the browser viewport.

**Tech Stack:** Nuxt 4, Vue 3, Nuxt UI v4, Tailwind CSS, Vitest.

---

### Task 1: Lock the CRM editor layout contract with a failing test

**Files:**
- Create: `test/app/crmRecordFormLayout.test.ts`
- Inspect: `app/components/crm/RecordSlideover.vue`
- Inspect: `app/components/crm/RecordForm.vue`
- Inspect: `app/components/crm/ContactPrefs.vue`

**Step 1: Write the failing layout-contract test**

Create a DOM-level component regression test with lightweight Nuxt UI stubs that asserts:

- the record slideover overrides Nuxt UI's default width with `sm:max-w-xl`;
- the record form establishes a container and uses responsive one-to-two-column grids;
- the owner field spans both columns only at the matching container breakpoint;
- text, select, and tag controls fill their grid cells;
- contact preferences use a container-responsive grid and full-width controls;
- the previous unconditional two-column grid classes are absent.

**Step 2: Run the focused test and verify it fails**

Run:

```bash
PATH=/opt/homebrew/bin:/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:/usr/local/bin:/usr/bin:/bin pnpm vitest run test/app/crmRecordFormLayout.test.ts
```

Expected: FAIL because the slideover width override and responsive layout classes do not exist yet.

### Task 2: Implement the approved Nuxt UI layout

**Files:**
- Modify: `app/components/crm/RecordSlideover.vue`
- Modify: `app/components/crm/RecordForm.vue`
- Modify: `app/components/crm/ContactPrefs.vue`
- Test: `test/app/crmRecordFormLayout.test.ts`

**Step 1: Widen the record slideover**

Add the Nuxt UI `ui.content` override to `USlideover`:

```vue
:ui="{ content: 'sm:max-w-xl' }"
```

This preserves full-width mobile behavior and provides enough room for paired fields on larger screens.

**Step 2: Make the record form container-responsive**

- Add `@container` to the form root.
- Replace unconditional `grid-cols-2` field grids with `grid-cols-1 @lg:grid-cols-2`.
- Change the owner field span to `@lg:col-span-2`.
- Add `w-full` to each text, select-menu, and tags control.
- Leave checkbox controls compact.

**Step 3: Make contact preferences container-responsive**

- Add `@container` to the component root.
- Use `grid-cols-1 @md:grid-cols-2` for the preferred-channel and best-time controls.
- Add `w-full` to both controls.
- Leave contact suppression behavior unchanged.

**Step 4: Run the focused test and verify it passes**

Run:

```bash
PATH=/opt/homebrew/bin:/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin:/usr/local/bin:/usr/bin:/bin pnpm vitest run test/app/crmRecordFormLayout.test.ts
```

Expected: PASS.

### Task 3: Battle-test and commit

**Files:**
- Review: `app/components/crm/RecordSlideover.vue`
- Review: `app/components/crm/RecordForm.vue`
- Review: `app/components/crm/ContactPrefs.vue`
- Review: `test/app/crmRecordFormLayout.test.ts`

**Step 1: Run targeted lint**

Run:

```bash
pnpm exec eslint app/components/crm/RecordSlideover.vue app/components/crm/RecordForm.vue app/components/crm/ContactPrefs.vue test/app/crmRecordFormLayout.test.ts
```

Expected: PASS.

**Step 2: Refresh Nuxt generated types**

Run:

```bash
pnpm exec nuxt prepare
```

Expected: PASS.

**Step 3: Run required project gates**

Run:

```bash
pnpm run test:social-publishing
pnpm run test:deployment-guards
```

Expected: PASS.

**Step 4: Perform the mandatory pre-commit review**

Re-read every changed file end-to-end and verify:

- no data-model, API, validation, or save-flow behavior changed;
- every edited form field uses Nuxt UI and `UFormField`;
- container breakpoints replace viewport-dependent layout decisions;
- all relevant controls use `w-full`;
- no duplicate UI sections or imports were introduced;
- no empty-string `USelectMenu` values or reactivity regressions were introduced.

**Step 5: Commit**

```bash
git add app/components/crm/RecordSlideover.vue app/components/crm/RecordForm.vue app/components/crm/ContactPrefs.vue test/app/crmRecordFormLayout.test.ts docs/superpowers/plans/2026-07-29-crm-person-form-layout.md
git commit -m "fix: improve CRM person form layout"
```

Expected: one focused implementation commit following the already-committed design specification.
