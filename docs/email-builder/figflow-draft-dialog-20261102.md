# FigFlow draft dialog correction — 2 November 2026

Status: implemented; focused checks passed; independent review and production
integration pending. This fixes the composer draft-creation dialog, not broader
HTML-to-native mapping or module publication.

## Trigger and correction

Opening a template copy without a destination client, choosing Edit in FigFlow,
then Create draft and open FigFlow opened Save template beneath the existing
confirmation. The required client field was inaccessible.

The draft dialog now contains its own Draft name and Client fields. Validation
stays in that dialog, using the existing authorized client choices and explicit
shared-default choice. Cancel preserves the original composer name, client and
template identity. A confirmed POST creates an independent draft and opens only
its returned ID; an unconfirmed response still blocks duplicate creation. Definite
4xx rejection keeps fields editable for correction; transport/5xx outcomes retain
the uncertainty guard. Header close, Escape/outside dismissal and Cancel are
blocked while creation is pending.

## Verification

- Eight dialog checks execute the actual composer entry functions and render its
  actual draft modal markup with UI/I/O stubs: one active dialog, reachable fields,
  independent creation, cancellation, invalid/loading choices, explicit shared
  destination, busy close controls, definite 400/403 rejection recovery and
  unknown-response duplicate protection.
- Replacing only the fixed entry function with the previous main implementation
  makes both missing/unauthorized-client regressions fail on Save template being
  open. The production source was not altered for this comparison.
- Forty-one focused checks passed across the draft dialog, existing save/navigation
  fixture, template-browser component and two isolation inventories. Targeted lint passed.
- The save/navigation fixture was refreshed to include the already released
  workspace/design state; its six existing checks and two navigation checks pass.
- The pre-existing API inventory correction accounts for the already released
  roundtrip POST (2,316 routes / 1,263 mutations). Guard and transaction counts stay
  406 / 55. This does not add or relax a runtime endpoint.

## Release ownership

The email owner retains Dashboard Pages merge/deploy ownership. The Page Studio
owner prepares an isolated paired generated-verifier compatibility PR and owns
Page Studio/Management operations. Sequence reviewed changes into one current-main
Dashboard release; no competing Page Studio CI/deploy/browser/provider operations.
Record exact source, deployment identity and hosted dialog acceptance before
claiming this correction is live. No customer email sends are required.
