# Brighton Nissan Site Measurement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correlate every active Brighton Nissan provider-confirmed website enquiry with XeroFlow while removing exposed repository credentials and preserving dealer delivery.

**Architecture:** A shared Vue 2 utility creates one browser correlation attempt before the existing provider POST and mirrors accepted leads through a hardened Netlify Function. Browser telemetry is non-PII; customer data and the XeroFlow webhook secret remain server-side. The legacy data-layer monkey patch is removed after direct integration coverage is proven.

**Tech Stack:** Vue 2, JavaScript, Axios, Netlify Functions, Node's built-in test runner, Netlify CLI

**Spec:** `docs/superpowers/specs/2026-08-18-brighton-nissan-measurement-completion-design.md`

## Global Constraints

- Work in a Brighton Nissan worktree based on current `origin/master`; never edit the dirty dashboard checkout.
- Provider delivery and visible success must remain independent of XeroFlow availability.
- Only provider-accepted submissions may call `confirmLead()`.
- Browser telemetry and `dataLayer` diagnostics must contain no name, email, phone, address, message, or other PII.
- A logical retry reuses its event ID; a reset/new enquiry receives a new ID.
- Netlify target is Site ID `ce707751-c381-438d-8eaa-e735a13a42f8` and production branch `master`.
- Do not rewrite shared Git history without separate approval.

---

### Task 1: Remove embedded dependency credentials

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `src/main.js`
- Create: `scripts/security-scan.mjs`
- Test: `test/security-scan.test.mjs`

**Interfaces:**
- Consumes: local form components already present under `src/components/form-elements/`.
- Produces: `npm run security:scan`, a build that no longer downloads or imports `driveagent-ui`, and a current tree without token-bearing URLs.

- [ ] **Step 1: Write the failing secret/import test**

```js
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

test('current source has no embedded GitHub token or driveagent-ui import', () => {
  const packageSource = readFileSync('package.json', 'utf8')
  const lockSource = readFileSync('package-lock.json', 'utf8')
  const mainSource = readFileSync('src/main.js', 'utf8')
  assert.doesNotMatch(packageSource + lockSource, /ghp_[A-Za-z0-9]+|x-oauth-basic@github\.com/)
  assert.doesNotMatch(mainSource, /driveagent-ui/)
})
```

- [ ] **Step 2: Run the test and verify it fails**

Run: `node --test test/security-scan.test.mjs`
Expected: FAIL because the dependency URL and runtime import are present.

- [ ] **Step 3: Remove the unused private dependency and regenerate the lock**

Remove `driveagent-ui` from `dependencies`, remove its dynamic import and `Vue.use(DriveAgentUI.default)` from `src/main.js`, then run `npm install --package-lock-only --ignore-scripts`. Keep all locally imported `Da*` form components unchanged.

- [ ] **Step 4: Add a bounded current-tree scanner**

```js
// scripts/security-scan.mjs
import { execFileSync } from 'node:child_process'
const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' }).trim().split('\n').filter(Boolean)
const forbidden = /ghp_[A-Za-z0-9]+|x-oauth-basic@github\.com|VUE_APP_(?:STRIPE_SECRET_KEY|SQUARE_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY)/
const offenders = []
for (const file of files) {
  const source = execFileSync('git', ['show', `:${file}`], { encoding: 'utf8', maxBuffer: 20_000_000 })
  if (forbidden.test(source)) offenders.push(file)
}
if (offenders.length) throw new Error(`Forbidden credential patterns: ${offenders.join(', ')}`)
```

Add `"security:scan": "node scripts/security-scan.mjs"` to `package.json`.

- [ ] **Step 5: Verify the test, scanner, and production build**

Run: `node --test test/security-scan.test.mjs && npm run security:scan && npm run build`
Expected: PASS and a complete `dist/` build.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json src/main.js scripts/security-scan.mjs test/security-scan.test.mjs
git commit -m "security: remove embedded Brighton build credential"
```

### Task 2: Build the provider-confirmed measurement adapter

**Files:**
- Create: `src/utils/xeroflowLeadMeasurement.js`
- Create: `test/xeroflow-lead-measurement.test.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: `window.xf.captureLeadContext({ eventId, formType, formId, formName })`.
- Produces: `createLeadAttempt(metadata)`, `confirmLead(attempt, lead)`, and `resetLeadAttempt(attempt)`.

- [ ] **Step 1: Write failing adapter tests**

Tests must prove: UUID creation, reuse while pending, `captureLeadContext` before delivery, non-PII diagnostic fields, normalized Function payload, `fetch` failure resolving without throwing, and reset producing a new ID.

```js
const attempt = createLeadAttempt({ formType: 'finance', formName: 'Finance enquiry' })
assert.equal(createLeadAttempt({ formType: 'finance', attempt }).eventId, attempt.eventId)
await confirmLead(attempt, { customer: { full_name: 'Test Person', email: 'test@example.com' } })
assert.deepEqual(dataLayer.at(-1), {
  event: 'xf_provider_lead_confirmed',
  xf_browser_event_id: attempt.eventId,
  xf_form_type: 'finance'
})
assert.doesNotMatch(JSON.stringify(dataLayer), /Test Person|test@example\.com/)
```

- [ ] **Step 2: Verify the tests fail**

Run: `node --test test/xeroflow-lead-measurement.test.mjs`
Expected: FAIL because the module does not exist.

- [ ] **Step 3: Implement the adapter**

Implement an ES module that creates a crypto UUID with a timestamp/random fallback, calls `window.xf?.captureLeadContext`, retains only returned `zeroflow_*` fields, sends `{ schema_version: 1, provider: 'brighton_nissan_website', lead_id, form_id, form_name, customer, vehicle, fields, attribution, consent, submitted_at }` to `/.netlify/functions/adme-lead-mirror`, uses an 8-second `AbortController`, and catches measurement errors.

- [ ] **Step 4: Add the test command and verify**

Add `"test:measurement": "node --test test/*.test.mjs"` and run `npm run test:measurement`.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/utils/xeroflowLeadMeasurement.js test/xeroflow-lead-measurement.test.mjs package.json
git commit -m "feat: add provider-confirmed lead measurement adapter"
```

### Task 3: Harden the Netlify mirror

**Files:**
- Modify: `src/functions/adme-lead-mirror.js`
- Create: `test/adme-lead-mirror.test.mjs`

**Interfaces:**
- Consumes: the schema-version-1 browser payload from `confirmLead()` plus `XEROFLOW_LEAD_WEBHOOK_URL`, `XEROFLOW_LEAD_WEBHOOK_SECRET`, and `BRIGHTON_ALLOWED_ORIGINS`.
- Produces: authenticated XeroFlow body with `key`; always-safe browser response; no hard-coded fallback endpoint.

- [ ] **Step 1: Write failing Function contract tests**

Cover POST-only behavior, 32 KB body limit, allowed-origin enforcement, required event/form/customer identity, secret injection, eight-second upstream timeout, duplicate success passthrough, redacted 502 response, and absence of PII in `console` calls.

- [ ] **Step 2: Verify the tests fail**

Run: `node --test test/adme-lead-mirror.test.mjs`
Expected: FAIL against the wildcard-CORS, legacy-fallback Function.

- [ ] **Step 3: Implement the hardened handler**

Use exact allowlist origins `https://brightonnissan.com.au` and `https://www.brightonnissan.com.au` unless `BRIGHTON_ALLOWED_ORIGINS` supplies a comma-separated replacement. Require both XeroFlow environment variables, attach `key` server-side, forward JSON with `content-type: application/json`, and log only `{ status, code, requestId }`.

- [ ] **Step 4: Verify Function and adapter tests**

Run: `npm run test:measurement`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/functions/adme-lead-mirror.js test/adme-lead-mirror.test.mjs
git commit -m "feat: secure Brighton lead mirror function"
```

### Task 4: Instrument every active provider-success path

**Files:**
- Modify: `src/components/search/VehicleEnquiry.vue`
- Modify: `src/components/search/VehicleEnquiryGallery.vue`
- Modify: `src/components/search/CarSales/SingleFooterForm.vue`
- Modify: `src/components/search/CarSales/SingleForm.vue`
- Modify: `src/components/page-elements/ContactForm.vue`
- Modify: `src/components/page-elements/FinanceForm.vue`
- Modify: `src/components/page-elements/ServiceForm.vue`
- Modify: `src/components/page-elements/FleetForm.vue`
- Modify: `src/components/page-elements/TestDriveEnquiryForm.vue`
- Modify: `src/components/page-elements/VariantSelectEnquire.vue`
- Modify: `src/components/page-elements/RegisterForm.vue`
- Modify: `src/components/page-elements/FormOffer.vue`
- Modify: `src/views/CarEnquire.vue`
- Modify: `src/views/VariantEnquire.vue`
- Create: `scripts/verify-lead-measurement-coverage.mjs`
- Create: `test/lead-measurement-coverage.test.mjs`

**Interfaces:**
- Consumes: `createLeadAttempt()` immediately before each provider POST and `confirmLead()` only inside its accepted-success branch.
- Produces: complete active-form coverage with normalized `customer`, `vehicle`, `fields`, and provider-safe metadata.

- [ ] **Step 1: Write the failing coverage inventory test**

Create a fixed array of the fourteen files above. For each, assert it imports `createLeadAttempt` and `confirmLead`, creates an attempt before `.post(`, and calls `confirmLead` after `.then(`. Assert stock forms no longer put `username`, `phone`, or `email` in `dataLayer`.

- [ ] **Step 2: Verify the inventory test fails**

Run: `node --test test/lead-measurement-coverage.test.mjs`
Expected: FAIL with all uninstrumented paths listed.

- [ ] **Step 3: Integrate the helper consistently**

In every submit method, use this order:

```js
const leadAttempt = createLeadAttempt({
  formType: 'stock_enquiry',
  formId: this.$store.state.site.forms.carsales,
  formName: 'Stock enquiry'
})
return axios.post(providerUrl, providerBody).then((response) => {
  if (!response.data.is_valid) return
  void confirmLead(leadAttempt, {
    customer: { full_name, email, mobile },
    vehicle: { stock_number, make, model, year },
    fields: { page_url: window.location.href }
  })
  // preserve existing visible success state
})
```

For forms whose provider treats any 2xx as success, call `confirmLead()` in that existing 2xx success branch. Do not promote rejected `is_valid === false` responses.

- [ ] **Step 4: Remove PII data-layer pushes and verify coverage**

Retain only the adapter's safe `xf_provider_lead_confirmed` diagnostic. Run `npm run test:measurement`.
Expected: PASS for all paths and no PII keys in diagnostic events.

- [ ] **Step 5: Build and commit**

Run: `npm run build`.

```bash
git add src/components src/views scripts/verify-lead-measurement-coverage.mjs test/lead-measurement-coverage.test.mjs
git commit -m "feat: confirm Brighton website leads in XeroFlow"
```

### Task 5: Remove legacy interception and prepare Netlify configuration

**Files:**
- Modify: `public/index.html`
- Modify: `netlify.toml`
- Create: `docs/measurement-release.md`
- Test: `test/lead-measurement-coverage.test.mjs`

**Interfaces:**
- Consumes: direct form coverage from Task 4.
- Produces: no `dataLayer.push` monkey patch, explicit Function bundling, and a deploy/runbook with secret variable names only.

- [ ] **Step 1: Extend the failing coverage test**

Assert `public/index.html` does not assign `window.dataLayer.push` and does not contain the legacy mirror endpoint.

- [ ] **Step 2: Remove the monkey patch and verify**

Delete the inline `mirrorLead`/`dataLayer.push` replacement block. Keep GTM installation unchanged. Run `npm run test:measurement && npm run build`.

- [ ] **Step 3: Document exact Netlify variables and rollback**

Document `XEROFLOW_LEAD_WEBHOOK_URL`, `XEROFLOW_LEAD_WEBHOOK_SECRET`, `BRIGHTON_ALLOWED_ORIGINS`, server-only `STRIPE_SECRET_KEY`, server-only `SQUARE_ACCESS_TOKEN`, and which public browser keys may retain `VUE_APP_*` names. Include rollback by immutable deploy ID.

- [ ] **Step 4: Commit**

```bash
git add public/index.html netlify.toml docs/measurement-release.md test/lead-measurement-coverage.test.mjs
git commit -m "chore: prepare Brighton measurement release"
```

### Task 6: Configure, preview, and publish Netlify

**Files:**
- No source edits unless preview verification reveals a defect.

**Interfaces:**
- Consumes: a XeroFlow generic endpoint URL/secret and currently configured payment secret values.
- Produces: scoped Netlify environment, ready preview, production deploy tied to `master`, and live Function evidence.

- [ ] **Step 1: Configure Functions-only secrets without printing values**

Use Netlify API/CLI against Site ID `ce707751-c381-438d-8eaa-e735a13a42f8`. Copy existing payment values into `STRIPE_SECRET_KEY` and `SQUARE_ACCESS_TOKEN`, configure the two XeroFlow variables and origin allowlist, restrict secrets to Functions/production, then delete the old secret-prefixed `VUE_APP_*` variables after the new Function build verifies.

- [ ] **Step 2: Deploy a branch preview**

Run: `netlify deploy --build --site ce707751-c381-438d-8eaa-e735a13a42f8`
Expected: ready deploy with a unique preview URL and successful Function bundle.

- [ ] **Step 3: Browser-test preview without submitting PII**

Verify GTM/XeroFlow loads, all target forms render, `tel:` clicks emit browser telemetry, and validation failures create no confirmed mirror request.

- [ ] **Step 4: Publish through the connected production branch**

Push the reviewed commits to `master` only after all branch checks pass, wait for Netlify's connected deploy, and verify published commit, deploy ID, site ID, Function version, CSP/CORS behavior, and live `track.js` `captureLeadContext()`.

- [ ] **Step 5: Credential revocation and evidence**

Revoke every GitHub PAT found in current/history through GitHub settings; rotate payment credentials in their provider dashboards when access is available; never restore revoked values. Run current-tree, built-asset, and history scans and record only counts/credential fingerprints, never raw secrets.

- [ ] **Step 6: Controlled enquiry verification**

After operator-provided test identity is available, submit one marked test lead, verify normal provider receipt and exactly one XeroFlow lead/conversion, then mark/remove the test lead through normal CRM controls. If no test identity is supplied, leave this as an explicitly reported post-deploy verification item rather than fabricating customer data.
