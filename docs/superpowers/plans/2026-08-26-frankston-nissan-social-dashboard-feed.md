# Frankston Nissan Social Dashboard Feed Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Social Dashboard generate a saleable Frankston Nissan Facebook feed with correct iMotor short links and honest exclusion evidence.

**Architecture:** Keep Social Dashboard as the feed owner. Tighten the shared Facebook validation and URL preparation pipeline, then upsert a seller-scoped Frankston Nissan feed using the existing external-feed boundary. The public serve URL is audited before Meta is repointed.

**Tech Stack:** Nuxt 3/Nitro, TypeScript, Node test runner, Supabase, Facebook vehicle XML

**Spec:** `docs/superpowers/specs/2026-08-26-frankston-nissan-feed-management-design.md`

## Global Constraints

- Work in an isolated Social Dashboard worktree on a branch created from `main`; do not modify the user's active dashboard checkout.
- Use seller reference `429f65c8-69ab-44c9-6243-c7fd59e86eb6` and no broader Frankston Motor Group inventory scope.
- Use `https://www.frankstonnissan.com.au/{condition}-cars/for-sale/{stock_number}`; never restore sitemap-prefix or make/model/year URL guessing.
- Supported iMotor conditions are exactly `new`, `demo`, and `used`.
- A Facebook price must be numeric and greater than zero; missing images remain invalid.
- Do not add a price filter that hides invalid rows before validation; exclusions must remain countable.
- Do not add a demo exclusion or product-set condition rule.
- Do not deploy Social Dashboard or mutate its production feed configuration without separate deployment/operations authorization.
- Use test-driven development: every behavior change starts with a focused failing test.

---

## Execution Setup

- [ ] **Create and enter the isolated Social Dashboard worktree**

From the clean Social Dashboard clone:

```bash
git worktree add /private/tmp/frankston-nissan-social-dashboard-feed -b fix/frankston-nissan-imotor-feed main
cd /private/tmp/frankston-nissan-social-dashboard-feed/dashboard
npm install
```

- [ ] **Verify the untouched baseline**

```bash
npm test
```

Expected: PASS before any source edit. If it fails, report the exact baseline failure and stop for direction.

---

### Task 1: Reject non-positive Facebook catalogue prices

**Files:**
- Modify: `dashboard/tests/feed-items-dealerstudio.test.mjs`
- Modify: `dashboard/server/services/validators/facebook.ts`

**Interfaces:**
- Consumes: `splitValidFeedItems(items, 'facebook')` from `dashboard/server/services/feedItems.ts`.
- Produces: `validateFacebookItem(item)` emits one `{ field: 'price', message: 'price must be a positive value' }` issue for empty, non-numeric, zero, or negative prices.

- [ ] **Step 1: Add the failing positive-price contract test**

Append this test to `dashboard/tests/feed-items-dealerstudio.test.mjs`:

```js
test('Facebook validation excludes every non-positive price and reports the price field', () => {
  const base = {
    vehicle_id: 'FN-1',
    title: '2026 Nissan Patrol Warrior',
    description: 'Available now from Frankston Nissan.',
    url: 'https://www.frankstonnissan.com.au/new-cars/for-sale/FN-1',
    make: 'Nissan',
    model: 'Patrol',
    year: 2026,
    images: ['https://example.com/FN-1.jpg'],
  }

  for (const price of ['', 'POA', 0, '0', -1]) {
    const result = splitValidFeedItems([{ ...base, price }], 'facebook')
    assert.equal(result.valid.length, 0)
    assert.equal(result.invalidSummaries.length, 1)
    assert.deepEqual(result.invalidSummaries[0].issues, [
      { field: 'price', message: 'price must be a positive value' },
    ])
  }

  const positive = splitValidFeedItems([{ ...base, price: '59990' }], 'facebook')
  assert.equal(positive.valid.length, 1)
  assert.equal(positive.invalidSummaries.length, 0)
})
```

- [ ] **Step 2: Run the focused test and verify RED**

Run from the Social Dashboard repository root:

```bash
cd dashboard
node --test tests/feed-items-dealerstudio.test.mjs
```

Expected: FAIL because `0`, `'0'`, `-1`, and `'POA'` are currently accepted when the field is non-empty.

- [ ] **Step 3: Implement the minimum Facebook price validation**

Replace `require('price', item.price)` in `dashboard/server/services/validators/facebook.ts` with:

```ts
const numericPrice = Number(String(item.price ?? '').replace(/[^0-9.-]/g, ''))
if (!Number.isFinite(numericPrice) || numericPrice <= 0) {
  issues.push({ field: 'price', message: 'price must be a positive value' })
}
```

Do not add a second required-field error for the same price; every rejected row must contribute one price issue.

- [ ] **Step 4: Run focused and full Social Dashboard tests**

```bash
cd dashboard
node --test tests/feed-items-dealerstudio.test.mjs
npm test
```

Expected: both commands PASS with no warnings introduced by this change.

- [ ] **Step 5: Review and commit the price guard**

```bash
git diff --check
git diff -- dashboard/server/services/validators/facebook.ts dashboard/tests/feed-items-dealerstudio.test.mjs
git add dashboard/server/services/validators/facebook.ts dashboard/tests/feed-items-dealerstudio.test.mjs
git commit -m "fix(feeds): reject non-positive Facebook prices"
```

---

### Task 2: Make iMotor short-link construction fail closed

**Files:**
- Modify: `dashboard/tests/feed-items-dealerstudio.test.mjs`
- Modify: `dashboard/server/services/feedItems.ts`

**Interfaces:**
- Consumes: `buildUrlFallback(mapped, raw, settings)` and `prepareFeedItems(rawVehicles, feed)`.
- Produces: iMotor URLs for `new`, `demo`, and `used`; returns `null` when iMotor condition/stock/domain is missing, condition is unsupported, or any template placeholder remains unresolved.

- [ ] **Step 1: Add failing iMotor URL tests**

Add the following tests:

```js
test('prepareFeedItems builds stable iMotor short links for new demo and used stock', () => {
  const feed = {
    name: 'Frankston Nissan Meta',
    feed_type: 'facebook',
    mappings: { rules: [] },
    platform_settings: {
      website_domain: 'www.frankstonnissan.com.au',
      link_template: 'https://{domain}/{condition}-cars/for-sale/{stock_number}',
    },
  }
  const base = {
    title: '2026 Nissan X-TRAIL',
    description: 'Available now from Frankston Nissan.',
    make: 'Nissan',
    model: 'X-TRAIL',
    year: 2026,
    price: 49990,
    photos: ['https://example.com/x-trail.jpg'],
  }

  const prepared = prepareFeedItems([
    { ...base, id: '3000569', stock_number: '3000569', condition: 'new' },
    { ...base, id: '2993335', stock_number: '2993335', condition: 'demo' },
    { ...base, id: 'U100', stock_number: 'U100', condition: 'used' },
  ], feed)

  assert.deepEqual(prepared.map(item => item.url), [
    'https://www.frankstonnissan.com.au/new-cars/for-sale/3000569',
    'https://www.frankstonnissan.com.au/demo-cars/for-sale/2993335',
    'https://www.frankstonnissan.com.au/used-cars/for-sale/u100',
  ])
})

test('iMotor URL preparation rejects unsupported conditions and missing stock IDs', () => {
  const feed = {
    name: 'Frankston Nissan Meta',
    feed_type: 'facebook',
    mappings: { rules: [] },
    platform_settings: {
      website_domain: 'www.frankstonnissan.com.au',
      link_template: 'https://{domain}/{condition}-cars/for-sale/{stock_number}',
    },
  }
  const base = {
    title: '2026 Nissan X-TRAIL',
    description: 'Available now from Frankston Nissan.',
    make: 'Nissan',
    model: 'X-TRAIL',
    year: 2026,
    price: 49990,
    photos: ['https://example.com/x-trail.jpg'],
  }

  const prepared = prepareFeedItems([
    { ...base, id: 'certified-1', stock_number: 'certified-1', condition: 'certified' },
    { ...base, id: '', stock_number: '', condition: 'new' },
  ], feed)
  const result = splitValidFeedItems(prepared, 'facebook')

  assert.equal(result.valid.length, 0)
  assert.equal(result.invalidSummaries.length, 2)
  assert.ok(result.invalidSummaries.every(summary => summary.issues.some(issue => issue.field === 'url')))
})
```

- [ ] **Step 2: Run the focused test and verify RED**

```bash
cd dashboard
node --test tests/feed-items-dealerstudio.test.mjs
```

Expected: FAIL because the current template produces `/certified-cars/` and can leave malformed URL content instead of returning `null`.

- [ ] **Step 3: Add a narrowly scoped iMotor template guard**

In `dashboard/server/services/feedItems.ts`, add these constants near `buildUrlFallback`:

```ts
const IMOTOR_LINK_TEMPLATE = 'https://{domain}/{condition}-cars/for-sale/{stock_number}'
const IMOTOR_CONDITIONS = new Set(['new', 'demo', 'used'])
```

After the `ctx` object is built and before replacement, add:

```ts
if (tpl === IMOTOR_LINK_TEMPLATE) {
  if (!domain || !ctx.stock_number || !IMOTOR_CONDITIONS.has(ctx.condition)) return null
}

const resolved = tpl.replace(
  /\{(domain|id|stock_number|vin|make|model|year|condition|color|slug)\}/g,
  (_, key) => safe((ctx as any)[key]),
)
if (/\{[^}]+\}/.test(resolved)) return null
return resolved
```

Remove the old direct `return tpl.replace(...)`. Do not apply dealer-specific restrictions to other templates.

- [ ] **Step 4: Run the focused and full test suites**

```bash
cd dashboard
node --test tests/feed-items-dealerstudio.test.mjs
npm test
```

Expected: PASS.

- [ ] **Step 5: Review and commit the iMotor guard**

```bash
git diff --check
git diff -- dashboard/server/services/feedItems.ts dashboard/tests/feed-items-dealerstudio.test.mjs
git add dashboard/server/services/feedItems.ts dashboard/tests/feed-items-dealerstudio.test.mjs
git commit -m "fix(feeds): validate iMotor short-link inputs"
```

---

### Task 3: Make stored generation use the shared preparation contract

**Files:**
- Modify: `dashboard/server/api/feeds/generate.post.ts`
- Create: `dashboard/tests/feed-generate-shared-pipeline.test.mjs`

**Interfaces:**
- Consumes: `prepareFeedItems()` and `splitValidFeedItems()` from `dashboard/server/services/feedItems.ts`.
- Produces: stored feed generation and public serving use the same price, URL, image, description, and validation rules.

- [ ] **Step 1: Add a failing source-contract test**

Create `dashboard/tests/feed-generate-shared-pipeline.test.mjs`:

```js
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const source = readFileSync(new URL('../server/api/feeds/generate.post.ts', import.meta.url), 'utf8')

test('stored feed generation uses the shared preparation and validation pipeline', () => {
  assert.match(source, /import \{[^}]*prepareFeedItems[^}]*splitValidFeedItems[^}]*\} from '~\/server\/services\/feedItems'/s)
  assert.match(source, /prepareFeedItems\(raw, feed as any\)/)
  assert.match(source, /splitValidFeedItems\(mapped, feed\.feed_type/)
  assert.doesNotMatch(source, /function buildUrlFallback\(/)
  assert.doesNotMatch(source, /applyMappings\(/)
})
```

- [ ] **Step 2: Run the new test and verify RED**

```bash
cd dashboard
node --test tests/feed-generate-shared-pipeline.test.mjs
```

Expected: FAIL because `generate.post.ts` contains its own mapping and URL fallback implementation.

- [ ] **Step 3: Replace the duplicate pipeline**

In `dashboard/server/api/feeds/generate.post.ts`:

- remove `applyMappings`, platform mapping, validator, `extractPhotoUrls`, `slugify`, and local `buildUrlFallback` imports/code;
- import the shared functions:

```ts
import { prepareFeedItems, splitValidFeedItems } from '~/server/services/feedItems'
```

- replace the manual mapping/validation block with:

```ts
const mapped = prepareFeedItems(raw, feed as any)
const { valid, invalidSummaries } = splitValidFeedItems(
  mapped,
  feed.feed_type as 'facebook' | 'google',
)
```

Keep the existing response contract (`itemCount`, `invalidCount`, stored URL/path) unchanged and set
`invalidCount: invalidSummaries.length` in the response.

- [ ] **Step 4: Run contract, focused, full, type, and lint checks**

```bash
cd dashboard
node --test tests/feed-generate-shared-pipeline.test.mjs
node --test tests/feed-items-dealerstudio.test.mjs
npm test
npm run typecheck
npm run lint
```

Expected: all commands PASS. If the repository has a pre-existing unrelated lint/type failure, capture the exact output and do not change unrelated files.

- [ ] **Step 5: Review and commit the shared pipeline**

```bash
git diff --check
git diff -- dashboard/server/api/feeds/generate.post.ts dashboard/tests/feed-generate-shared-pipeline.test.mjs
git add dashboard/server/api/feeds/generate.post.ts dashboard/tests/feed-generate-shared-pipeline.test.mjs
git commit -m "refactor(feeds): share catalogue preparation pipeline"
```

---

### Task 4: Upsert and audit the Frankston Nissan feed

**Files:**
- No repository file changes.
- Operational evidence: save sanitized command output outside git under `/private/tmp/frankston-nissan-feed-evidence/`.

**Interfaces:**
- Consumes: `POST /api/feeds/upsert-external`, `POST /api/feeds/preview`, and `GET /api/feeds/{id}/serve`.
- Produces: an active Facebook feed ID and serve URL scoped to Frankston Nissan.

- [ ] **Step 1: Stop for deployment and production-write authorization**

Present the tested Social Dashboard commits, target environment, exact upsert payload excluding credentials, and rollback path. Do not deploy or call the upsert endpoint until the user authorizes both actions.

- [ ] **Step 2: Verify the target organization before writing**

Use the authenticated Social Dashboard organization read endpoint to resolve the organization that owns Frankston Motor Group. Require one exact organization ID and record only its ID/name in the evidence directory. If no unique organization is returned, stop without writing.

- [ ] **Step 3: Preview the complete seller-scoped candidate set**

Call `/api/feeds/preview` with the verified organization context and this validation payload:

```json
{
  "filters": {
    "sellerIds": ["429f65c8-69ab-44c9-6243-c7fd59e86eb6"],
    "onlyActive": true
  },
  "limit": 100,
  "offset": 0,
  "validateForFeed": {
    "feedType": "facebook",
    "mappings": { "rules": [] },
    "platformSettings": {
      "website_domain": "www.frankstonnissan.com.au",
      "link_template": "https://{domain}/{condition}-cars/for-sale/{stock_number}",
      "currency": "AUD"
    },
    "source": { "type": "supabase" }
  }
}
```

Require `matchedTotal > 0`, `validatedTotal > 0`, and explicit invalid metadata. If the source rejects `{ "type": "supabase" }`, omit `source` and retain the seller-scoped filters; never substitute a broader source.

- [ ] **Step 4: Upsert the feed idempotently**

After authorization, build the request from the exact organization object returned in Step 2 and call
`/api/feeds/upsert-external`:

```ts
const payload = {
  "name": "Frankston Nissan — Meta Vehicles",
  "feed_type": "facebook",
  "organization_id": verifiedOrganization.id,
  "filters": {
    "sellerIds": ["429f65c8-69ab-44c9-6243-c7fd59e86eb6"],
    "onlyActive": true
  },
  "mappings": { "rules": [] },
  "platform_settings": {
    "website_domain": "www.frankstonnissan.com.au",
    "link_template": "https://{domain}/{condition}-cars/for-sale/{stock_number}",
    "currency": "AUD"
  },
  "is_active": true,
  "externalKey": "xeroflow:8b45925c-bc32-4b7c-afc1-cfc46d81c9dd:frankston-nissan:facebook",
  "externalClientId": "8b45925c-bc32-4b7c-afc1-cfc46d81c9dd"
}
```

The organization UUID is a runtime-proven value, not a guessed constant. Repeating the call must return the same feed ID with `created:false`.

- [ ] **Step 5: Audit the public serve URL**

Fetch the returned serve URL and verify:

- every `<url>` matches `https://www.frankstonnissan.com.au/(new|demo|used)-cars/for-sale/[A-Za-z0-9_-]+`;
- every `<price>` parses to a number greater than zero;
- every item contains at least one image URL;
- `X-Feed-Invalid-Items` equals the preview's `invalidTotal`;
- served count plus invalid count equals `matchedTotal`; and
- served new/demo/used counts sum to served count.

Resolve every emitted URL with redirects enabled and bounded concurrency. Each final location must be a vehicle detail
URL and must not be `/our-stock/` or a model/variant landing page. Any failure blocks Meta repointing and must be
fixed at the seller inventory source before the feed is accepted; do not hide it with a pre-validation exclusion.

- [ ] **Step 6: Hand the verified feed ID and evidence to the XeroFlow plan**

Record the exact Social Dashboard organization ID, feed ID, serve URL, candidate count, served count, invalid count, exclusion summary, and condition totals. Do not include service credentials or access tokens.
