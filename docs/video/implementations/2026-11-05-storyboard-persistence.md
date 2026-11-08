# T03 — Storyboard persistence and reference decisions

Completed locally on 5 November 2026. The additive database schema is applied; the application is not deployed and `VIDEO_STORYBOARD_ENABLED` remains off. This is the persistence foundation for the [Storyboard Producer plan](../../superpowers/plans/2026-11-04-video-storyboard-producer.md), not R1 acceptance.

## Source and scope

Worktree `dashboard/video`, branch `adme-dev/video-storyboard-contracts-20261104`. Resumed work was rebased onto fetched `origin/main` `4372b8c98`; T03 parent is `999d1689bab733ec7eed127701c2b3a93ac8c548`. The implementation commit containing this receipt identifies the final source. Re-fetch/reconcile before any integration or deployment.

- Immutable storyboard revisions and reference-decision sets, with project-scoped parent pointers, sequence numbers, content hashes and operation IDs. A project row lock serializes pointer changes. Same-operation retries return their original result after later saves; a changed body or stale pointer returns 409.
- Authorized current/historical GET routes and a default-off reference PUT. Reads do not create records and remain available when editing is disabled. Current GET exposes the latest reference decisions; historical GET retains its revision's pinned decisions. Eligibility is recomputed and superseded decisions block use.
- Canonical reference IDs resolve video/audio assets, approved generation sources, banner projects and brand kits. Project usage approval requires the reviewed fingerprint and evidence, stamped with the server actor/time. It neither copies assets nor changes global generation-source approval.
- Project/client isolation remains mandatory even for owners. Banner/brand-kit access uses the existing fresh authority resolver through the transaction DB, canonical creative/client group helpers and current active-client assignments. Creator status cannot bypass revoked client access; current colleagues/shared-kit readers are supported. Missing request authority fails closed for Banner sources.
- Ordinary staff use canonical storage idempotency. Owner reference mutations also use the established God-mode transaction/audit/receipt coordinator, including project authorization on replay.
- Copy hashes are recomputed. A candidate cannot invent a copy approval or change content under an existing copy identity. T04 owns explicit human copy approval and public revision/planning actions; T03 exposes only the internal draft revision store.
- Schema includes inert application-receipt and timeline-obligation tables for T06/T08. There are no writers for those tables yet and no timeline, generation or render side effects.

## Identity and runtime decisions

Media fingerprints hash canonical association/metadata plus the private object's R2 ETag, size and content type. They are **not SHA-256 digests of file bytes**. Canonical banner canvas and brand-kit JSON are hashed as records. No caller URL is fetched. The existing storage adapter receives the request's bucket binding. T05 must still probe source media and establish render eligibility.

The canonical update timestamp is included conservatively: even title/default-setting changes can require another review. Audio references currently require creator/admin/owner access, which is stricter than the existing shared audio stream route; settle shared-library policy before activating a picker. Video-source ownership and approved generation-source sharing retain their existing rules.

Reference readiness is advisory current validation, not an atomic timeline-apply guarantee. Source records are not locked against concurrent source changes. T06/T08 must fence dependencies transactionally at apply/render acceptance. GET readiness is a separate resolution from the returned saved snapshot; consumers must not use it as an execution token.

Feature binding precedence follows the request's deployed environment; a deployed missing flag fails closed. Local process fallback applies only without a Cloudflare environment. Consulted official [Pages bindings](https://developers.cloudflare.com/pages/functions/bindings/) and [R2 Workers API](https://developers.cloudflare.com/r2/api/workers/workers-api-reference/) documentation for request bindings and HEAD metadata semantics.

## Migration receipt

Migration: `server/database/migrations/501_video_storyboard_persistence.sql`.
SHA-256: `434d8bceb249d300581b48a1a25d7b50f6f07488e32121fdc292ffcc3bc17987`.

Provenance was checked against the main checkout's configured `.env` and Neon branch/endpoint metadata without printing credentials:

| Target | Verified identity | Result |
| --- | --- | --- |
| Isolated test database | Agency project `square-tooth-23821574`, branch `br-muddy-wind-a4u7axf9` (`video-t02-revision-test-20261104`), endpoint `ep-hidden-meadow-a4m2e772.us-east-1.aws.neon.tech`, database `neondb` | Migration and repeat application passed; five SQL tests passed. Existing T02 branch reused. |
| Configured agency database | Same project, production branch `br-small-hall-a4qtwjgo`, endpoint `ep-lively-fog-a4dum154-pooler.us-east-1.aws.neon.tech`, database `neondb` | Migration committed successfully; five tables and four immutable-update triggers verified by schema readback. |

The migration adds only tables, constraints, one unique timeline index and immutable-history update triggers. No existing assets are copied or reapproved. Synthetic test projects/sources were removed by test cleanup. The isolated branch is retained; it was not deleted. No application deployment or feature activation occurred.

## Verification and review

- Initial scaffold run recorded 11 intended failures before implementation.
- Final targeted regression: **140 tests passed across 15 files**, covering new storage/access/routes/references/owner coordination and existing storyboard, timeline, editor persistence and render APIs.
- Isolated SQL suite: **5 tests passed**, including two actual simultaneous-writer races (plan and reference pointers), staff replay/body conflicts, historical access, revocation/supersession, unchanged canonical source approval, immutable updates, cross-project FK rejection and copy hashes. SQL was real; media HEAD was stubbed. No hosted R2 object or provider request was used.
- Review fix: six new authority cases failed before the fix, then all 12 reference tests passed. Fresh independent whole-slice review found one Important Banner authorization gap, now resolved; reviewer independently reran **25 tests across five files** and found no remaining Critical/Important issues. Reviewer did not run database operations.
- Scoped ESLint passes for all added source/tests and the plugin registration. Shared contract strict type check passes. The broader standalone strict check has no diagnostic in the new files, but is not green: importing the existing fresh-authority stack exposes 66 diagnostics in existing dependencies (including missing Nuxt auto-import declarations, `db.ts`, `storage.ts`, and existing application types). No full repository type-check/build success is claimed.
- All new/modified files were reread before commit for authorization, imports, bounded inputs, URL handling, transaction behavior and duplicated paths. No new form/UI surfaces are introduced.

Local raw logs/helpers are under `.verification/video-t03/` (ignored); this receipt preserves the durable result. No browser, hosted editor, rendered-media or complete R1 acceptance is claimed. Public marketing additions remain tied to the visible and accepted storyboard workflow in T07/T09; dormant backend storage is not advertised as a shipped feature.

Next: T04 planning/manual revision acceptance and explicit copy approval, followed by T05 compilation and T06 atomic application.
