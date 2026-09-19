# Page Studio — provisioning checkpoint authority

18 September 2026. R06 follow-up. The setup checkpoint metadata writer now checks the original login and current setup permissions inside its transaction. Local and live staging acceptance pass. The new read-only browser recheck is pending staging sign-in. This does not close R06.

## Reproduced failure and repair

Real PostgreSQL tests reproduced the same failure for agency and portal: a fresh provisioning permission check succeeded; the generic checkpoint writer waited for the site lock; native logout committed; the writer then committed checkpoint metadata anyway. Both tests failed before implementation.

The executor now uses a dedicated ProvisioningCheckpointRepository and private `/internal/page-studio/checkpoints/provisioning-commit` endpoint. It sends checkpoint metadata and a retained-job reference. Dashboard machine-authenticates the request, checks its idempotency key and strict schema, and reads the coordinator's retained job. The request cannot override the actor. The retained job must be content-seeded, its checkpoint scope/user must match, its checkpoint identity must be a setup digest and its expected editor head must be empty.

The existing compare-and-swap writer holds the site with FOR NO KEY UPDATE, permitting logout audit foreign-key checks. The new authority callback locks a portal native session before its exact parent login, then locks current staff/client permissions, membership, proposal and entitlement records. It repeats wall-clock checks before normal and idempotent-replay success. A completed logout while the writer waits prevents metadata, head and audit changes. A writer already holding valid authority serializes logout after its commit. No editor grant or AI allowance is required.

The Studio client validates context before HTTP and propagates denials without retrying on a generic service route. The repository snapshots its job context and rejects legacy unguarded commits. Existing trusted admin CAS callers remain separate.

## Verification

- Two actual PostgreSQL RED cases demonstrated the original logout race.
- 45 new PostgreSQL cases pass across agency and portal: commit/replay, both logout orders, permission/proposal/entitlement locks, changed authority while waiting, parent/native/entitlement expiry, rollback after a real INSERT, expiry on replay, original-owner/scope validation, legacy missing login, wrong phase and preservation of a newer editor head.
- 71 existing PostgreSQL authority cases also pass: 116 actual database cases before the size refactor. After the shared SQL extraction, all 288 cases across eight affected authority/history suites pass.
- Focused Dashboard endpoint/authority/CAS tests: 44 pass.
- Full Dashboard suite: 13,979 pass; 534 skipped (the separate PostgreSQL suites require explicit disposable databases).
- Full Studio suite: 3,158 pass. Build, typecheck and lint pass. Dedicated client contract, repository no-fallback and actual executor/SQLite integration are covered.
- Changed Dashboard production files and endpoint tests pass ESLint; the PostgreSQL file's lint passes separately.
- Dashboard typecheck exactly matches the prior 913-error baseline: no added or removed diagnostics.
- Guarded Dashboard build passes: raw 25,467,910 / 25,468,928 bytes (1,018 remaining); gzip 6,622,708 / 9,750,000 bytes.
- Independent implementation review found no Critical or Important issues. The live harness review found and corrected a blocker timeout that could release a waiting request before login expiry; PostgreSQL now verifies a two-minute expiry margin before admitting the test replay.

Evidence: `.verification/page-studio-builder-rnd-20260917/provisioning-commit-*`.

## Clean release size correction

The development-checkout build passed, but a fresh clean release build of the same source measured 25,470,177 raw bytes: 1,249 over the unchanged limit. The deploy guard stopped before upload. Generated client manifest/chunk output differed between the two builds; the implementation-checkout result was insufficient release evidence.

A separate behavior-preserving extraction now shares the repeated Page Studio authority SQL fragments. Each caller retains its scope checks, SQL casts, native/parent lock order, clock expression and error mapping. Provisioning alone retains its stricter client admin/manager role and package-capacity/proposal policy. Independent review found no Important or Critical equivalence issues. The lexical gate inventory records six repeated role-predicate rows becoming two shared rows, without removing any runtime check. The first combined PostgreSQL runner was rejected by five suites' disposable-database name guards; reruns used each suite's required database name. The full Dashboard suite again passes 13,979 tests, with 534 skipped; typecheck exactly retains all 913 baseline diagnostics and changed production files pass ESLint. Code commits: 05c6f3740 for the checkpoint fence, ffafb9844 for the SQL extraction, and Studio 13e7009 for the dedicated executor writer.

## Staging acceptance and release record

Dashboard consumer deployed before the provisioning executor. Cloudflare readback verifies:

- Dashboard source: `ffafb98441179a403445405840dd81a807788fbf`; preview deployment `4f64466c-ba5e-4e70-827d-f630b7eee5fc`.
- Studio source: `13e7009e5b27b8a5fd9cb5732219b8fba8238493`; executor deployment `85a84395-df17-47a9-9038-5425bc7ebadd`, version `7d5183e0-6132-48e9-869e-a0c1c7bbf84d`.
- Final clean release bundle: raw **25,467,539 / 25,468,928 bytes** (1,389 remaining); gzip 6,623,767 / 9,750,000. This is 2,638 raw bytes smaller than the stopped release build; the guard is unchanged.
- Production remains `8798c363-6e9c-472a-a78f-47d8ce780ef4`. Coordinator, router, control gateway, sandbox, container, provider settings, bindings and schedules remain unchanged.

All four live staging cases pass: original-login authority; dedicated commit and idempotent replay; observation of the admitted replay waiting on its owned site lock; completed native logout followed by HTTP403 with unchanged checkpoint/head/version/audit state. Parent revocation was independently observed before releasing the blocker. Only the expected login-site logout audit was added. The original synthetic login site's content remained unchanged. The permitted synthetic QR API returned HTTP200.

This probe uses owned synthetic metadata without uploading an R2 blob or running actual provider provisioning. Portal concurrency is verified in the real local PostgreSQL suites. It is not an end-to-end provider-seeding or content-integrity claim.

Independent cleanup verifies zero active test logins, grants, staff, writable roles, clients, sites, entitlements and magic links. The owned leased D1 job was removed after authority retirement; no provider databases/workers/routes were created. Archived fixture and audit records remain as evidence. The private connection file was removed.

The connected browser currently displays the staging sign-in page. A sign-in request is pending; this release's portfolio/history/QR UI recheck is **not claimed passed**. Prior-section browser evidence remains historical only. No production rollout or main-branch integration occurred; both feature branches retain the reviewed work.

## Release boundary

Dashboard must expose the new endpoint before the provisioning executor begins calling it. This is the reverse dependency order from the preceding actor-schema expansion. Preserve current provider bindings, schedules and runtime configuration. The prior deployed Dashboard bundle had only 891 bytes remaining under its immutable raw-size guard; a passing guarded build is required before release. Do not raise the budget to admit this change.

Source at start: Dashboard 9dec4491b and Studio ce66aa7. Both include freshly fetched main (Dashboard a917386dde67f06921843fd6e3a1ed1b4b984c6f; Studio f3495cfe8ae17fb74eb9d9d7674662f4d64c2c43). Production is not part of this rollout.

## Scope limits and next work

This fences PostgreSQL checkpoint metadata. It does not create an atomic PostgreSQL/D1 lease transaction, cancel an external operation already admitted, fence route activation, establish expiry at the exact COMMIT instant or collect unreferenced R2 blobs. The setup identity and content authenticity remain the trusted executor/immutable R2 contract; Dashboard cannot derive their content digest from metadata alone.

Preview isolation, CPU containment, the complete two-customer/browser/public acceptance matrix and the earlier checkpoint probe's unlocalized logout timeout remain open. The 26 CMS/component delivery tasks remain pending, with client-admin entry linked to Page Studio and shared CMS records first. Generated customer execution stays disabled.
