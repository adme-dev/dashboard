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
  passed to inference. This module requires explicit trusted adapters; it is not
  exposed as an endpoint and does not bypass native preview's zero allowance.

Local tests cover manual changes during generation/hash, site/audience/form/revision
changes, optional-field JSON transport equivalence, unsafe output and image identity.
The current supported variables remain `site.name` and `form.name`; stable field
merge tags and defined fallbacks are not implemented by this contract slice.

## Remaining implementation and acceptance

1. Connect server generation to independently resolved current Forms authority.
   The orchestration and failure tests are implemented locally; route adapters and
   their end-to-end authority/media proof remain required before exposure.
2. Connect the enabled model catalogue and existing Cloudflare AI Gateway execution
   and credit conventions. Check availability before charging, reserve atomically,
   preserve unknown outcomes without replay, and expose real usage information.
   Never issue a synthetic editor session just to call the existing usage API.
3. Add the adjacent conversation and proposal preview/Apply/Discard controls to the
   existing template editor, preserving undo, overrides and unsaved changes. Use
   Nuxt UI v4, apply the required form-design skill, and verify real browser behaviour.
4. Add stable field-ID variables with explicit missing-value fallbacks and schema
   change invalidation through the shared validator, renderer and owned runtime.
5. Verify provider failure, exhausted allowance, concurrent/revoked authority,
   stale drafts, unsupported models and invalid output using local battle tests,
   then the approved hosted accounts. No generation completion may be simulated.
6. Update marketing descriptions only when the corresponding user-facing feature
   is connected. Batch review/build and CI; do not publish the foundation alone as
   a working AI feature. Delivery/outbox/activation remain separate requirements.

## Authority and allowance findings

`TrustedFormContext` already separates portal and native customer authority.
`updatePageStudioAiUsage` requires a real Studio editor session, while its current
usage table admits agency/client actor roles. Do not relabel a native customer as
an invited client to reuse it. Select an explicit native reservation adapter with
fresh authority and the same shared allowance accounting before exposing generation.

The immutable native preview policy in `customerSites.ts` currently requires
`monthly_ai_operation_limit = 0`. Existing preview approval therefore cannot
authorize charged native inference. Preserve that denial; a new reviewed policy
or supported paid entitlement is required before native generation can be enabled.
This does not prevent local implementation or the non-AI hosted Forms matrix.
