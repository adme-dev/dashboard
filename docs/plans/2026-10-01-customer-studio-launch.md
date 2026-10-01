# Customer dashboard → Studio launch

Continue RND-22 on `feature/customer-studio-launch`, stacked on PR612 at
176c7e636f2d9013a7f2a77f94781c4ab6cb3f9b; current main a98b83a53c65fbb80da48e8a2348610d2c9d24bb.
Studio consumer: draft PR118, 1a50516610adb66d9c714be8a6a8ee4a25bb65a6.

- Native customer login/owner/preview entitlement is the only browser authority.
- Add a read-only managed-draft check, without creating a child session. Validate
  completed adoption against its retained initial application; validate the current
  application against the latest checkpoint independently, allowing later saves.
- Read target/checkpoint storage outside SQL locks, then reacquire native/site/CMS
  authority and compare the complete snapshot. Issue a one-use ticket in the final
  transaction only on an explicit empty-body POST, with exact Origin and rate limit.
- Keep browser launch default-off and staging-only. Dashboard projects only an
  availability boolean; storage/authority failures hide the action. No Ready claim.
- Use the existing Nuxt UI dashboard style and one primary Open Studio action.
  POST the opaque ticket to the configured central editor in the same tab, never
  putting credentials in URLs or persistent browser storage.
- Exercise PostgreSQL adoption/save and revocation races, real HTTP boundaries,
  Vue interactions, browser transport, types, lint and the Worker size guard.
- Hosted two-customer acceptance, release and enabling remain separate: actual
  isolated databases/buckets/runtimes, save/reload/reconnect/return, both surfaces,
  logout/revocation, unchanged agency/QR navigation and exact deployment receipts.

## Implemented contract

`GET /api/portal/page-studio/customer/dashboard` adds `canOpenStudio` after the
read-only managed-draft check. No JWT or handoff ticket is minted on GET. The
existing provisioning state remains separate; a previously activated managed
website can open after its original child session has expired. Native access loss
invalidates the dashboard response, including when storage also fails.

`POST /api/portal/page-studio/customer/editor` accepts exactly `{}` with the native
customer cookie and configured dashboard Origin. It derives the workspace/site,
revalidates managed storage and the current immutable checkpoint, then creates the
short-lived one-use ticket in the final locked transaction. Its response is private,
no-store and contains only the opaque ticket, configured editor origin and expiry.
The browser posts the ticket to `<editorOrigin>/customer/launch` in the same tab.
The temporary hidden transport form is removed immediately; the credential never
enters a URL or local/session storage. Visible controls use Nuxt UI.

Portal/studio document CSP adds only the exact configured native editor origin.
When native browser launch is configured, document Referrer-Policy is `origin`:
Chrome sends `Origin: null` for cross-origin POST under `no-referrer`, which the
strict Studio consumer correctly refuses. Origin-only policy reveals no path or
query. APIs and documents without the launch configuration keep `no-referrer`.
Studio's second form already uses origin-only policy.

## Configuration and rollout

No deployed flags were changed. Dashboard launch requires all of:

- `PAGE_STUDIO_CUSTOMER_BROWSER_ENABLED=true`
- `PAGE_STUDIO_CUSTOMER_EDITOR_ENABLED=true`
- `PAGE_STUDIO_PROVISIONING_ENVIRONMENT=staging`
- `PAGE_STUDIO_CONTENT_ENVIRONMENT=staging`
- Canonical, distinct HTTPS `PAGE_STUDIO_CUSTOMER_ORIGIN` and
  `PAGE_STUDIO_CUSTOMER_EDITOR_ORIGIN` matching Studio's trusted configuration.
- Actual `PAGE_STUDIO_CHECKPOINTS` and `PAGE_STUDIO_CONTENT_ROUTER` bindings with
  the retained managed target and checkpoint. Binding-shaped environment strings
  do not qualify. Existing signup origin/session configuration remains required.

The consumer still requires its own browser/workspace gates and native private
control binding. There is no deployment or release permission implied by the
boolean, and no route lets the browser choose scope, target, role or return URL.
Marketing copy describes this as a limited preview, not general availability.

## Reproducible browser fixture

Start the local Nuxt server (only local process settings; no external enablement):

```sh
PAGE_STUDIO_CUSTOMER_BROWSER_ENABLED=true \
PAGE_STUDIO_CUSTOMER_EDITOR_ENABLED=true \
PAGE_STUDIO_PROVISIONING_ENVIRONMENT=staging \
PAGE_STUDIO_CONTENT_ENVIRONMENT=staging \
PAGE_STUDIO_CUSTOMER_ORIGIN=https://customers.example.test \
PAGE_STUDIO_CUSTOMER_EDITOR_ORIGIN=https://editor.example.test \
pnpm dev --host 127.0.0.1 --port 3044
```

Then run `node scripts/verify-customer-studio-launch-browser.mjs` with installed
Chrome. The script refuses a non-local dashboard origin and intercepts all API
and fixture editor requests. It checks actual Nuxt UI/CSP, keyboard activation,
320/390/1280px widths, failed launch, unavailable/stale status and cross-origin
form fields/Origin. It uses no customer credentials and performs no hosted writes.

## Verification receipts

- 69 focused PostgreSQL/HTTP/Vue/transport tests passed before the CSP extension.
  Native cases include later saves, expired child sessions, damaged activation
  receipt/application, altered target/checkpoint, missing bytes, parent logout,
  expiry, membership revocation and a concurrent head change during R2 reads.
- 37 portal security cases pass, including default-off/production/invalid-origin
  gates and origin-only referrer behavior. Real Chrome reproduced the null-Origin
  failure before the policy fix and then passed the actual form navigation.
- Real Chrome: 1280/390/320px, keyboard POST, no credential URL, one transport POST,
  safe failed launch, unavailable action hidden and stale action unavailable.
- Review caught a stale private dashboard response after readiness failed during
  native revocation; regression tests now require 401/403 and the fix was reviewed.
- Final independent review re-read all 20 modified/new files end-to-end and found
  no outstanding blockers. Changed-file lint passes. Server TypeScript remains the
  exact 289-diagnostic baseline. App checking reports 638 diagnostics, all present
  in the HEAD-source overlay baseline; no added app diagnostic was found. The
  overlay additionally reports three expected missing new exports from the new
  launch files against old modules, which are absent in the implementation.
- Production build passed the unchanged Worker guard: raw 25,444,571 /
  25,468,928 bytes (24,357 remaining); gzip 6,945,352 / 9,750,000 bytes.
  The compiled Worker contains the new launch admission and endpoint.
- Post-build regression: 16,064 tests passed, 993 environment-dependent skips.
  The broad run passed 15,925 cases; four additional PostgreSQL suites initially
  refused the `postgres:` URI scheme before execution. With the required
  `postgresql:` scheme, all 139 cases in those four suites passed. Earlier parallel
  build/test execution hit Nuxt configuration regeneration; the post-build runs
  above supersede that tooling-race result. No application assertion failed.
- The draft PR/source/CI receipt is recorded in the canonical PRD. No deployment,
  migration, binding enablement or hosted acceptance occurred. Local fixtures
  do not prove hosted isolation.
