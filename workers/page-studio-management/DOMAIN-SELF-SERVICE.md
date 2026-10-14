# Customer domain self-service completion

## Scope

Give authorized customers exact DNS records for an existing domain, verify
ownership and HTTPS, and publish approved website content through their portal.
Preserve existing email DNS and current websites until an explicit cutover.
Cloudflare registration and registrar transfers remain customer-owned handoffs.

## Delivery order

1. Enforce current domain health during production release resolution.
2. Support standard Cloudflare custom hostnames. Pin identity policy per
   operation, keep metadata recovery for existing attempts, and fail closed
   for uncertain standard creation. Validate actual UUID provider identifiers.
3. Prove a dedicated platform hostname end to end before enabling the CNAME
   destination for customers. Retain exact provider and routing receipts.
4. Add copyable DNS records and customer-readable progression in Domains & Launch.
5. Complete portal publication authority and approved production build/runtime
   delivery. Verify tenant isolation, revocation, quota and release provenance.
6. Review, test, release from current main, and verify live customer workflows,
   existing navigation and all four website previews.

## Verification evidence

- Production delivery regression: 10 failures before fix; 14 passing after fix.
- Existing delivery/runtime tests: 13 passing alongside the regression suite.
- Cloudflare metadata CREATE rejected with 1413 on 2026-10-14.
- Standard CREATE for isolated domain-check.xeroflowpages.com returned HTTP 201,
  provider ID 63821560-dcbb-41bd-b0ac-310145f95b15. No customer DNS changed.

## Identity policy

Existing operations default to metadata. New operations explicitly copy validated
server configuration. Standard mode requires fresh HTTP 201, matching hostname,
exact-ID readback in the pinned zone, then a locked receipt commit with fresh
authority. Existing IDs always require exact ID, hostname and zone. An uncertain
standard create is never recovered by hostname or retried automatically.
The database prevents identity-policy changes after reservation.

## Remaining

Steps 2–6 are in progress. A connected hostname alone is not a published website.
