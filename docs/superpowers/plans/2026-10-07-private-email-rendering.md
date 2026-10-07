# Private Email Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Restore Pages release capacity by moving shared email HTML rendering to a private stateless Worker while preserving supported output, customer authority and agency delivery controls.

**Architecture:** A named `EmailRenderer` Worker entrypoint exposes a versioned RPC contract. Pages owns HTTP authentication, media authorization, persistence and sending; it awaits the renderer through an explicitly injected client. The Worker receives rendering data only and has no storage, provider or service bindings.

**Tech Stack:** Existing TypeScript, Zod, Cloudflare WorkerEntrypoint, Wrangler, Vitest and local Workerd/Miniflare; Node 24.18.0 and pnpm 10.17.1. No new runtime dependencies.

**Spec:** [Approved boundary proposal](../../plans/2026-10-07-private-email-rendering-proposal.md). User said “proceed” after the proposal was presented. That approves the proposed boundary; this document makes the implementation and new compatibility limits reviewable.

## Global constraints

- Work only in `/Users/paulgiurin/Documents/Projects/page-studio-resume-20261007`, branch `feature/page-studio-resume-20261007`. Preserve other worktrees and demo data.
- Starting checkpoint `de3a14af805f4b5dedb2a890ac9dc9b0b1961b62` includes fetched main `eeefcc40f5514f4444b4d1021af174b588a28a2a`; re-fetch before release.
- Pages raw budget remains 25,468,928 bytes and gzip budget remains 9,750,000. Do not alter `scripts/check-worker-size.mjs` or compaction to pass this change.
- Public fetch returns 404; workers.dev and preview URLs are disabled; routes and crons are empty. No DB, R2, queue, service, email, network-provider or secret bindings in the renderer.
- No local production fallback, implicit hosted development fallback, hidden retry or payload logging.
- Keep native and portal identities separate. Keep customer media resolution and post-render current-authority checks in Pages.
- Keep existing agency sender/recipient/sending gates and persistence behavior. No external test mail is sent by these tests.
- Move existing HTML rendering unchanged apart from imports and bounded traversal accounting. Valid admitted fixtures must remain byte-identical.
- No public marketing capability is added by this internal extraction. Existing marketing claims stay unchanged.
- Customer production activation remains pending explicit authorization. Hosted account acceptance still requires two real test mailboxes.

## Review focus

1. A repeated child reference can expand output exponentially even when JSON input is small: Task 1 rejects cycles, excessive visits and excessive cumulative rendered output.
2. A customer loses access while RPC is pending: Task 3 must run the existing fresh authority check after the awaited result and deny disclosure.
3. An unavailable renderer must not cause a blank draft save or any email send: Task 3 proves no persistence/send side effect on transport failure.
4. A staging binding accidentally targets production: Tasks 1–2 verify expected environment, response operation/version and immutable deployment target.
5. Rich HTML, responsive style, unknown blocks, duplicate placements and inline images may change during extraction: Tasks 1–2 pin admitted fixture bytes and inspect all helper imports.

## Contract and limits

The new agency limits are an explicit compatibility boundary; the old handlers did not enforce finite document size or graph depth. Use error messages that describe the violated limit and never truncate. Customer limits already in `shared/pageStudio/emailTemplates.ts` remain: 30 blocks, six image references, 512 KiB each and 2 MiB total rendered image bytes.

```ts
export const EMAIL_RENDER_VERSION = 1 as const
export const MAX_RENDER_REQUEST_BYTES = 8 * 1024 * 1024
export const MAX_RENDER_OUTPUT_BYTES = 16 * 1024 * 1024
export const MAX_RENDER_BLOCKS = 2048
export const MAX_RENDER_GRAPH_DEPTH = 32
export const MAX_RENDER_VISITS = 4096
export const MAX_RENDER_JSON_DEPTH = 64
export const MAX_RENDER_JSON_NODES = 100_000
export type RenderEnvironment = 'staging' | 'production'
export interface DocumentRenderOptions {
  subjectLine?: string
  previewText?: string
  primaryColor?: string
  variables?: Record<string, string>
}
export interface CustomerPreviewContext {
  siteName: string
  formName: string
  fields: Array<{ id: string, name: string, type: string }>
  images?: Record<string, string>
}
export interface CustomerEmailPreview {
  subject: string
  preheader: string
  html: string
  sample: true
}
export interface EmailRendererClient {
  renderDocument(document: unknown, options?: DocumentRenderOptions): Promise<string>
  renderCustomerPreview(template: EmailTemplate, context: CustomerPreviewContext): Promise<CustomerEmailPreview>
}
```

Request is a strict discriminated union: `{version:1, expectedEnvironment, operation:'document', document, options}` or `{version:1, expectedEnvironment, operation:'customer-preview', template, context}`. `EmailTemplate` comes from the existing shared validated schema, never an unrestricted agency document.

Response is `{version:1, environment, operation, ok:true, value}` or `{version:1, environment, operation, ok:false, error:{code}}`. Document value is strict `{html:string}`; customer value is strict `CustomerEmailPreview`. Missing/invalid environment may return a generic failure envelope without reflecting unknown input. Client validates exact shape, matching operation/environment/version and size before using data. Error codes are `INVALID_INPUT`, `LIMIT_EXCEEDED`, `UNAVAILABLE`; Pages maps these to fixed safe messages and HTTP 400, 413 and 503. Never reflect exceptions, supplied markup or provider messages.

Before schema recursion/stringification, walk input iteratively, rejecting non-JSON values, cyclic objects, excessive nesting and byte overflow. Count UTF-8 bytes, not JavaScript character count; account for JSON escaping and delimiters. Repeated object references on different branches are legal JSON serialization and must not be mistaken for ancestor cycles. Validate the serialized snapshot, not an object the caller can mutate after admission.

For agency documents validate a `root` EmailLayout and every block's string type/object data. Preserve unknown block placeholder behavior and skipped missing child references. Build graph edges from `data.childrenIds` on EmailLayout/Container and `data.props.columns[].childrenIds` on ColumnsContainer. Reject ancestor cycles; allow repeated references within the visit budget. Count expanded visits, not unique IDs. Before allocating joined strings, charge each rendered block result to a request-local cumulative 16 MiB budget. Nested results count each time they are copied into ancestors; this conservative cumulative budget is part of the new limit. Check final wrapper output too. No global mutable request budget.

## Task 1: bounded stateless renderer and parity

**Files:**
- Copy `server/utils/email-marketing/render/block-registry.ts`, `flyhub-html-renderer.ts`, and the complete `blocks/` directory into `workers/email-rendering/src/render/` for parallel parity tests. Delete the old implementation in Task 3 when callers switch; do not break the existing server during Tasks 1–2.
- Copy the pure customer adapter from `server/utils/pageStudio/emailTemplatePreview.ts` to `workers/email-rendering/src/customerPreview.ts`; replace the old implementation in Task 3.
- Create `shared/emailRendering/contract.ts`, `shared/emailRendering/format.ts`, `shared/emailRendering/bounds.ts`.
- Create `workers/email-rendering/src/handleRender.ts` and `workers/email-rendering/src/render/document.ts`.
- Create `test/workers/emailRenderingBoundary.test.ts` and `test/fixtures/emailRendering.ts`.
- In Task 3, update pure renderer imports in existing `test/utils/emailRender*.test.ts`, `test/utils/edmPresets.test.ts`, `test/utils/edmSectionBuilders.test.ts`, `test/utils/emailSendableHtml.test.ts` and customer preview unit tests; leave transport tests pointed at server wrappers.

**Interfaces:** `handleEmailRender(input:unknown, environment:unknown): RenderResponse`; `renderTemplateDocumentLocally(document:unknown, options?:DocumentRenderOptions):string`; existing `renderCustomerEmailPreview(template, context):CustomerEmailPreview` remains the pure customer implementation in its Worker module.

- [ ] Write new boundary tests before implementation. Include this concrete valid fixture and environment denial:

```ts
const document = {
  root: { type: 'EmailLayout', data: { childrenIds: ['text'] } },
  text: { type: 'Text', data: { props: { text: 'Hello & goodbye' } } }
}
const request = { version: 1, expectedEnvironment: 'staging', operation: 'document', document, options: {} }
it('denies a mismatched environment before rendering', () => {
  expect(handleEmailRender(request, 'production')).toMatchObject({ ok: false, error: { code: 'UNAVAILABLE' } })
})
it('rejects recursive document references', () => {
  const cycle = structuredClone(document)
  cycle.root.data.childrenIds = ['root']
  expect(handleEmailRender({ ...request, document: cycle }, 'staging'))
    .toMatchObject({ ok: false, error: { code: 'INVALID_INPUT' } })
})
```

- [ ] Add exact-boundary/one-over cases for UTF-8 JSON bytes, output bytes, graph depth/visits and block count. Include non-ASCII strings, repeated references without cycles, columns cycles, absent children, malformed arrays, NaN/functions and deep JSON. Add customer raw-markup/remote-image rejection or safe placeholder cases using the existing adapter's behavior.
- [ ] Run `pnpm exec vitest run test/workers/emailRenderingBoundary.test.ts`; verify the expected missing boundary fails. Save RED output under `.verification/resume-20261007/`.
- [ ] Before moving sources, capture deterministic HTML bytes for the existing heading/text/button, responsive, raw HTML, unknown block, nested columns/container and customer image fixtures. Store synthetic golden fixtures with their source checkpoint in `test/fixtures/emailRendering.ts`; include two independent calls to expose accidental shared budget state.
- [ ] Copy source files and update the copied imports mechanically; retain the original path until Task 3. `~~/app/utils/edmAnchor`, `edmStyle`, `edmResponsive`, `edmDivider` are pure shared-by-import helpers; use relative paths from the new location. Do not copy their implementations or import Nuxt/browser globals. Shared customer schemas also use relative imports.
- [ ] Extract the existing `isFlyhubFormat` predicate into the lightweight shared format module. Keep the local document renderer's existing invalid-format error and supported HTML transformations.
- [ ] Implement strict envelopes, byte admission and graph validation. Add a request-local budget to `BlockRenderContext`; charge in `renderBlock` before returning each block string, and bound the final HTML. Clear/reset no global budget because no such state exists. Only the boundary supplies limits; old pure-render unit fixtures continue to exercise exact valid output.
- [ ] Implement `handleEmailRender`: validate environment/request; call exactly the requested renderer; validate bounded result; return fixed error codes. Never log input or exceptions. Do not import server authorization, database, fetch or mail code.
- [ ] Run new boundary tests plus all existing pure renderer and customer preview tests. Compare golden HTML exactly and inspect moved modules end-to-end before committing `refactor: isolate bounded email renderer`.

## Task 2: private Worker and Pages RPC client

**Files:**
- Create `workers/email-rendering/src/index.ts`, `package.json`, `tsconfig.json`, `wrangler.staging.jsonc`, `wrangler.production.jsonc`, `generate-types.mjs`, `deploy.mjs` and generated environment declaration files.
- Create `server/utils/email-marketing/render/client.ts`.
- Create `test/workers/emailRenderingRpc.test.ts`, `test/workers/emailRenderingDeploy.test.ts`, `test/server/utils/emailRenderingClient.test.ts`.

**Interfaces:** named `EmailRenderer extends WorkerEntrypoint<Env>` with `render(input:unknown):Promise<RenderResponse>`; `createEmailRenderer(env:Record<string,unknown>):EmailRendererClient` binds `env.EMAIL_RENDERER` and uses existing `env.PAGE_STUDIO_RELEASE_ENVIRONMENT` as expected environment.

- [ ] Write client tests with a controlled transport; verify real HTML results, exact response admission, one RPC on failure and safe errors. A malformed response must never become a caller-visible preview:

```ts
it('denies missing binding', async () => {
  const client = createEmailRenderer({ PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging' })
  await expect(client.renderDocument(document)).rejects.toMatchObject({ statusCode: 503 })
})
it('redacts transport errors', async () => {
  const client = createEmailRenderer({
    PAGE_STUDIO_RELEASE_ENVIRONMENT: 'staging',
    EMAIL_RENDERER: { render: async () => { throw new Error('private document contents') } }
  })
  await expect(client.renderDocument(document)).rejects.toMatchObject({
    statusCode: 503, statusMessage: 'Email rendering is temporarily unavailable.'
  })
})
```

- [ ] Add mutation-after-call tests, extra-key/version/operation/environment mismatch, oversized response and payload-free error checks. Run and retain RED evidence before implementing the client.
- [ ] Implement explicit bound method dispatch (`service.render(...)`, preserving the binding receiver), snapshot validation, fixed error mapping and no retry/fallback. Export no local renderer through this module.
- [ ] Implement the Worker entrypoint and default fetch handler with 404. Use exactly `EMAIL_RENDER_ENVIRONMENT` as its only variable. Pin compatibility date `2026-07-15` to the available verified runtime; no Node compatibility is needed by the pure renderer. If compilation reveals a Node-only dependency, treat it as a design finding rather than silently grant compatibility.
- [ ] Use immutable Worker names `xeroflow-email-rendering-staging` and `xeroflow-email-rendering-production`, account `a5b299b3ad15c1b5b895dc66f9357b17`. Configs have `workers_dev:false`, `preview_urls:false`, `routes:[]`, `triggers:{crons:[]}` and disabled invocation logs. The deploy guard rejects every undeclared binding/config capability, wrong name/account/date/main and additional arguments. Model clean-source/current-main checks on `workers/page-studio-management/deploy.mjs`; production must equal current main.
- [ ] Generate module-local environment types using the existing management generation pattern, with names `EmailRenderingStagingEnv` / `EmailRenderingProductionEnv`. Reuse root pinned tools without adding dependencies.
- [ ] Run actual local Workerd RPC through a synthetic caller binding to named `EmailRenderer`; prohibit outbound network in the harness, test both public fetch paths return 404, and verify a successful render and failure envelopes. Dispose all runtimes in `finally`.
- [ ] Run strict Worker typecheck, generated-type reproducibility, both target guards and staging/production dry-run builds. Retain upload sizes and imported module metadata. Review and commit `feat: add private email rendering transport`.

## Task 3: asynchronous agency and customer callers

**Files:**
- Modify `server/utils/email-marketing/render/index.ts`, `templates.ts`, `campaigns.ts`.
- Modify `server/api/email/templates/render.post.ts`, `test-send.post.ts`, `index.post.ts`, `[id].patch.ts` and `server/api/email/campaigns/index.post.ts`, `[id].patch.ts`.
- Replace `server/utils/pageStudio/emailTemplatePreview.ts` with the transport-facing API or remove it after all callers/tests explicitly import their correct boundary.
- Modify `server/utils/pageStudio/formAuthority.ts`, `portalFormContext.ts`, `customerForms.ts`, `emailTemplates.ts`.
- Modify `wrangler.toml` for exact preview/production bindings.
- Create `test/server/utils/emailRenderingPersistence.test.ts`; extend `test/server/api/emailTemplateTestSend.test.ts`, `test/server/utils/pageStudioEmailTemplates.test.ts`, `test/server/utils/pageStudioCustomerFormsHttp.test.ts`, and affected template/campaign unit/route fixtures.

**Interfaces:**

```ts
renderTemplateDocument(doc: unknown, opts: RenderTemplateOptions, renderer: EmailRendererClient): Promise<string>
renderTrackedTemplateDocument(doc: unknown, opts: RenderTemplateOptions, renderer: EmailRendererClient): Promise<string>
createTemplate(input: CreateTemplateInput, renderer: EmailRendererClient): Promise<EdmTemplate>
updateTemplate(id: string, patch: UpdateTemplateInput, renderer: EmailRendererClient): Promise<EdmTemplate | null>
createCampaign(input: CreateCampaignInput, renderer: EmailRendererClient): Promise<Campaign>
updateCampaign(id: string, patch: UpdateCampaignInput, renderer: EmailRendererClient): Promise<Campaign | null>
```

`CreateTemplateInput`, `UpdateTemplateInput`, `CreateCampaignInput`, `UpdateCampaignInput` name the existing inline argument types without altering their fields. `TrustedFormContext` gains `renderEmailPreview: EmailRendererClient['renderCustomerPreview']`; adapters always construct it from their explicit environment, and test contexts supply a controlled implementation. No environment is accepted from browser input.

- [ ] Write deferred-render tests proving SQL mutation and provider send have not occurred before resolution, and never occur after rejection. Use a rejected renderer with a private exception and assert the outward safe error. Keep database/provider fakes at those actual side-effect boundaries, not inside production renderer code.
- [ ] Add a customer preview test that changes the authority snapshot while a deferred render is pending. Resolve it and assert 403 with no preview value. Repeat for native and portal context wiring; retain image ownership, sample marker and CSP assertions.
- [ ] Add campaign concurrency regression: schedule a draft while render is pending, resolve render, and assert the update cannot overwrite the now-scheduled campaign. Preserve the current conflict error. Implement the final campaign SQL update with `AND status='draft'` and handle a missing updated row as conflict. This is necessary because rendering introduces another asynchronous interval before persistence.
- [ ] Run the targeted tests and verify RED for the missing await/transport behavior.
- [ ] Change the server render entry to delegate to `renderer.renderDocument`; perform tracking only after awaited rendering. Keep the lightweight format guard; template/campaign invalid-format behavior remains empty HTML as currently implemented, while preview/test-send invalid input remains a validation error.
- [ ] Pass `createEmailRenderer(event.context.cloudflare?.env ?? {})` from each authenticated HTTP caller. Helpers await rendering before SQL. Test send awaits it before asset processing/sendability/provider delivery; preserve all existing gates and receiver handling. Do not invent process-global or hosted fallback state.
- [ ] Both form adapters construct their render callback from the explicit environment. Shared preview awaits it before the existing `recheckFormAuthority` call. Customer draft saves/recipients/history remain independent of rendering availability.
- [ ] Add exact TOML bindings:

```toml
[[env.preview.services]]
binding = "EMAIL_RENDERER"
service = "xeroflow-email-rendering-staging"
entrypoint = "EmailRenderer"

[[env.production.services]]
binding = "EMAIL_RENDERER"
service = "xeroflow-email-rendering-production"
entrypoint = "EmailRenderer"
```

- [ ] Update tests to pass an explicit test renderer. Pure-output tests use the moved local implementation; transport/caller tests exercise actual boundary behavior. Do not add a production test-only switch. Run agency template/campaign/render/test-send regressions and native/portal Forms/template tests.
- [ ] Run a whole-source import search proving server/browser code has no runtime import of the moved renderer. Include indirect barrel exports and Nuxt auto-import generated output. Review all changed files and commit `refactor: route email rendering through private Worker`.

## Task 4: capacity, review and staged acceptance

**Files:** update `docs/plans/2026-10-07-page-studio-resume.md`, `docs/plans/customer-cms-status.md`; create `docs/runbooks/email-rendering-service.md`; update `.github/workflows/ci.yml` with strict renderer types/guard/RPC checks and artifact inspection.

- [ ] Run affected lint and strict Worker typecheck; compare Dashboard TypeScript diagnostics with the retained baseline, reporting new errors separately. Run `pnpm test` as the repository full suite; identify every failing test and environment skip rather than claiming a narrow suite is full verification.
- [ ] Run the Page Studio, QR and deployment/source guard regression selection and the local PostgreSQL/connected-runtime cases already recorded in the resume checkpoint if changed dependencies affect them. Do not rerun unchanged database tests merely to inflate totals.
- [ ] Build once with `pnpm run build`, retaining its process handle through completion and using the unchanged artifact guard. Target at least 64 KiB raw remaining after extraction, beyond just the 15,841-byte overage; if net savings are smaller, report the measured result and reassess the boundary. Never raise budgets or alter compaction.
- [ ] Inspect the actual Pages module graph for renderer block code or local fallback, and inspect the Worker bundle for server/DB/provider dependencies. Run actual Workerd tests against the emitted Worker as well as source tests. Add CI checks that would catch reintroduction of the renderer into Pages.
- [ ] Request independent whole-change review covering authority timing, payload bounds, byte parity, sending/persistence failures and deployment ordering. Resolve all must-fix findings and rerun the tests they affect.
- [ ] Save a clean source checkpoint. Re-fetch main and verify ancestry, deployment target and source SHA. If source main advanced, reconcile and repeat affected checks before deployment.
- [ ] Deploy only the private staging renderer with its guarded script; read back exact version/config and verify no public exposure. Then run `pnpm deploy:check` and guarded `pnpm deploy:preview`. Keep all native preview/signup/customer gates closed.
- [ ] In the authenticated preview browser, verify agency template rendering/saving, Page Studio invited-client template preview, mobile/keyboard preview use, existing CMS navigation and QR Codes. Use synthetic drafts and discard transient edits; do not send email. Record exact source/version/deployment IDs and observed results.
- [ ] If preview fails, use the recorded previous Pages artifact; retain the compatible renderer while any Pages deployment references it. Never remove the Worker before its callers are rolled back. Record failures honestly and resolve before production.
- [ ] Record staged acceptance, pending two-mailbox native hosted acceptance and the separate production release decision. Retire only completed owned branches/worktrees after eventual integration, preserving the remaining native stack and unrelated work.

## Execution handoff

Recommended execution: **Native** in the existing isolated worktree, followed by a fresh whole-change reviewer. The four tasks share a small transport contract and caller signatures; one implementer reduces coordination overhead. Subagent-driven execution remains available if the user prefers independent review between each task.

Execution ruling: proceed natively under the user’s instruction to proceed with the extraction, followed by an independent final review. Selecting the execution method is a routine implementation choice; do not ask the user to authorize the same work again. No deployment or production activation is implied by that choice.
