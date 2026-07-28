# Portal Agency Preview Settings Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make agency-opened portal settings read-only and clearly identified while improving the real-client profile form composition.

**Architecture:** Add an explicit `agencyAccess` flag to the authenticated client-user contract, derived from the reserved proxy email domain. Enforce read-only behavior at the profile API boundary and render separate agency-preview and client-profile branches in the settings page.

**Tech Stack:** Nuxt 4, Vue 3 Composition API, Nuxt UI v4, Nitro, Vitest, Neon Postgres authentication model

## Global Constraints

- Use Nuxt UI v4 components for all UI controls.
- Wrap every editable profile field in `UFormField`.
- Preserve full-width portal page content and responsive mobile behavior.
- Never render the reserved `@portal-access.local` email in the settings UI.
- Keep server imports on the `~~/server/` alias.

---

### Task 1: Explicit agency-access authentication contract

**Files:**
- Modify: `server/utils/clientAuth.ts`
- Modify: `server/api/portal/auth/me.get.ts`
- Modify: `app/composables/usePortalAuth.ts`
- Modify: `app/types/index.ts`
- Test: `test/server/utils/clientAuth.test.ts`
- Test: `test/server/api/portalAuthMe.test.ts`

**Interfaces:**
- Produces: `ServerClientUser.agencyAccess: boolean`
- Produces: `ClientUser.agencyAccess: boolean`
- Produces: `/api/portal/auth/me.user.agencyAccess: boolean`

- [ ] **Step 1: Write failing authentication tests**

Add assertions that an `@portal-access.local` database row authenticates with `agencyAccess: true`, a normal email authenticates with `false`, and the auth-me response exposes the value.

- [ ] **Step 2: Run tests and verify the missing property fails**

Run: `pnpm vitest run test/server/utils/clientAuth.test.ts test/server/api/portalAuthMe.test.ts`

Expected: assertions for `agencyAccess` fail because the property is not returned.

- [ ] **Step 3: Implement the authentication contract**

Add the boolean property to server and client types, derive it once in `requireClientAuth`, return it from auth-me, and map it in `usePortalAuth.fetchUser()`.

- [ ] **Step 4: Run focused tests**

Run: `pnpm vitest run test/server/utils/clientAuth.test.ts test/server/api/portalAuthMe.test.ts`

Expected: all tests pass.

### Task 2: Protect agency proxy profiles

**Files:**
- Modify: `server/api/portal/profile.put.ts`
- Test: `test/server/api/portalProfile.test.ts`

**Interfaces:**
- Consumes: `ServerClientUser.agencyAccess`
- Produces: HTTP 403 with `Agency preview profiles are read-only`

- [ ] **Step 1: Write the failing mutation test**

Add a test that supplies `agencyAccess: true`, calls the handler with a valid profile body, expects status 403, and asserts the database update is not called.

- [ ] **Step 2: Run the test and verify it fails**

Run: `pnpm vitest run test/server/api/portalProfile.test.ts`

Expected: the database mock is called instead of a 403 rejection.

- [ ] **Step 3: Add the authorization guard**

Reject immediately after authentication when `clientUser.agencyAccess` is true.

- [ ] **Step 4: Run the focused test**

Run: `pnpm vitest run test/server/api/portalProfile.test.ts`

Expected: all tests pass.

### Task 3: Compose the settings experience

**Files:**
- Modify: `app/pages/portal/settings.vue`
- Create: `test/app/portalSettingsComposition.test.ts`

**Interfaces:**
- Consumes: `ClientUser.agencyAccess`
- Preserves: `saveProfile(): Promise<void>` for real client users
- Preserves: module destinations in `permissionModules`

- [ ] **Step 1: Write the failing settings contract test**

Read the Vue source and assert it contains an `agencyAccess` branch, the `Agency preview` copy, `UFormField` fields, a normal-client form branch, and no interpolation of `user?.email` in the agency summary.

- [ ] **Step 2: Run the contract test and verify it fails**

Run: `pnpm vitest run test/app/portalSettingsComposition.test.ts`

Expected: agency-preview and form-composition assertions fail.

- [ ] **Step 3: Implement the responsive UI**

Add an agency preview `UAlert`, render a read-only identity card for agency sessions, convert normal profile fields to `UFormField`, place Profile and Account in a responsive upper grid, and keep Portal Access full width below.

- [ ] **Step 4: Run the settings and width tests**

Run: `pnpm vitest run test/app/portalSettingsComposition.test.ts test/app/portalContentWidth.test.ts`

Expected: all tests pass.

### Task 4: Battle test and ship

**Files:**
- Review: every file modified by Tasks 1–3

**Interfaces:**
- Consumes: all prior task outputs
- Produces: verified branch ready for review and deployment

- [ ] **Step 1: Run focused regression tests**

Run: `pnpm vitest run test/server/utils/clientAuth.test.ts test/server/api/portalAuthMe.test.ts test/server/api/portalProfile.test.ts test/app/portalSettingsComposition.test.ts test/app/portalContentWidth.test.ts`

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck`

- [ ] **Step 3: Run the production build**

Run: `pnpm build`

- [ ] **Step 4: Perform the pre-commit deep-dive review**

Re-read every changed file, check server aliases, form components, responsive states, authorization enforcement, synthetic-email leakage, and module routes.

- [ ] **Step 5: Commit and publish through the project workflow**

Commit the reviewed changes, push the branch, open a pull request, merge after checks pass, deploy with `pnpm deploy:production`, and verify `/portal/settings` on the custom domain.
