# Private email rendering service — proposed capacity repair

Status: proposal; no renderer or deployment changes implemented.

## Problem and acceptance

The current-main Page Studio integration builds, but its unchanged artifact guard
rejects 25,484,769 raw bytes against 25,468,928 (15,841 over). Gzip is 7,036,899
against 9,750,000. This is a release blocker, not permission to raise the budget.
The goal is to restore deployable capacity while preserving Page Studio and agency
email behavior, including existing authorization, sending gates and rendering.

## Alternatives and recommendation

1. **Recommended: move the complete shared HTML renderer to a private, stateless
   Worker.** The rendering source is about 152 KB before bundling; actual net Pages
   savings must be measured. It has no database or provider side effects. Both
   agency and Page Studio callers must switch to the service for the renderer to
   leave Pages. This affects existing agency email preview/template/campaign paths
   and therefore requires their regression coverage and staged acceptance.
2. Move native Forms operations and their authority into the management Worker.
   This keeps agency email callers unchanged but moves database locks, sessions,
   media access and customer runtime bindings across a more sensitive boundary.
   It is a larger authority redesign for this capacity repair.
3. Further compact or remove unrelated application behavior. This does not create
   durable capacity for the remaining roadmap and risks unrelated features. Do not
   change the fixed budget, strip safeguards or alter the existing compactor.

## Proposed boundary

Use a dedicated private email-rendering Worker with no database, R2, mail provider,
service or secret bindings. It exposes a named RPC entrypoint only; public fetch
returns 404, workers.dev and preview URLs are disabled, routes and crons are empty.
Separate staging and production service bindings choose the environment. The
existing management Worker is precedent for private transport, but the new renderer
should not inherit that Worker's management/database authority.

Pages keeps all HTTP authentication, current customer/site authority, media scope
resolution, persistence, tracking, sendability and sender/delivery decisions.
Only validated rendering data crosses RPC. The Worker performs no fetches, stores
nothing and logs no documents, recipient data, images or rendered HTML.

Move the existing pure rendering implementation without changing its templates,
escaping, merge substitutions or supported block behavior. Retain its unit tests
against that implementation. Separate the lightweight document-format predicate
from the implementation so Pages can validate without importing the renderer.
The transport wrapper must not include a production local-render fallback that
silently retains the bundle or hides a missing binding.

Provide two explicit operations: existing agency document rendering and the
restricted customer sample preview. Keep the customer adapter's validation,
header control stripping, restricted image data, sample marker and preview CSP.
No user-supplied raw HTML becomes accepted by the customer operation. Agency
rendering retains the document format already supported by the EDM editor.

## Transport and caller changes

- Use strict, versioned request/result envelopes with bounded serialized bytes,
  block count and nesting. Choose limits from existing accepted document/image
  limits and real fixtures; do not silently truncate output or invent a lower
  compatible limit. Reject invalid/oversized input with a safe validation error.
- Bound HTML results and validate the result envelope. Missing binding, transport
  failure or invalid result returns a safe unavailable error. Do not retry sends,
  database writes or customer draft mutations as a response to rendering failure.
- Keep customer media resolution and fresh authority checks before RPC, and retain
  the existing post-render authority check after awaiting RPC. A revoked account
  must not receive the preview after a delayed render.
- Inventory HTTP, background/cron and non-HTTP callers before changing signatures.
  Change template/campaign render helpers and their callers to await rendering
  before persistence or sending. Preserve invalid-document behavior and all
  existing sending/sender gates. Resolve the binding through the actual request
  environment; avoid process-global mutable request state.
- Supply a local test transport via explicit dependency injection. Local preview
  development must use an explicit local Worker binding or fail visibly; never
  route documents to a hosted fallback automatically.

## Verification and rollout

1. Add failing transport tests for missing binding, malformed/version-mismatched
   input/result, size limits, failure redaction and no hidden local fallback.
2. Run existing renderer fixtures against the moved implementation and compare
   byte-for-byte HTML before and after. Cover rich HTML, merge variables, images,
   every supported block, malformed references and cycle/depth limits.
3. Exercise the real Worker RPC locally, including disabled public fetch and
   oversized input/output. Verify it has no privileged bindings or network calls.
4. Run agency template/create/update/campaign/render/test-send tests with a fake
   mail provider; no external email. A failed render must not persist or send.
5. Run native and portal preview tests, image ownership, CSP, read-only access,
   revocation during the new await and existing customer template/history cases.
6. Review source/dependency imports to prove the full renderer is absent from the
   Pages graph. Build both artifacts and rerun the unchanged Pages size guard;
   source-size estimates alone are not evidence of successful extraction.
7. Run affected lint/type checks, the integration regressions and independent review.
8. Deploy and read back the private staging Worker before the matching Pages preview
   through guarded release scripts. Verify the exact binding, source/version and
   browser previews. A Pages rollback must retain a compatible Worker until all
   callers have returned to the prior implementation. Production rollout remains
   a separate reviewed release; this proposal does not activate customer access.

Official transport references:
- https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/
- https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/

## Open decisions before implementation

Confirm this shared-renderer boundary because it changes agency email infrastructure
as well as Page Studio. Resolve compatible payload limits and request-context
plumbing during the focused implementation plan. If measured net savings do not
provide useful room beyond the immediate 15,841-byte overage, stop and reassess the
boundary rather than claim capacity from unbundled source size.


## Read-only caller and limit findings — 7 October

The source scan found direct agency rendering at template preview/test-send and
inside template/campaign create/update helpers. Their current production callers
are HTTP routes. `renderTrackedTemplateDocument` has no production call site in
`server`, `workers` or `scripts`; retain an explicit regression decision for that
export rather than assume it is a background caller. Customer preview has one
shared service call in `emailTemplates.ts`, reached through separate native and
portal adapters. Its existing post-render authority check must follow the new await.

Customer templates already limit blocks to 30, image references to six, each
image to 512 KiB and total rendered image bytes to 2 MiB (including repeated image
references). Account for base64 expansion when sizing RPC envelopes. The renderer
also imports responsive-style helpers from `app/utils/edmResponsive`; extraction
must give those pure helpers explicit Worker-resolvable imports and retain parity.

Agency preview/test-send currently accept `body_source: z.any()` followed by a
format predicate; these handlers do not establish a document byte or depth limit.
Therefore a new finite validation limit cannot be described as preserving every
previously accepted payload. The detailed design must state the new boundary,
check representative fixtures and give an actionable error, rather than silently
truncate or claim an existing limit that was never enforced.

Cloudflare documents a 32 MiB maximum serialized RPC message. This is an upper
transport constraint, not the recommended application envelope budget:
https://developers.cloudflare.com/workers/runtime-apis/rpc/#limitations
