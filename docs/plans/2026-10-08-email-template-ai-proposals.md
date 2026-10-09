# Customer email-template AI proposals

Begins implementing the accepted AI builder requirement in
[form settings completion](2026-10-01-form-settings-completion.md). This is local
work on current Dashboard main, not hosted acceptance or customer activation.

## Current implementation

- Strict provider output accepts only summary, warnings and the existing editable
  email design. The model cannot supply recipients, delivery controls or authority.
- A proposal binds to the exact site, native/invited surface, Team/Customer
  audience, shared-form override, checkpoint, saved revision and unsaved draft.
- Explicit Apply produces a detached unsaved template and rejects a changed base.
  No save, provider call, billing mutation or delivery is performed by this layer.
- Selected image identities may be rearranged; invented identities are rejected.
  Current media ownership must still be checked by server generation/save adapters.
- UTF-8 model output is bounded before JSON parsing. There is no silent repair,
  truncation, automatic retry or implied refund.
- A server orchestration module now independently admits current edit authority,
  saved form/schema, selected media, checkpoint and template revision. It checks
  model availability, validates reservation/settlement receipts and withholds a
  proposal after access or the saved base changes. Provider and ambiguous accounting
  failures are sanitized and never retried. No real answers or field defaults are
  passed to inference. This module requires explicit trusted adapters and does not
  bypass native preview's zero allowance. The local portal endpoint now supplies
  the trusted adapters described below.
- The model adapter now connects to the existing AI SDK provider factories through
  a required Cloudflare Gateway route. It accepts an operator-owned enable-list,
  admits production text models in the shared registry, verifies configured
  credentials and refuses direct-provider fallback. Initial support is Anthropic
  and Groq; Workers AI remains unavailable here until a Gateway-backed adapter is
  connected. Each call has a 45-second abort signal, 8,000 output-token limit, no
  tools and zero SDK retries. The actual SDK is tested against a retryable 503 to
  verify a single attempt. Configuration checks are not a paid availability probe.
- Agency/invited CMS usage now connects to the existing durable AI ledger through
  the real CMS login. Reservations share the monthly allowance with editor and
  public-action operations across sites/environments; concurrent requests cannot
  spend the same remaining credit. Replay never admits a second call, failures
  remain charged, and settlement rechecks login, membership and AI entitlement.
  No editor session is created.
- Local portal website/shared-form GET and POST adapters now connect current CMS
  login authority, bounded strict JSON, exact same-origin POST checks, operator
  enablement, Gateway models and the ledger. GET returns safe model choices and
  real remaining monthly operations without charging. Missing or invalid
  `PAGE_STUDIO_EMAIL_AI_MODELS` (JSON array of unique model IDs) stays closed.
- The editor now includes a Nuxt UI proposal panel with model/allowance display,
  bounded prompt, separate rendered review, Apply and Discard. Apply requires a
  successful preview and unchanged draft, adds an unsaved edit and uses existing
  Undo/Save. Prompt/model/draft are captured before async work. In-flight requests
  block navigation and reload; unfinished prompts/proposals participate in leave
  confirmation. Native customer preview explicitly remains unavailable for AI.

Local tests cover manual changes during generation/hash, site/audience/form/revision
changes, optional-field JSON transport equivalence, unsafe output and image identity.
Legacy templates continue to support `site.name` and `form.name` unchanged.
The 9 October local contract now adds version-2 stable form/field references,
explicit literal fallbacks, current schema admission, synthetic private rendering
and customer-owned runtime persistence. Label changes retain references; removal,
type changes and legacy-to-shared adoption require explicit review/rebinding.
Manual picker and hosted availability remain unfinished. See
[the field-reference contract](2026-10-09-email-template-field-references.md).

## Remaining implementation and acceptance

1. Verify the connected portal routes end to end with real CMS authority, saved
   workspace/storage, current media and an enabled paid model. Unit HTTP tests and
   disposable database tests do not replace hosted acceptance.
2. Configure and verify operator feature enablement and Gateway retry/fallback
   policy. The UI reports real operation allowance, not provider-dollar pricing.
   Native customer generation still needs a separate reviewed authority/allowance
   adapter and policy; never manufacture an editor session or relabel customers.
3. Complete browser acceptance with the actual template storage service. The local
   CMS currently reports storage unavailable. A clearly labelled synthetic local
   fixture verified panel preview/Apply and light/dark rendering only; its routes
   were removed before building. It proves no login, provider, billing or storage
   integration. Mobile browser verification remains incomplete.
4. Connect manual field selection and fallback editing to the completed local
   V2 contract, then verify the coordinated renderer/router/runtime release and
   hosted schema-change/repair journey. Existing template revisions and requests
   stay V1; do not expose V2 to older strict services.
5. Verify provider failure, exhausted allowance, concurrent/revoked authority,
   stale drafts, unsupported models and invalid output using local battle tests,
   then the approved hosted accounts. No generation completion may be simulated.
6. Update marketing descriptions only when the corresponding user-facing feature
   is connected. Batch review/build and CI; do not publish the foundation alone as
   a working AI feature. Delivery/outbox/activation remain separate requirements.

## Authority and allowance findings

`TrustedFormContext` already separates portal and native customer authority.
`updatePageStudioAiUsage` requires a real Studio editor session, while its current
usage table admits agency/client actor roles. The extracted SQL ledger is also used
by the real CMS-login adapter under `withCmsCommitAuthority`; login provenance is
recorded with a `cms-login:` prefix and does not manufacture a child editor session.
Do not relabel a native customer as an invited client to reuse it. Select an explicit
native reservation adapter with fresh authority and the same shared allowance
accounting before exposing native generation.

The immutable native preview policy in `customerSites.ts` currently requires
`monthly_ai_operation_limit = 0`. Existing preview approval therefore cannot
authorize charged native inference. Preserve that denial; a new reviewed policy
or supported paid entitlement is required before native generation can be enabled.
This does not prevent local implementation or the non-AI hosted Forms matrix.

SDK retry/deadline settings were checked against the installed AI SDK 6 declarations
and the [official generateText reference](https://ai-sdk.dev/docs/reference/ai-sdk-core/generate-text).
This disables SDK retries only; operator-controlled Gateway retry/fallback policies
must also be verified before hosted generation acceptance.

## Local validation, 8 October 2026

- 136 focused unit, HTTP, component, history and QR access/navigation tests passed,
  plus 38 tests against an owned disposable PostgreSQL database.
- Independent server/UI review passed after fixing reload during an in-flight
  proposal. The parent regression verifies blocking and Apply/Undo restoration.
- Production Nuxt build, worker wrapping and worker-size guard passed locally.
  Raw worker size: 25,450,280 / 25,468,928 bytes; gzip: 7,038,742 / 9,750,000 bytes.
  Raw headroom is only 18,648 bytes; further changes must rerun the size guard.
- Scoped Vue typecheck has no changed-file diagnostics, but the wider generated
  import graph still reports 851 diagnostic lines. This is not a clean repository
  typecheck. Changed implementation/test lint passes.
- No remote push, CI run, deployment, model enablement or production activation.
