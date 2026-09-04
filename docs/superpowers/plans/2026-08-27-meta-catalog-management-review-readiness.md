# Meta Catalog Management and Review Readiness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Correct Meta OAuth permission truth, add production Meta catalog CRUD to Dealer Feeds, verify whether `ads_management` covers Insights reads, and submit complete `catalog_management` App Review evidence.

**Architecture:** XeroFlow keeps its existing user-token Meta OAuth connection but separates baseline consent from optional catalog consent and persists `/me/permissions` truth. A focused Nitro Meta catalog client calls Business-owned catalog edges directly, admin routes enforce ownership, and a standalone Nuxt UI component adds catalog operations to Dealer Feeds while `social-dashboard` remains the feed generator.

**Tech Stack:** Nuxt 4.4.8, Vue 3, Nuxt UI 4.9.0, Nitro, Zod 4.4.3, ofetch, Vitest 4.1.10, Meta Graph API v25.0, Cloudflare Pages.

**Spec:** `docs/superpowers/specs/2026-08-27-meta-catalog-management-review-readiness-design.md`

## Global Constraints

- Tests are written and run after implementation at the owner's explicit request; do not apply the normal test-first ordering to this plan.
- Use only Nuxt UI v4 controls for UI and wrap every form control in `UFormField`.
- Use server imports through `~~/server/utils/`; never import frontend utilities into Nitro routes.
- Request only approved baseline Meta permissions during normal connection; request `catalog_management` only from the catalog workflow.
- Store only permissions returned by Meta with status `granted`.
- Never return or log Meta access tokens, raw provider bodies, or token-bearing URLs.
- Catalog mutation routes require `admin` or `owner` and revalidate catalog ownership server-side.
- Catalog deletion requires exact-name confirmation and never uses Meta's force-delete flag.
- Preserve the existing dirty worktree. Stage only task-owned hunks and never revert unrelated edits.
- No database migration is required.
- Deploy only through `pnpm deploy:check` followed by `pnpm deploy:production`.

---

### Task 1: Correct Meta OAuth scope construction and granted-permission persistence

**Files:**
- Create: `server/utils/metaPermissions.ts`
- Modify: `server/utils/metaClient.ts`
- Modify: `server/api/agency/social/meta/connect.get.ts`
- Modify: `server/api/agency/social/meta/callback.get.ts`
- Modify: `server/api/agency/social/meta/connect-token.post.ts`
- Create: `server/api/agency/social/meta/permissions/refresh.post.ts`
- Modify: `app/composables/useMetaConnect.ts`

**Interfaces:**
- Produces: `MetaOAuthIntent`, `META_BASELINE_OAUTH_SCOPES`, `META_CATALOG_OAUTH_SCOPES`, `getMetaOAuthScopes(intent)`, `normalizeGrantedMetaPermissions(rows)`, and `getGrantedMetaPermissions(token, fetchImpl?)`.
- Changes: `getMetaAuthUrl(appId, redirectUri, state, intent?)` defaults to baseline consent.
- Changes: `useMetaConnect().connect(intent?)` accepts `'baseline' | 'catalog'` without changing existing no-argument callers.
- Persists: all `social_connections` rows sharing the same Meta user token receive the verified grant list.

- [ ] **Step 1: Add the permission contract and Meta permission lookup**

Create `server/utils/metaPermissions.ts` with the following public contract:

```ts
import { ofetch } from 'ofetch'

const META_GRAPH_BASE = 'https://graph.facebook.com/v25.0'

export type MetaOAuthIntent = 'baseline' | 'catalog'

export const META_BASELINE_OAUTH_SCOPES = [
  'ads_management',
  'pages_show_list',
  'pages_read_engagement',
  'pages_manage_ads',
  'pages_manage_metadata',
  'leads_retrieval',
  'business_management',
] as const

export const META_CATALOG_OAUTH_SCOPES = [
  ...META_BASELINE_OAUTH_SCOPES,
  'catalog_management',
] as const

export function getMetaOAuthScopes(intent: MetaOAuthIntent = 'baseline'): string[] {
  return [...(intent === 'catalog' ? META_CATALOG_OAUTH_SCOPES : META_BASELINE_OAUTH_SCOPES)]
}

export interface MetaPermissionStatus {
  permission?: string
  status?: string
}

export function normalizeGrantedMetaPermissions(rows: MetaPermissionStatus[]): string[] {
  return [...new Set(rows
    .filter(row => row.status === 'granted' && typeof row.permission === 'string')
    .map(row => row.permission!.trim())
    .filter(Boolean))].sort()
}

export async function getGrantedMetaPermissions(
  token: string,
  fetchImpl: typeof ofetch = ofetch,
): Promise<string[]> {
  const result = await fetchImpl<{ data?: MetaPermissionStatus[] }>(`${META_GRAPH_BASE}/me/permissions`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return normalizeGrantedMetaPermissions(result.data || [])
}
```

Do not accept a requested-scope fallback. A failed lookup must fail the connection with an actionable message so unverified permissions are never stored.

- [ ] **Step 2: Make the OAuth URL intent-aware**

In `server/utils/metaClient.ts`, import `getMetaOAuthScopes` and `MetaOAuthIntent`. Keep `META_MARKETING_OAUTH_SCOPES` as a deprecated compatibility alias of the baseline list so unrelated imports remain valid, and change the URL builder to:

```ts
export function getMetaAuthUrl(
  appId: string,
  redirectUri: string,
  state: string,
  intent: MetaOAuthIntent = 'baseline',
): string {
  const params = new URLSearchParams({
    client_id: appId,
    redirect_uri: redirectUri,
    state,
    scope: getMetaOAuthScopes(intent).join(','),
    response_type: 'code',
  })
  return `https://www.facebook.com/v25.0/dialog/oauth?${params.toString()}`
}
```

Do not alter the existing Meta provider-diagnostic work already present in this dirty file.

- [ ] **Step 3: Store OAuth intent in a trusted cookie**

In `connect.get.ts`, parse `getQuery(event).intent`; accept only `catalog`, otherwise use `baseline`. Store `meta_oauth_intent` beside `meta_oauth_state` with identical `httpOnly`, `sameSite`, `secure`, path, and ten-minute lifetime settings. Pass the validated intent to `getMetaAuthUrl`.

- [ ] **Step 4: Persist actual grants in the OAuth callback**

In `callback.get.ts`:

1. read and validate the `meta_oauth_intent` cookie as `baseline | catalog`;
2. delete both OAuth cookies after state validation;
3. call `getGrantedMetaPermissions(longToken.access_token)` after long-lived exchange;
4. reject the callback if the resulting list does not include `business_management` or `ads_management`;
5. persist the returned list instead of `META_MARKETING_OAUTH_SCOPES` for every ad-account row;
6. include `intent=<validated>` in the safe same-origin success redirect so the opener can refresh the correct panel.

The callback error must remain safe and must not include the token or raw request URL.

- [ ] **Step 5: Apply the same truth rule to manual tokens**

In `connect-token.post.ts`, call `getGrantedMetaPermissions(longLivedToken)` before storing any connection. Use that list for both the profile fallback row and every ad-account row. Update `scopes` in both `ON CONFLICT` branches; the existing profile fallback branch currently omits it.

- [ ] **Step 6: Add an explicit grant refresh endpoint**

Create `permissions/refresh.post.ts`. Require `MEDIA_BUYING`, validate a body containing `connectionId`, select an active Meta connection, reject expired tokens, call `getGrantedMetaPermissions`, and update every Meta row with the same `access_token`:

```sql
UPDATE social_connections
SET scopes = $1, updated_at = NOW()
WHERE platform = 'meta' AND access_token = $2
```

Return `{ scopes }` only.

- [ ] **Step 7: Extend the frontend connection composable**

Change `connect()` in `useMetaConnect.ts` to `connect(intent: 'baseline' | 'catalog' = 'baseline')` and request:

```ts
const { url } = await apiFetch<{ url: string }>(
  `/api/agency/social/meta/connect?intent=${encodeURIComponent(intent)}`,
)
```

Keep popup polling, fallback redirect, cleanup, and all existing baseline callers unchanged.

---

### Task 2: Add a safe Meta Business and product-catalog client

**Files:**
- Create: `server/utils/metaCatalogClient.ts`
- Create: `server/utils/metaCatalogAccess.ts`

**Interfaces:**
- Produces: normalized `MetaBusiness`, `MetaProductCatalog`, catalog CRUD functions, and safe `MetaCatalogProviderError`.
- Produces: `loadMetaCatalogConnection(connectionId)`, `requireMetaCatalogScope(connection)`, and `requireOwnedMetaCatalog(connection, catalogId)`.
- Consumes: `extractMetaProviderDiagnostic` from the existing Meta client and `queryOne` from the DB utility.

- [ ] **Step 1: Implement the Graph transport and normalized errors**

Create `metaCatalogClient.ts` with an injected `fetchImpl` defaulting to `ofetch`. Every request uses:

```ts
headers: { Authorization: `Bearer ${token}` }
```

Never place the access token in `query` or the URL. Define `MetaCatalogProviderError extends Error` with safe fields `httpStatus`, `code`, `subcode`, `type`, and `traceId`. Convert ofetch errors with `extractMetaProviderDiagnostic`; use the provider's short message only after removing URL-like and token-like substrings.

- [ ] **Step 2: Implement paginated Business and catalog reads**

Implement:

```ts
listMetaBusinesses(token, fetchImpl?)
// GET /me/businesses?fields=id,name&limit=100

listMetaProductCatalogs(businessId, token, fetchImpl?)
// GET /{businessId}/owned_product_catalogs
// fields=id,name,vertical,product_count,feed_count,business{id,name},owner_business{id,name}
// limit=100
```

Follow `paging.next` without reattaching query parameters. Normalize missing counts to `null`, and sort businesses/catalogs by name then ID for stable UI behavior.

- [ ] **Step 3: Implement catalog create, read, rename, and delete**

Implement these exact calls:

```ts
createMetaProductCatalog(businessId, token, { name, vertical }, fetchImpl?)
// POST /{businessId}/owned_product_catalogs body { name, vertical }

getMetaProductCatalog(catalogId, token, fetchImpl?)
// GET /{catalogId} with the normalized catalog fields

updateMetaProductCatalog(catalogId, token, { name }, fetchImpl?)
// POST /{catalogId} body { name }

deleteMetaProductCatalog(catalogId, token, fetchImpl?)
// DELETE /{catalogId}, no allow_delete_catalog_with_live_product_set
```

Create and update re-read the node so routes return a normalized catalog rather than Meta's `{ success: true }` mutation response.

- [ ] **Step 4: Add the server-side connection and ownership guard**

Create `metaCatalogAccess.ts` with:

```ts
export interface MetaCatalogConnection {
  id: string
  accountId: string
  accountName: string
  accessToken: string
  tokenExpiresAt: string | null
  scopes: string[]
}
```

`loadMetaCatalogConnection` selects only an active Meta row, normalizes array/string scope formats, and rejects expired tokens. `requireMetaCatalogScope` checks both `business_management` and `catalog_management`.

`requireOwnedMetaCatalog` loads the catalog plus the user's accessible Businesses and rejects with 403 unless `catalog.businessId` belongs to that set. It returns the normalized catalog for exact-name confirmation and mutation.

---

### Task 3: Expose admin-only catalog context and mutations

**Files:**
- Create: `server/api/admin/meta-catalogs/context.get.ts`
- Create: `server/api/admin/meta-catalogs/index.post.ts`
- Create: `server/api/admin/meta-catalogs/[catalogId].patch.ts`
- Create: `server/api/admin/meta-catalogs/[catalogId].delete.ts`

**Interfaces:**
- Consumes: Task 2 client/access functions.
- Produces: the context contract and CRUD endpoints used by `MetaCatalogManager.vue`.

- [ ] **Step 1: Implement the context endpoint**

Require `admin` or `owner`. Validate `connectionId` as a UUID and optional `businessId` as a non-empty Meta ID string. Load the connection and return a consent-state response without calling catalog edges when `catalog_management` is absent:

```ts
{
  connection: { id, accountId, accountName, scopes, tokenExpiresAt },
  businesses: [],
  selectedBusinessId: null,
  catalogs: [],
  catalogAccessGranted: false,
}
```

When access exists, list businesses, verify the requested Business is accessible, select the first stable option when absent, list its catalogs, and return `catalogAccessGranted: true`.

- [ ] **Step 2: Implement catalog creation**

Validate with Zod:

```ts
z.object({
  connectionId: z.string().uuid(),
  businessId: z.string().trim().min(1).max(64),
  name: z.string().trim().min(2).max(120),
  vertical: z.enum(['vehicles', 'commerce']),
})
```

Require role and catalog scope, verify `businessId` appears in `listMetaBusinesses`, then create and return `{ catalog }`.

- [ ] **Step 3: Implement catalog rename**

Validate `connectionId` and the 2–120-character name. Load the catalog ID with `getRouterParam`, call `requireOwnedMetaCatalog`, then rename and return `{ catalog }`.

- [ ] **Step 4: Implement safe deletion**

Validate `connectionId` and `confirmationName`. Call `requireOwnedMetaCatalog`; reject with 400 unless `confirmationName === catalog.name`. Call non-force deletion and return `{ deleted: true, catalogId }`.

Convert `MetaCatalogProviderError` to `createError` with safe `statusCode`, actionable `statusMessage`, and safe diagnostic data. A dependency refusal must tell the operator to remove active feeds, product sets, shops, or ads in Meta before retrying.

---

### Task 4: Build the Dealer Feeds Meta Catalog activation UI

**Files:**
- Create: `app/components/dealer-feeds/MetaCatalogManager.vue`
- Modify: `app/pages/agency/dealer-feeds.vue`

**Interfaces:**
- Consumes: `/api/agency/social/meta/accounts`, Task 1 catalog-intent OAuth, and Task 3 catalog routes.
- Produces: a reviewer-visible connection -> Business -> catalog workflow with create, rename, and delete modals.

- [ ] **Step 1: Build the component state and context loading**

Use `<script setup lang="ts">`, Zod, `FormSubmitEvent`, `useToast`, and `useMetaConnect`. Define local normalized account/context/catalog types. Load Meta accounts on mount, choose the first active account stably, and load context whenever connection or Business changes.

Use sentinel-free real UUID/Meta IDs; when nothing is selected, the model value is `undefined`, never an empty-string `USelectMenu` option.

- [ ] **Step 2: Build the activation status rail**

Render three compact ordered stages:

1. Meta connection
2. Business access
3. Catalog ready

Each stage uses `UBadge`, `UIcon`, semantic colors, and plain operational copy. Render `USelectMenu` controls for connection and Business inside `UFormField`, both full width. Add a `UButton` refresh action.

When catalog access is missing, show `UAlert` and a **Grant catalog access** button calling `connectMeta('catalog')`. When no connection exists, show a button/link to `/agency/social`.

- [ ] **Step 3: Build the catalog table and empty/error states**

Render `UTable` columns for name, vertical, item count, feed count, and actions. Use Nuxt UI `UEmpty` when the Business has no catalogs. Provider errors use `UAlert` with the safe trace ID when supplied. Do not render raw JSON.

- [ ] **Step 4: Build the create and rename forms**

Create controlled `UModal` forms with `@container` and `grid grid-cols-1 gap-4 @lg:grid-cols-2`. Every control is in `UFormField` and full width.

Create state:

```ts
const createSchema = z.object({
  name: z.string().trim().min(2).max(120),
  vertical: z.enum(['vehicles', 'commerce']),
})
```

Default `vertical` to `vehicles`. Rename uses a single full-width name field. Successful actions close the modal, toast **Catalog created** or **Catalog renamed**, and reload context.

- [ ] **Step 5: Build exact-name delete confirmation**

Delete uses a separate `UModal` with the catalog summary and one `UFormField`/`UInput` for `confirmationName`. Disable **Delete catalog** until the value exactly matches. Successful deletion closes, clears state, toasts **Catalog deleted**, and reloads context.

- [ ] **Step 6: Mount the component in Dealer Feeds**

Add `<DealerFeedsMetaCatalogManager />` after the existing feed list/live URL panel, within the main selected-client operations column. Do not duplicate the existing feed creation form or move unrelated sections.

The catalog manager does not require a `social-dashboard` client mapping because Meta Business ownership is independent of the selected feed workspace.

---

### Task 5: Update the public Meta feature description

**Files:**
- Modify: `app/pages/features/index.vue`
- Modify: `app/pages/features/[slug].vue`

**Interfaces:**
- Produces: accurate public copy for Meta OAuth, spend insights, and guarded catalog management.

- [ ] **Step 1: Update the feature-card summary**

Change the Meta Ads Tracking card description to mention Business-scoped vehicle catalog controls without claiming automatic feed attachment:

```text
OAuth-connected Meta spend syncing, campaign budgets, and guarded Business-scoped catalog management for vehicle inventory.
```

- [ ] **Step 2: Update the detailed Meta feature entry**

Keep four detail sections. Rename **OAuth-Connected Accounts** to **OAuth Accounts and Business Catalogs** and update its content to explain verified grants, optional catalog consent, vehicle catalog creation/renaming/deletion, and exact-name deletion safeguards. Keep Daily Spend Syncing, Budget Monitoring and Alerts, and EOM Integration unchanged except where existing copy falsely claims unsupported ad/ad-set granularity.

Do not add a MarketingNav item: catalog management is a capability within the existing Meta/Ad Spend navigation category, not a new top-level destination.

---

### Task 6: Add and run all automated tests at the end

**Files:**
- Create: `test/server/utils/metaPermissions.test.ts`
- Create: `test/server/utils/metaCatalogClient.test.ts`
- Create: `test/server/api/metaCatalogEndpoints.test.ts`
- Create: `test/app/metaCatalogManager.test.ts`
- Modify: `test/server/utils/metaClient.test.ts`
- Modify only if required by the implementation: `test/helpers/nuxtUiFormStubs.ts`

**Interfaces:**
- Verifies: all Tasks 1–5 after production code exists, per the owner's requested ordering.

- [ ] **Step 1: Test permission construction and normalization**

Cover:

```ts
expect(getMetaOAuthScopes('baseline')).not.toContain('ads_read')
expect(getMetaOAuthScopes('baseline')).not.toContain('catalog_management')
expect(getMetaOAuthScopes('catalog')).toContain('catalog_management')
expect(normalizeGrantedMetaPermissions([
  { permission: 'ads_management', status: 'granted' },
  { permission: 'ads_read', status: 'declined' },
  { permission: 'catalog_management', status: 'expired' },
])).toEqual(['ads_management'])
```

Mock the injected fetch and assert `Authorization: Bearer ...` is used while serialized results contain no token.

- [ ] **Step 2: Update the OAuth URL regression test**

Replace the old expectation that all requested scopes contain rejected permissions. Assert default URLs contain baseline scopes only and catalog-intent URLs add only `catalog_management`.

- [ ] **Step 3: Test the catalog client contract**

With injected `fetchImpl`, assert:

- Business and catalog paging follows `paging.next` once;
- create uses POST `/{business}/owned_product_catalogs` with `{ name, vertical }`;
- update uses POST `/{catalog}` with `{ name }`;
- delete uses DELETE `/{catalog}` with no force flag;
- all calls use the Authorization header;
- provider errors expose safe code/trace data and never the token.

- [ ] **Step 4: Test route authorization and deletion safety**

Mock `requireRole`, access helpers, and catalog client functions using the existing Nitro handler-test pattern. Assert:

- non-admin rejection occurs before Meta calls;
- missing catalog scope returns the context consent state but blocks mutations;
- inaccessible Business/catalog IDs return 403;
- exact-name mismatch blocks deletion;
- a matching disposable catalog invokes non-force deletion once.

- [ ] **Step 5: Test the Nuxt UI component**

Use happy-dom and the repository's Nuxt UI stubs. Assert the rendered source/DOM contains the three activation stages, catalog access action, `UFormField` labels, catalog rows, and exact-name delete behavior. Assert no `confirm(`, `alert(`, `prompt(`, raw `<select>`, raw `<input>`, or raw `<button>` is introduced by the component.

- [ ] **Step 6: Run targeted tests**

Run:

```bash
pnpm exec vitest run \
  test/server/utils/metaPermissions.test.ts \
  test/server/utils/metaCatalogClient.test.ts \
  test/server/api/metaCatalogEndpoints.test.ts \
  test/app/metaCatalogManager.test.ts \
  test/server/utils/metaClient.test.ts \
  test/server/utils/metaClientDiagnostics.test.ts \
  test/feeds/socialDashboardClient.test.ts
```

Expected: all targeted tests pass with no unhandled rejection or token-bearing output.

- [ ] **Step 7: Run proportional project verification**

Run in this order:

```bash
pnpm run typecheck
pnpm run build
pnpm deploy:check
```

Record pre-existing type errors separately from new errors. The build must pass before deployment. The deploy safety check must confirm immutable project `agency-dashboard`.

- [ ] **Step 8: Perform the required battle test**

Re-read every modified/new file end to end. Check aliases, actual-vs-requested scopes, optional consent reactivity, select values, duplicate sections, raw form elements, token leakage, ownership validation, SSR boundaries, and non-force deletion. Run `git diff --check` and inspect the complete task-owned diff.

---

### Task 7: Deploy and verify approved Meta behavior

**Files:**
- Create: `docs/integrations/meta-app-review-2026-08-27.md`

**Interfaces:**
- Consumes: verified build from Task 6 and an authenticated browser session.
- Produces: deployed feature, actual-grant evidence, lead-ingestion smoke result, and an `ads_read` decision.

- [ ] **Step 1: Deploy through the guarded command**

Run:

```bash
pnpm deploy:production
```

Do not run Wrangler directly or change the Pages project name.

- [ ] **Step 2: Reconnect Meta through the production UI**

Use an available authenticated browser surface. Open XeroFlow's Meta connection, complete visible Facebook Login, grant baseline access, and verify the production account rows show the actual grant set. If login or 2FA requires the user, pause at that screen without exposing credentials.

- [ ] **Step 3: Verify lead ingestion remains enabled**

Inspect the reconnected scope set for approved Page and lead permissions, then run a non-destructive Meta lead endpoint/status smoke check. Do not submit a real customer lead. Record whether webhook verification and existing ingestion configuration remain healthy.

- [ ] **Step 4: Verify Ads Insights without `ads_read`**

Choose a connected ad account and a month with known activity. Trigger XeroFlow's live Insights call and verify campaign name, spend, impressions, clicks, and conversions. Record HTTP/provider diagnostics without tokens.

Decision:

- success with no granted `ads_read` -> document **ads_read not required; do not resubmit**;
- explicit missing-`ads_read` provider failure -> prepare the additional review evidence described in the spec.

- [ ] **Step 5: Record the rollout evidence**

Create `docs/integrations/meta-app-review-2026-08-27.md` containing the deployed version/commit, granted scope list, lead smoke result, Insights result, safe provider trace IDs, catalog test Business name/ID, and the final `ads_read` decision. Do not include tokens, reviewer passwords, or app secrets.

---

### Task 8: Exercise catalog CRUD and submit App Review evidence

**Files:**
- Modify: `docs/integrations/meta-app-review-2026-08-27.md`

**Interfaces:**
- Consumes: deployed catalog UI, authenticated Meta test Business, and the App Review submission for app `1157550492734394`.
- Produces: a captioned end-to-end screencast and inspected `catalog_management` resubmission.

- [ ] **Step 1: Grant catalog consent in the production workflow**

From Dealer Feeds, click **Grant catalog access**, complete visible Facebook Login, return to XeroFlow, and verify `catalog_management` appears in the actual stored grant set for the selected connection.

- [ ] **Step 2: Perform reviewer-safe catalog CRUD**

In the designated disposable Business:

1. create `XeroFlow Meta Review Demo Catalog` with `vehicles` vertical;
2. verify it appears with a Meta catalog ID;
3. rename it to `XeroFlow Meta Review Demo Catalog Updated`;
4. open Delete and type the exact updated name;
5. delete it and verify it disappears.

Inspect the selected Business before creation and the catalog name before deletion. Never use an existing production catalog.

- [ ] **Step 3: Capture the continuous English-language screencast**

Record the exact login/consent/create/rename/delete sequence from the spec. Add captions or visible callouts explaining each button and the agency vehicle-inventory use case. Keep tokens, browser developer tools, unrelated customer data, and credentials out of frame.

- [ ] **Step 4: Prepare the submission notes**

Use this factual core, adjusted only for the final deployed labels:

```text
XeroFlow Agency lets authorized agency administrators manage vehicle inventory catalogs for client Businesses they administer. The user starts Facebook Login from Dealer Feeds and grants catalog_management. In XeroFlow they select their Meta Business, create a vehicle catalog, rename it, and delete the disposable catalog with exact-name confirmation. XeroFlow makes server-side Graph API calls using the long-lived user access token obtained through the visible Facebook Login flow. This flow does not use a system-user token. The attached continuous English-language screencast demonstrates login, consent, create, update, and delete end to end.
```

- [ ] **Step 5: Inspect and submit `catalog_management`**

Open the supplied Meta App Review feedback URL in the authenticated browser. Confirm:

- app ID `1157550492734394`;
- the target permission is only `catalog_management` unless Task 7 proved `ads_read` necessary;
- the video is the final captioned recording;
- reviewer credentials work and do not require unavailable 2FA;
- the test Business/catalog instructions match the recording;
- notes accurately state user-token/server-side behavior.

Only after that inspection, submit the review request. Capture the resulting submission ID/status in the integration evidence document.

- [ ] **Step 6: Commit task-owned changes in reviewable save points**

Because the worktree contains unrelated user changes, stage only new files and exact task-owned hunks. Use partial staging for `server/utils/metaClient.ts`, marketing pages, and any other pre-dirty file. Inspect every staged diff and secret-scan before committing.

Suggested commits after all tests pass:

```text
fix(meta): persist actual OAuth grants
feat(meta): add guarded product catalog management
feat(dealer-feeds): add Meta catalog activation workflow
docs(marketing): surface Meta catalog management
test(meta): cover OAuth grants and catalog lifecycle
docs(meta): record App Review verification evidence
```

Do not stage or commit unrelated dirty-worktree changes.

## Official implementation sources

- Meta permission reference: https://developers.facebook.com/docs/permissions/reference/catalog_management/
- Meta Marketing API authentication: https://developers.facebook.com/docs/marketing-apis/overview/authentication/
- Meta official Business SDK catalog creation: https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/business.py
- Meta official Business SDK catalog update/delete: https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/productcatalog.py
- Meta official Marketing API Postman workspace: https://www.postman.com/meta/facebook-marketing-api/overview
- Nuxt UI v4 component catalog: https://ui.nuxt.com/docs/components/
