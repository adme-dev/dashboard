# FigFlow private email-design transport review

Read-only review of the Pages transport in `/Users/paulgiurin/orca/workspaces/dashboard/figflow-edm-release-20261101`. No source edits, installs, builds, or test runs. `sendWebResponse` was not found under `node_modules/h3` in this worktree, so status and header preservation rest on the handler and `test/unit/emailDesignProxy.test.ts`.

## Verdict

No blocker in the three owned paths. The catch-all stays a normal `server/api` route, so Pages middleware still runs in filename order before the hop. The handler forwards the original request and does not derive an actor. A missing binding, a non-function `fetch`, or an environment other than `production` or `staging` is 503 before dispatch. A thrown hop is one redacted 503 and is not retried. The allow-list is the four private-worker routes.

This review does not enable the flag, declare `EMAIL_DESIGN`, or accept a release build. Kimi owns `workers/email-design-spike` admission and its runtime tests.

## Owned paths

- `server/api/email/design/[...path].ts`
- `nuxt.config.ts` `nitro.ignore`
- `test/unit/emailDesignProxy.test.ts`

## Middleware order

These files still wrap the catch-all, in filename order: `00-cors.ts`, `01-app-host-redirect.ts`, `02-dealer-feeds-redirect.ts`, `03-hr-privacy.ts`, `04-client-crm-access.ts`, `05-portal-security.ts`, `auth.ts`, `cfEnv.ts`, `godMode.ts`, `rbac.ts`.

`auth.ts` `publicRoutes` and `selfAuthenticatingRoutes` do not include `/api/email/design`. An unauthenticated `/api` call reaches the staff session check before this handler.

`rbac.ts` runs after auth. `POST`, `PUT`, `PATCH`, and `DELETE` from a viewer, guest, or custom read-only user are 403 unless `canBypassApplicationControl(event, 'permission')`. `/api/email/design` is not in `EXEMPT_PREFIXES`. `GET`, `HEAD`, and `OPTIONS` return before that role check.

`cfEnv.ts` calls `promoteCloudflarePlatformContext`, which assigns the same `_platform.cloudflare` object onto `context.cloudflare` (`server/utils/cfBindings.ts` lines 27–34). `setCachedCfBindings` keeps string values only. `getCachedCfObjectBinding` returns undefined. The proxy reads `event.context.cloudflare.env.EMAIL_DESIGN` on the request.

`00-cors.ts` does not treat design routes as the public-tracking exception. For other `/api` routes, an allowed `Origin` gets credentialed CORS headers, and `OPTIONS` returns 204 before the handler.

`godMode.ts` calls `getTrustedTask5DelegatedExecution`. That function returns null when the event has no Task 5 marker, before `readBody`. `acceptGodModeInternalExecution` calls `consumeGodModeInternalExecutionDelegation`, which returns null when the delegation header is absent, before `readBody`. `auth.ts` has no body read. Ordinary design requests are not body-consumed by this middleware. The proxy then does `new Request(toWebRequest(event))`.

`assertDesignMutationRequest`, `validateSession`, and the flag check remain in the four `drafts/` handlers. `nitro.ignore` is `['**/api/email/design/drafts/**']` (`nuxt.config.ts` lines 417–421), so those files leave the Pages scan. The catch-all is `server/api/email/design/[...path].ts`, outside `drafts/`, so the glob keeps it. `workers/email-design-spike/nitro.config.ts` sets `scanDirs: []` and mounts the same four handlers explicitly, plus `database-connections.ts`. That worker config does not mount Pages middleware. Direct worker entry is outside this verdict.

## Binding and environment

`FIGFLOW_EDM_DRAFT_SAVES_ENABLED` must be the string `true`. Any other value, including a boolean, is 404 and does not call `fetch` (`[...path].ts` lines 19–20). The unit test covers the absent flag.

`EMAIL_DESIGN.fetch` must be a function, and `PAGE_STUDIO_RELEASE_ENVIRONMENT` must be `production` or `staging` (lines 21–25). Otherwise the handler throws 503 `design_service_unavailable` and does not dispatch. The unit test covers a missing binding and environment values `undefined`, `preview`, and `''`.

After the clone, the handler sets `x-xeroflow-email-design-environment` from that Pages env (line 28). The unit test sends a client value of `staging` and expects `production`. There is no public URL fallback.

`wrangler.toml` sets `PAGE_STUDIO_RELEASE_ENVIRONMENT` to `production` and to `staging`. It has service blocks and no `EMAIL_DESIGN` binding. Turning the flag on without adding that binding fails closed. That is a deploy gap, and it is the behavior these three files implement.

## Response and unknown writes

`new Response(response.body, response)` copies status, headers, and the body stream. The handler then sets `cache-control` to `no-store` (lines 30–31). The unit test returns upstream 409 with `cache-control: public, max-age=60` and expects 409, `no-store`, and `{ revisionId: 'receipt' }`.

`setHeader(event, 'cache-control', 'no-store')` runs before the allow-list and binding throws (line 13). The 404 test asserts that header. The 503 tests do not.

The `try` covers the clone, the header write, `fetch`, `Response` construction, and `sendWebResponse` (lines 26–37). Any throw becomes one 503. The unit test rejects `fetch` with `Error('private service connection details')`, expects one call, and expects the response text to omit `private service`. The handler comment says the caller keeps its operation id and reconciles against the receipt contract. A lost reply and a failure while sending an already received response share that path.

## Dispatch

The path regex is `/^\/api\/email\/design\/drafts\/[0-9a-f-]{36}(\/metadata)?$/i` (line 16).

Allowed:

- `GET` or `PATCH` `/api/email/design/drafts/:id` when the metadata group did not match
- `PATCH` `/api/email/design/drafts/:id/metadata`
- `POST` exactly `/api/email/design/drafts/initialize`

`GET` metadata is refused because group 1 is set. `DELETE`, `GET initialize`, `POST publish`, and `.../secret` are 404 and do not fetch. The unit test covers those four refusals and the four forwards, including `?version=1`, cookie `auth_token=session`, origin `https://app.xeroflow.io`, and the exact JSON body.

The id pattern is 36 hex-or-hyphen characters, a superset of a UUID. The worker handlers still validate ids. The spike worker routes match this allow-list (`nitro.config.ts` lines 45–65).

## Tests and low notes

`emailDesignProxy.test.ts` mounts the handler on a private h3 app that injects `event.context.cloudflare.env`. It does not mount Pages middleware, so it does not prove auth or rbac order. Nothing in this suite asserts that `nitro.ignore` drops the four draft handlers from a Pages scan. The 503 `cache-control` header is not asserted.

`workers/email-design-spike/admission.mjs` compares `x-xeroflow-email-design-environment` to `EMAIL_DESIGN_ENVIRONMENT`. That file is Kimi's admission work and is not part of this verdict.

Parent context, not remeasured here: a Pages build on `2cfbdab98` was reported at raw 25468856 against budget 25468928. Later main measurements are a separate review.
