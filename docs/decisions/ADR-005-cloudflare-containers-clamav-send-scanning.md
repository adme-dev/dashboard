# ADR-005: Scan Send Uploads with Cloudflare Containers and ClamAV

## Status

Accepted; runtime and infrastructure remain dormant

## Date

2026-07-21

## Context

Dashboard Send accepts hostile, potentially multi-gigabyte files into private R2.
Files must remain inaccessible until canonical state proves that the final object was
scanned clean. A single-part presigned PUT can be reused until expiry, Queue delivery
is at least once, and neither an R2 event nor a scanner response is authoritative.

The scanner needs more memory and a fuller Linux runtime than a Worker provides.
Cloudflare Workers have a 128 MB memory limit, while ClamAV recommends at least 3 GiB
and may temporarily use more while reloading signatures. Queue consumers also have a
15-minute wall-clock limit. Relevant current platform documentation:

- [Cloudflare Containers](https://developers.cloudflare.com/containers/)
- [Container outbound binding access](https://developers.cloudflare.com/containers/platform-details/workers-connections/)
- [Container outbound policy](https://developers.cloudflare.com/containers/platform-details/outbound-traffic/)
- [Cloudflare Queue limits](https://developers.cloudflare.com/queues/platform/limits/)
- [R2 event notifications](https://developers.cloudflare.com/r2/buckets/event-notifications/)
- [ClamAV Docker guidance](https://docs.clamav.net/manual/Installing/Docker.html)
- [ClamD INSTREAM protocol](https://docs.clamav.net/manual/Usage/ClamdProtocol.html)

The user approved Cloudflare Containers plus ClamAV on 2026-07-21. Approval selected
the provider and dependency; it did not authorize creating Cloudflare resources,
applying shared migrations, deploying, changing R2 notification rules, or enabling
Send flags.

## Decision

### Canonical orchestration

Neon remains canonical. Upload completion transactionally moves the file to
`quarantined` and inserts one `send_scan_jobs` row. The job owns availability,
attempt count, lease, expected object evidence, normalized result, and terminal state.

- Single PUT jobs are unavailable until the write capability expires.
- Multipart jobs are available after R2 completion and canonical metadata verification.
- Every claim re-HEADs R2 before scanning and again after scanning.
- A clean result is accepted only when job ID and the post-expiry/pre-scan ETag match.
- Object drift, malformed results, scanner errors, timeouts, and exhausted attempts
  fail closed. Detected content becomes `rejected`; error/timeout remains quarantined.
- Attempt numbers fence delayed results. The database prevents attempts exceeding the
  configured maximum.

R2 object-create notifications and identifier-only replay messages are wake-ups only.
The consumer validates account, bucket, and generated Send key shape, then resolves the
canonical job from Neon. Queue payload ETag and size never drive a state transition.

### Scanner runtime

A dedicated Worker consumes one message per batch and routes each claimed job to a
deterministically named `ClamAvContainer`. The initial limit is two concurrent
`standard-2` Containers. Queue Worker CPU is capped at five minutes; scan wall time is
bounded to 13 minutes inside the platform's 15-minute Queue invocation limit.

The Container runs ClamAV 1.5.3 and a small standard-library Go HTTP adapter. The
adapter streams R2 bytes into ClamD `INSTREAM`, retains only a 4 KiB prefix for
magic-byte and active-content evidence, and emits the strict normalized scan contract.
Raw ClamAV output and detection names are discarded.

The Container never receives an R2 URL or credential. A Worker outbound handler maps a
virtual `send-scan.r2` hostname to the R2 binding. The handler obtains the object key
from that Container instance's Durable Object state and requires the canonical ETag.

### Network and evidence policy

Container internet access defaults off. Its allowlist contains only the virtual R2
binding hostname and ClamAV's database hostname. The FreshClam handler accepts only
GET/HEAD for the three known signature database filename families, with no query or
fragment. HTTPS interception uses Cloudflare's mounted Container CA.

Persisted evidence is allowlisted: provider, engine version, signature version, stable
reason code, detected MIME type, active-content boolean, attachment disposition, and
scan timestamp. Filenames, object keys, URLs, ETags in audit metadata, raw output,
provider bodies, credentials, tokens, and file bytes are prohibited.

All active content uses attachment disposition. T11 must enforce this at download;
Send never serves uploaded active content inline from the application origin.

## Alternatives Considered

### Run ClamAV in a Worker or buffer the file in Nitro

Rejected. Worker memory is 128 MB and the application must not proxy or buffer large
file bodies. The scanner requires a Linux process, signature database, and several GiB
of memory.

### Send files to an external malware-scanning SaaS

Rejected for the initial release. It reduces scanner operations but creates a new
third-party file-content disclosure boundary, egress path, vendor retention question,
and size/cost dependency. The provider-neutral result contract preserves this as a
future adapter option.

### Give the Container a presigned R2 URL

Rejected. URLs are reusable capabilities that can leak through process arguments,
logs, crash output, or scanner responses. The outbound binding keeps storage identity
and credentials in trusted Worker code.

### Trust R2 event metadata as scan identity

Rejected. Events can be duplicated, delayed, or stale after overwrite. Neon plus
pre/post R2 HEAD evidence is authoritative.

## Consequences

- Scanning stays within the existing Cloudflare storage/runtime boundary.
- ClamAV signature freshness, image maintenance, queue backlog, Container capacity,
  timeout behavior, and false-positive response become operator responsibilities.
- A 2 GB file must finish within the 13-minute scan timeout or remain quarantined. The
  non-production benchmark is a release gate; limits cannot be silently reduced.
- The scanner Worker has no useful public HTTP surface and returns 404 with no-store.
- Current config intentionally contains `CONFIGURE_BEFORE_DEPLOY` for the non-secret R2
  account ID. Deployment is prohibited until replaced and reviewed.
- Migration 270, Queue/DLQ creation, R2 event notification, Worker deployment, and all
  feature-flag changes require their own approval and verification.

## Verification Scenarios

1. Clean, detected, provider-error, timeout, malformed-result, and MIME-mismatch results.
2. Queue redelivery and stale delayed completion cannot duplicate or overwrite state.
3. A single PUT cannot scan clean before capability expiry; its final ETag is rebound
   only after expiry and is stable across the scan.
4. Multipart ETag mismatch fails before bytes reach the scanner.
5. Object mutation during scanning fails closed.
6. Active HTML, SVG, and PDF script evidence remains attachment-only.
7. The harmless standard anti-malware fixture is detected in non-production; a clean
   fixture passes; no sensitive file is used.
8. Scanner outage, signature staleness, final-lease expiry, Queue/DLQ, and rollback
   drills leave every affected file inaccessible.

## Related

- [Send product PRD](../superpowers/specs/2026-07-20-send-product-prd.md)
- [Send implementation plan](../superpowers/plans/2026-07-20-send-product-implementation.md)
- [Send scanner threat model](../security/send-scanner-threat-model.md)
- [Send malware scanning runbook](../runbooks/send-malware-scanning.md)
