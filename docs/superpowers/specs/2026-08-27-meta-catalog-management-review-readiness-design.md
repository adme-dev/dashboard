# Meta Catalog Management and Review Readiness — Design Spec

- **Date:** 2026-08-27
- **Status:** Approved in chat and approved for implementation on 2026-08-27
- **Owner:** XeroFlow Agency
- **Primary surface:** `/agency/dealer-feeds`

## 1. Goal

Ship a real, production-grade Meta vehicle-catalog management workflow in XeroFlow, correct the Meta OAuth permission record, verify whether the already-approved `ads_management` permission covers XeroFlow's read use case, and prepare reviewer-visible evidence for a `catalog_management` resubmission.

The implementation must satisfy all five agreed outcomes:

1. Store only permissions Meta actually granted.
2. Separate baseline Meta consent from optional catalog consent.
3. Reconnect Meta and verify Ads Insights with `ads_management`.
4. Provide catalog list, create, rename, and delete operations in XeroFlow.
5. Submit `catalog_management` with a complete recording; submit `ads_read` only if the production verification proves it is required.

## 2. Product decision

Catalog management is a genuine administrator capability within Dealer Feeds, not a reviewer-only demonstration.

`social-dashboard` remains the inventory-feed generator. XeroFlow calls the Meta Graph API directly for Business and product-catalog management because:

- the XeroFlow Meta app owns the reviewed permission;
- the visible Facebook Login and consent occur in XeroFlow;
- Meta reviewers must see catalog mutations performed on the app platform;
- catalog ownership belongs to Meta Business, while generated vehicle-feed ownership remains in `social-dashboard`.

The integration boundary is therefore:

```text
social-dashboard inventory source
  -> generated Facebook vehicle feed URL
  -> XeroFlow Dealer Feeds
  -> Meta product catalog selected or created in XeroFlow
  -> operator imports/attaches the feed using the existing activation workflow
```

This slice manages the catalog container. It does not automatically attach, schedule, or upload the generated feed to Meta because Meta App Review specifically requires catalog create/update/delete and those additional mutations are not needed to pass the current review.

## 3. Permission model

### 3.1 Baseline scopes

Normal Meta connection requests only production-approved permissions:

- `ads_management`
- `pages_show_list`
- `pages_read_engagement`
- `pages_manage_ads`
- `pages_manage_metadata`
- `leads_retrieval`
- `business_management`

`public_profile` is implicit in Facebook Login and is not duplicated in the explicit scope list.

`ads_read` is removed from the baseline request. Meta's permission reference states that `ads_management` lets the app read and manage an accessible Ads account and fetch ad metrics. XeroFlow verifies the real token and endpoints after deployment before deciding whether `ads_read` needs another submission.

`catalog_management` is excluded from baseline consent. It is requested only when an administrator begins the Meta Catalog workflow.

### 3.2 Feature-scoped catalog consent

The Meta Catalog panel has a **Grant catalog access** action when the selected connection lacks `catalog_management`. That action starts the same CSRF-protected OAuth code flow with baseline scopes plus `catalog_management`.

OAuth state stores a signed or server-held intent value identifying `baseline` or `catalog`. The callback never trusts a return URL supplied by the browser. Both intents return through the existing same-origin callback page, and the opener refreshes account state after completion.

### 3.3 Granted-permission truth

After token exchange, the server calls Meta's user-permissions edge and stores only permissions whose status is `granted`. Declined, expired, and rejected permissions are excluded.

The same permission lookup is used by:

- the OAuth callback;
- manual token connection;
- a permission refresh endpoint used after reconnecting;
- catalog API guards.

The database schema does not change: `social_connections.scopes` continues to store a string array/JSON-compatible array. All ad-account rows sharing the user token receive the same verified grant set.

The UI must never infer a grant from the requested scope list.

## 4. Meta Graph client boundary

Create a focused server utility for Meta Business and catalog operations. It accepts an access token and returns normalized objects without exposing the token in errors or logs.

### 4.1 Normalized types

```ts
export interface MetaBusiness {
  id: string
  name: string
}

export interface MetaProductCatalog {
  id: string
  name: string
  vertical: string
  productCount: number | null
  feedCount: number | null
  businessId: string
  businessName: string | null
}
```

### 4.2 Operations

- `getGrantedMetaPermissions(token)` — reads the user's permission statuses and returns granted names.
- `listMetaBusinesses(token)` — lists businesses the connected user can administer.
- `listMetaProductCatalogs(businessId, token)` — reads `/{business-id}/owned_product_catalogs` and follows paging.
- `createMetaProductCatalog(businessId, token, { name, vertical })` — posts to the owned-product-catalog edge.
- `updateMetaProductCatalog(catalogId, token, { name })` — posts the new name to the catalog node.
- `deleteMetaProductCatalog(catalogId, token)` — deletes the catalog node without force flags.

Creation supports the verticals returned by Meta's current ProductCatalog enum but the Dealer Feeds UI defaults to `vehicles` and labels it **Vehicle inventory**. For the first product slice, the UI also offers **Commerce products** (`commerce`) so the capability is useful outside automotive without adding new API behavior.

Deletion never sends `allow_delete_catalog_with_live_product_set=true`. If Meta refuses deletion because a catalog has active feeds, product sets, shops, or ads, XeroFlow surfaces the provider's safe error and directs the operator to remove those dependencies in Meta first.

All Meta calls use Graph API `v25.0`, matching the existing client. Provider errors are normalized to status, code, subcode, type, trace ID, and an actionable message; access tokens and request URLs are never returned to the browser.

## 5. Server API

All routes require `admin` or `owner`. They load a selected active `social_connections` row with `platform='meta'`, reject expired tokens, verify `business_management`, and verify `catalog_management` before catalog mutations.

Routes:

```text
GET    /api/admin/meta-catalogs/context?connectionId=<uuid>
POST   /api/admin/meta-catalogs
PATCH  /api/admin/meta-catalogs/:catalogId
DELETE /api/admin/meta-catalogs/:catalogId
POST   /api/agency/social/meta/permissions/refresh
```

`context` returns:

```ts
{
  connection: { id, accountId, accountName, scopes, tokenExpiresAt },
  businesses: MetaBusiness[],
  selectedBusinessId: string | null,
  catalogs: MetaProductCatalog[],
  catalogAccessGranted: boolean
}
```

The query may include `businessId`; when absent, the first business is selected deterministically by name then ID. The browser reloads context with a different `businessId` when the operator changes Business.

Mutation validation uses Zod:

- create: `connectionId`, `businessId`, trimmed name of 2–120 characters, vertical in the supported allowlist;
- update: `connectionId`, trimmed name of 2–120 characters;
- delete: `connectionId`, `confirmationName` exactly matching the current catalog name.

Before update or delete, the server reads the catalog node and verifies that its owner business appears in the connected user's accessible businesses. Browser-supplied catalog IDs are never treated as authorization.

No catalog tokens, raw Meta bodies, or app secrets appear in responses, logs, query strings, or audit metadata.

## 6. Dealer Feeds UI

Create `app/components/dealer-feeds/MetaCatalogManager.vue` and mount it as a dedicated panel beneath the existing feed list. Keeping the component separate prevents the already-large Dealer Feeds page from absorbing another state machine.

### 6.1 Information hierarchy

The panel is an operational activation sequence, not a generic settings card:

```text
Meta catalog activation
  1 Connection  ->  2 Business  ->  3 Catalog

  [Meta connection selector] [Business selector] [Refresh]

  Catalogs for <Business>
  ---------------------------------------------------------
  Name             Vertical       Items       Actions
  Dealer Demo      Vehicles       0           Rename  Delete
  ---------------------------------------------------------
  [Create Meta catalog]
```

The numbered structure is justified because consent, Business selection, and catalog management are genuinely ordered dependencies.

The aesthetic follows the existing Dealer Feeds operations surface: semantic Nuxt UI colors, compact data typography, quiet borders, and one signature status rail showing the three activation stages. It does not introduce new fonts, hard-coded colors, gradients, or decorative animation.

### 6.2 Forms

All fields use Nuxt UI v4 controls:

- `USelectMenu` for connection and Business selection;
- `UForm` with Zod state and `UFormField` labels;
- `UInput` for catalog names;
- `USelect` for vertical;
- `UButton` for actions;
- `UTable` for catalog rows;
- `UModal` for create, rename, and delete workflows;
- `useToast()` for successful and failed mutations.

Forms use `grid grid-cols-1 gap-4` and only expand with container-query variants in modal content. Controls are full width. No raw form elements or browser dialogs are introduced.

### 6.3 Consent and empty states

- No Meta connection: explain that a Meta account must be connected and link to Connections.
- Missing `catalog_management`: show the approved dependency status and a primary **Grant catalog access** button.
- No Business returned: explain that the Facebook user must be an administrator of a Meta Business.
- No catalogs: invite the administrator to create the first catalog.
- Provider refusal: show the actionable Meta message and trace ID when present.

### 6.4 Destructive action

Delete opens a `UModal` showing catalog name, Business, vertical, and item count. The operator must type the exact catalog name. The Delete button remains disabled until it matches. XeroFlow never automatically retries deletion with force options.

## 7. Ads Insights verification

After deploying the OAuth correction:

1. Reconnect a Meta account through the visible Facebook Login flow.
2. Refresh and display the actual grant set.
3. Call XeroFlow's live Meta Insights endpoint for an account and month with known activity.
4. Verify campaign name, spend, impressions, clicks, and conversions are returned.
5. Record the Graph error code/subcode if the call fails.

Decision rule:

- If Insights succeeds with `ads_management` and without a granted `ads_read`, remove `ads_read` from App Review work and document it as unnecessary.
- If Meta explicitly rejects the Insights call for missing `ads_read`, restore it only to the feature-scoped review request and prepare a new end-to-end screencast.

An empty data month is not proof of permission success. The verification must use an account/month with known activity or directly confirm a successful provider response with zero rows and no provider permission error.

## 8. App Review evidence

### 8.1 `catalog_management`

Use a connected administrator of a disposable Meta Business or a Business where a disposable catalog is safe. Record one continuous English-language flow:

1. Start logged out of Facebook with XeroFlow's Meta connection absent or disconnected.
2. Sign into XeroFlow and open Dealer Feeds.
3. Click **Grant catalog access**.
4. Complete Facebook Login and grant the requested access.
5. Return to the Meta Catalog panel and select the Business.
6. Create `XeroFlow Meta Review Demo Catalog` with Vehicle inventory vertical.
7. Rename it to `XeroFlow Meta Review Demo Catalog Updated`.
8. Open Delete, type the exact updated name, and delete it.
9. Show the empty/list state confirming deletion.

Captions explain each button, the Business relationship, and why the agency manages vehicle catalogs. Submission notes state that XeroFlow makes server-side Graph calls using the long-lived user access token obtained through the visible Facebook Login flow and does not use a system-user token for this flow.

The final target, text, selected permission, video, reviewer credentials, and test Business are inspected before submission.

### 8.2 `ads_read`

No submission is created unless the verification rule in section 7 fails specifically because `ads_read` is absent.

## 9. Security and failure handling

- Existing OAuth state validation remains mandatory and is extended with server-trusted intent.
- Catalog IDs and Business IDs are treated as untrusted input.
- Admin/owner role is checked server-side for every route.
- Catalog ownership is revalidated before update/delete.
- Tokens never leave Nitro and never appear in browser responses.
- Provider errors are redacted through the existing Meta diagnostic pattern.
- Deletion is non-force, exact-name confirmed, and never performed against a production catalog for review evidence.
- The App Review submission is an external side effect and receives a final payload inspection immediately before submission.

## 10. Testing and verification

At the owner's request, automated tests are written and run after implementation rather than test-first.

Coverage includes:

- scope construction for baseline and catalog intent;
- granted-permission normalization for granted, declined, and expired statuses;
- OAuth callback persistence of actual grants;
- manual token persistence of actual grants;
- Meta catalog client request method, path, body, pagination, and redacted errors;
- route authentication, validation, ownership checks, and exact-name deletion;
- UI use of Nuxt UI controls, consent state, CRUD state, disabled delete confirmation, and error copy;
- existing Meta client and Dealer Feeds regression tests;
- type checking and the production build;
- authenticated browser smoke test against the deployed environment.

The repository's pre-commit battle test is performed after implementation: every changed file is reread, aliases and UI values are checked, SSR/server boundaries are checked, and no unrelated dirty-worktree changes are staged.

## 11. Marketing-page sync

Update the existing Meta Ads Tracking and Dealer Feeds feature descriptions rather than creating a duplicate feature category:

- `app/pages/features/index.vue`
- `app/pages/features/[slug].vue`
- `app/components/MarketingNav.vue` only if the current feature is already present in a relevant mega-menu group
- other feature-count or comparison copy only when the existing counts are literal and changed by this capability

Public copy describes Business-scoped catalog creation, renaming, deletion safeguards, and vehicle-feed activation without claiming automated feed attachment that this slice does not provide.

## 12. Deployment and rollout

1. Run targeted tests, type checking, and build after implementation.
2. Run `pnpm deploy:check`.
3. Deploy only with `pnpm deploy:production`.
4. Reconnect the selected Meta account so approved lead/page permissions and verified scopes are stored.
5. Verify Meta lead ingestion remains healthy.
6. Run the Ads Insights verification.
7. Exercise catalog CRUD only with the designated disposable review catalog.
8. Record the screencast.
9. Inspect and submit the `catalog_management` review request.

No database migration is required.

## 13. Official sources

- Meta permission requirements: https://developers.facebook.com/docs/permissions/reference/catalog_management/
- Meta Marketing API authentication: https://developers.facebook.com/docs/marketing-apis/overview/authentication/
- Meta official Marketing API Postman workspace: https://www.postman.com/meta/facebook-marketing-api/overview
- Meta official Business SDK catalog creation edge and parameters: https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/business.py
- Meta official Business SDK catalog update/delete behavior: https://github.com/facebook/facebook-python-business-sdk/blob/main/facebook_business/adobjects/productcatalog.py
- Nuxt UI v4 components and accessibility foundation: https://ui.nuxt.com/docs/components/

## 14. Explicit non-goals

- Automatically upload vehicle items to Meta.
- Automatically attach or schedule a `social-dashboard` feed in Meta.
- Force-delete catalogs with live product sets or ads.
- Create a reviewer-only fake workflow.
- Resubmit `ads_read` without a provider error proving it is necessary.
- Refactor unrelated Meta diagnostics, Dealer Feeds architecture, or existing dirty-worktree changes.
