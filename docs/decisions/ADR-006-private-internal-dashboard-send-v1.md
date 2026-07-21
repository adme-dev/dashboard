# ADR-006: Keep Dashboard Send private for v1

**Date:** 2026-07-21
**Status:** Accepted
**Decision owner:** Product owner
**Related:** `docs/superpowers/specs/2026-07-20-send-product-prd.md`

## Context

The original Send product contract included authenticated workspace transfers, guest
download links, and a later verified public sender surface. The public trust boundary
requires sender verification, recipient tokens, abuse controls, email delivery, and
malware scanning. The proposed always-available scanner also creates a material fixed
cost before Send has proven internal value.

On 2026-07-21, the product owner chose to keep the first release private for internal
Dashboard users.

## Decision

Dashboard Send v1 is an authenticated, workspace-scoped internal product.

- Every sender and downloader must have a current Dashboard session and pass the
  existing transfer/workspace authorisation policy.
- There is no anonymous sender, unauthenticated upload, public share page, bearer-only
  guest link, password-unlock session, recipient email workflow, or public management
  link in v1.
- R2 remains private. Object keys never grant access, and the application rechecks
  workspace authorisation before minting a short-lived download capability.
- Downloads are attachment-only. Uploaded HTML, SVG, and other active content is never
  rendered inline under the application origin.
- The Cloudflare Container/ClamAV scanner foundation remains dormant. It is not
  provisioned, deployed, or required for the private v1 launch. This accepts the
  narrower residual risk of files supplied by authenticated internal users, supported
  by endpoint security, least-privilege workspace access, audit events, revocation,
  expiry, and safe download disposition.
- Existing public-compatible schema fields, contracts, and scanner code are retained
  as dormant compatibility work. They do not authorise a route or enable a feature.
- Both `SEND_ENABLED` and `NUXT_PUBLIC_SEND_ENABLED` remain disabled until the private
  release gate is explicitly approved.

## Consequences

The private release can use the existing application, Neon, and R2 footprint without
an always-on scanner Container, public email traffic, Turnstile, or public-abuse
infrastructure. The remaining implementation path is shorter: internal publication,
authenticated detail/download, sender management, expiry/reconciliation, and launch
verification.

External recipients, guest links, public senders, recipient notification emails, and
malware-scanner activation are deferred. Reintroducing any of them requires a PRD
amendment, threat-model review, cost review, and explicit approval before code is
routed or infrastructure is provisioned.

## Reconsider when

- a file must be delivered to someone without a Dashboard account;
- uploads are accepted from an external or weakly trusted actor;
- inline previews are introduced;
- compliance or security policy requires server-side inspection of internal files; or
- measured internal usage justifies dedicated scanning infrastructure.
