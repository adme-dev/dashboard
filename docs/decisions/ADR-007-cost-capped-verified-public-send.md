# ADR-007: Cost-capped verified public Send activation

**Date:** 2026-07-21
**Status:** Accepted by explicit user activation approval
**Supersedes:** The public-scope deferral in ADR-006 only; private Workspace Send remains unchanged

## Context

Workspace Send is live for authenticated internal users. The product direction also
calls for an optional WeTransfer-style surface, but the first scanner design was
rejected because an always-running service created unnecessary fixed cost. Public
uploads and bearer-link downloads add materially different malware, phishing,
mail-bombing, storage-abuse, enumeration, and denial-of-wallet risks.

On 2026-07-21 the user first approved public Send planning and then explicitly said
"activate". This records authority to implement, provision, deploy, and enable the
bounded public beta described below. It is not authority for Live Send/WebRTC, paid
plans, permanent hosting, anonymous unverified uploads, or bulk/marketing email.

## Decision

Activate a small verified-public beta at `/send` while retaining `/agency/send` for
Workspace Send.

- A sender must pass server-verified Turnstile and email verification before any R2
  upload capability is issued.
- Public beta limits default to 250 MiB per transfer, 100 MiB per file, 10 files,
  three-day retention, and 20 downloads. Recipient delivery and passwords stay off in
  the first activation; the verified sender receives a share link and management link.
- Tokens are 256-bit random values, stored only as SHA-256 hashes. Browser links carry
  secrets in URL fragments, not query strings, so ordinary HTTP/referrer logs and mail
  link scanners do not receive them. Public APIs accept secrets in request bodies or
  dedicated headers and return `Cache-Control: no-store`.
- Every public file remains quarantined until the existing ClamAV boundary records a
  clean result against stable canonical R2 metadata. Scanner errors, stale signatures,
  timeouts, mutation, missing bindings, or queue failure fail closed.
- The scanner uses one `standard-2` Container instance maximum and sleeps after ten
  idle minutes. Cloudflare documents scale-to-zero billing; there is no deliberately
  always-on scanner. A single-instance cap is a launch constraint, not a target to
  optimise around.
- Public creation uses the existing strongly consistent Durable Object rate limiter.
  Missing Turnstile, rate-limiter, email, queue, scanner, database, or R2 dependencies
  disable public creation; they never silently fail open.
- The existing Resend transactional-email transport is reused. Public Send must not
  inherit the marketing campaign send gate or be used for marketing/bulk mail.
- R2 remains private. Downloads are authorised immediately before issuing a one-minute,
  attachment-only presigned URL. Revocation and expiry take effect before new URLs are
  minted.
- Independent server and public-UI kill switches default off until migrations,
  infrastructure, controlled fixtures, and live smoke checks pass.

## Cost guardrails

- Standard R2 only; three-day deletion is authoritative and lifecycle is a backstop.
- One scanner instance, queue concurrency one, and no public multipart upload in the
  first beta.
- Public creation can be disabled without disabling existing Workspace Send.
- A redacted operations view must expose public bytes, active transfers, scan backlog,
  failures, and deletion lag before the cohort expands.
- Review limits before increasing any byte, retention, download, queue-concurrency, or
  Container-instance setting.

## Consequences

The beta is intentionally smaller than full WeTransfer: verified senders can upload and
share a safe expiring link, but cannot yet send recipient notifications, add passwords,
or upload individual files larger than 100 MiB. This keeps the first public trust
boundary reviewable and the cost envelope bounded. Those additions require measured
usage and a follow-up approval.

ADR-006 remains authoritative for Workspace Send's internal validation policy. Public
files never inherit `scan_status = 'not_required'`.

## Rollback

Disable the public server flag first, then the public UI flag. Existing public transfers
remain subject to expiry/revocation and cleanup, but no new drafts or upload capabilities
are issued. Pause the scanner consumer only after creation is disabled; do not force
quarantined files clean or purge queues during rollback.
