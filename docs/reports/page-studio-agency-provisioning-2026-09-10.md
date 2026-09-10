# Agency website provisioning

Fantasy Limo's staff-managed draft could not enter the client-only provisioning path without an invented portal owner. The server now records an explicit `agency-user` actor and provides two staff endpoints:

- `POST /api/agency/page-studio/sites/:siteId/setup-proposal`: derives the name, starter and client from the saved tenant-scoped site; checks entitlement limits; locks the site and entitlement; retains a proposed revision with its actual staff author. Concurrent requests cannot overwrite revisions. The existing PAGE_STUDIO_APPROVE decision endpoint must accept the plan.
- `POST /api/agency/page-studio/sites/:siteId/provision`: requires PAGE_STUDIO_EDIT and the latest accepted revision; derives the actor from authentication; freshly verifies staff permissions and the accepted scope/plan before dispatch. Replays retain the original staff owner and verify that owner's current authority.

The shared executor authority reads active staff, current custom/system role, PAGE_STUDIO_EDIT and read-only flags from PostgreSQL on each check, without cached-permission or static-role fallback. Agency jobs may provision within an active entitlement with portal creation disabled. Client-user jobs still require the active portal owner, editor membership and portal-creation entitlement. Neither retry path can change an existing actor's kind. Lease fencing, scoped resource ownership, initial checkpoint compare-and-swap and review-required content remain in Foundation.

## Verification

- New agency actor and endpoint tests failed before implementation.
- 89 focused tests pass, including existing portal dispatch and security inventories.
- 37 real PostgreSQL tests pass: permission revocation/custom roles, client guards, entitlement limits, actual migration-415 proposal persistence, concurrent first requests, revisions and rollback after rejected writes. The existing isolated test cluster started on port 5432; the first test command used the historical port 55471 and failed to connect. Tests passed after verifying the actual cluster PID/port and correcting the connection.
- Full Dashboard suite: 13,274 passed, 69 skipped, no failures. PostgreSQL tests run separately with their explicit local connection.
- Production build passes, including prerendering, Nitro compilation and Worker size guards.
- Changed-file lint passes. Typecheck reports 927 errors, with none in changed paths; the prior recorded count is also 927. A globally clean typecheck is not claimed.
- The first full-suite attempt caught a formatting-induced type declaration syntax error and stale security inventory pins. Both were fixed before the successful final suite. Two new staff SQL identity checks are the entire gate delta; reconstructing the inventory without those two lines reproduces its former digest. No God-mode bypass was added.
- No production migration changed or was executed. No portal identity, email, billing event, Cloudflare resource or client website was created by these tests.

## Release scope

This companion feature branch is not the current production integration branch. Do not deploy it wholesale over `release/send-scan-foundation`: preserve the newer production checkpoint/AI controls during selective integration. Publish compatible Foundation receivers before exposing agency provisioning. The staff UI, full retained-job Cloudflare proof, production integration, initial Fantasy Limo content/checkpoint and editor activation remain outstanding. Marketing/UI changes belong with the visible management flow; these backend endpoints are not yet represented as a live customer capability.

Foundation design: `docs/superpowers/specs/2026-09-10-agency-provisioning-design.md` in `xeroflow-page-studio`. The checklist and Graph Wiki record this as source progress, not client delivery.
