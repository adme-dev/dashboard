# FigFlow design-worker runtime suite review

Read-only review of `test/integration/emailDesignWorker.database.test.ts` in `/Users/paulgiurin/orca/workspaces/dashboard/figflow-edm-release-20261101`. No edits, no suite run, no database connection, no artifact hash. Parent reported that this opt-in suite passed four tests on a pre-admission spike, and that Kimi's wrapper rerun is still ahead. This review judges what those four tests can support.

## Verdict

No reliability defect that contradicts a real opt-in pass of these four tests. The suite does exercise Miniflare, a disposable local database, the four design routes, a fail-closed renderer binding, idempotent replay, a stale 409, session rejection, and leftover connections. Several parent phrasings are wider than the assertions. A default Vitest run without the two env vars skips all four and is not this evidence. The file does not pin spike SHA `e18f68a3ae628ac051de3656877210b8518839d5fa3eeb03fa7ca6f9bf2ca508`.

## What the four tests actually do

The suite runs only when `FIGFLOW_DESIGN_PG_SOCKET` and `FIGFLOW_DESIGN_WORKER_ARTIFACT` are both set (`runtimeTest`, line 15). The socket must start with `/private/tmp/figflow-postgres-`. The artifact path must resolve inside `process.cwd()`. It creates `figflow_worker_` plus a hyphen-free UUID on local Postgres (`host` socket, port 55483, user `figflow_test`, admin database `figflow_design_test`), applies migrations `491_email_design_revisions.sql` and `492_email_design_revision_metadata.sql`, and creates a short table list rather than a production schema.

Miniflare runs two workers. `design` loads `scriptPath`. `renderer` is an esbuild bundle of `workers/email-rendering/src/index.ts`. Bindings are `JWT_SECRET`, `FIGFLOW_EDM_DRAFT_SAVES_ENABLED=true`, `EMAIL_DESIGN_ENVIRONMENT=staging`, and `PAGE_STUDIO_RELEASE_ENVIRONMENT=staging`. `EMAIL_RENDERER` is a service binding. Both workers set `outboundService` to a 500 `blocked` response. Hyperdrive uses `postgres://figflow_test:synthetic@127.0.0.1:55483/<database>`. Each dispatch has a 15 second `Promise.race` deadline. The timer does not abort the in-flight `dispatchFetch`.

`verifyJwt` in `server/utils/auth.ts` is the two-segment HMAC the helper mints: base64 JSON payload, HMAC-SHA256 over those bytes, `iat` and `exp` in milliseconds. The helper omits `jti`. `verifyJwt` does not require `jti`. Wrong-key 401 then good-key 400 is consistent with that verifier using the configured secret. This pass was not executed here.

1. `initializes once...` POSTs `initialize`, expects 200 with `schemaVersion: 0`, `origin: 'legacy'`, expects a second POST to deep-equal the first, GETs the draft, and expects `email_design_revisions` count 1.
2. `renders through...` initializes the same template, PATCHes `save-draft`, expects replay of the same operation id to deep-equal, GETs `state: 'structured'`, expects `edm_templates.body_html` to contain `Hello {{first_name}}` and `https://example.com/offer`, expects a new operation id at the old revision to be 409 with count still 2, PATCHes metadata, expects replay equality, expects subject `Updated synthetic subject`, `preview_text` `''`, and the new revision id, then expects the two `payload_text` values to be equal and the count to be 3.
3. `uses the configured signing key...` GETs `drafts/invalid` with a wrong key (401), the configured key (400), `is_active=false` (401), then `sessions_invalidated_at = now() + 1 minute` (401).
4. `closes request...` reads `pg_stat_activity` for the created database and expects one backend, the fixture client's `pg_backend_pid()`, while Miniflare is still up.

`payload_text` is `NOT NULL` and the generated `payload` must be a JSON object (`491_email_design_revisions.sql` lines 20–21), so the equality check cannot pass on a pair of nulls.

## Overclaims and gaps

- Skipping is the default. Without both env vars, Vitest reports four skips. That run is not worker, renderer, or database evidence.
- The test never hashes the artifact. The frozen pre-admission SHA is a parent statement. This review did not hash a file.
- Requests go through `runtime.dispatchFetch` to the design worker. They do not pass Pages middleware, the Pages proxy, `EMAIL_DESIGN`, or the draft-flag-off path.
- The four covered routes are POST initialize, GET draft, PATCH draft, and PATCH metadata. Flag-off, missing binding, environment mismatch, admission text/plain rejections, viewer or guest RBAC, and cross-tenant scope are outside the suite.
- `payload_text` equality checks the save revision against the metadata revision. It does not compare either value to the submitted design bytes. Two identical wrong objects would pass. `NOT NULL` only rules out null.
- `Hello {{first_name}}` and `https://example.com/offer` are substrings of `structuredDesign()` (`test/fixtures/email-design/structured.ts`). Those `toContain` checks do not, by themselves, prove HTML came from the renderer. The stronger setup fact is that Miniflare binds `EMAIL_RENDERER` to the esbuilt renderer, and `createEmailRenderer` throws 503 when `EMAIL_RENDERER.render` is missing (`server/utils/email-marketing/render/client.ts` lines 34–38). A 200 supports that path only for an artifact that actually calls it. This review did not execute that call.
- `outboundService` is installed and never asserted. A worker that performs no `fetch` still passes.
- The control client uses the unix socket. Hyperdrive uses TCP `127.0.0.1:55483` and the password `synthetic`. A passing run means those two entry points reached the same disposable cluster in that environment. The test does not compare server identities.
- Tests share one actor, one template, and absolute revision counts. Test 2's counts 2 and 3 assume test 1 left exactly one row and that initialize did not insert another. Test 3 leaves `sessions_invalidated_at` set. Reordering or splitting the file changes the result.
- The revocation stamp is `now() + 1 minute`, and the helper's `iat` is `Date.now()`. `validateSession` rejects when `iat < sessions_invalidated_at` (`auth.ts` lines 101–103), so a future stamp rejects a token minted during the test. The suite does not show the production `NOW()` shape, and it does not show a token minted after that stamp being accepted.
- `request()` always uses `response.json()`. Handler 401 and 400 bodies in the reported pass were JSON. Admission `rejection()` in `workers/email-design-spike/admission.mjs` returns `text/plain`. The cases this suite hits are signature and session failures inside the handler, which stay JSON if admission lets them through. A future assertion against an admission plain-text status has to read text before parsing.
- The schema is the small `CREATE TABLE` list plus migrations 491 and 492. It is not a production catalog.
- Test 4 does not issue a request. It checks that earlier requests left no extra backend. A connection that already closed would not show up.

Kimi's final wrapper rerun is still the evidence for admission. This file's reported pass remains pre-admission evidence for the four cases above.
