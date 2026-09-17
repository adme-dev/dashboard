# Page Studio — provisioning login authority

18 September 2026. R06 follow-up. Queued provisioning retains the native login that initiated it. Implementation, local verification and four live staging cases pass. R06 remains partial.

## Contract and reason

A retained job previously identified its user without identifying the login that created it. A later login by that user could therefore pass fresh authority checks after the original login was revoked. New jobs now carry a canonical SHA-256 native-login digest, resolved from the authenticated H3 event and bound through the existing login authority store. Browser responses omit that digest.

The originating digest is immutable across retained-job replay, duplicate creation and lost acknowledgements. Existing records without a digest remain readable, but execution and retry fail with `PROVISIONING_OWNER_REQUIRED` (409); a new caller cannot adopt them. New candidates require a valid digest. Studio protocol parsing, D1 persistence and the control client retain and compare it.

Fresh authority checks require the exact original role, user and native-login digest to remain active, unrevoked and unexpired. Staff-wide invalidation and portal-native expiry/deletion are checked as well as current permissions, membership, site, entitlement and proposal scope. Time-sensitive checks use `clock_timestamp()`. Agency and portal POST handlers authenticate their current caller, then reauthorize the retained job's original login even when both logins belong to the same user.

The guarantee is bounded: logout committed before the next fresh authority check prevents that check from admitting another effect. This does not make Neon and D1 enqueue atomic, fence provisioning metadata transactions, cancel an external effect already admitted or solve route-activation commit races. Other background job classes require their own lifecycle work. No migration or UI change is part of this section.

## Verification

- RED cases reproduced missing login binding, digest stripping, same-user retry and unbound legacy acceptance before the repair.
- Dashboard focused producer/endpoint/state tests: 102 passed.
- Actual disposable PostgreSQL: 71 passed (37 new native-login cases and 34 retained authority cases), covering both agency and portal. The production bind helper, native logout, missing/revoked/expired/wrong-owner logins, staff invalidation and current access loss are exercised. No editor grant is required by these tests.
- PostgreSQL exposed a real UUID/text SQL parameter mismatch; explicit UUID casts fixed it before final verification.
- Dashboard full suite: 13,972 passed; 489 skipped. PostgreSQL suites were run separately above.
- Dashboard typecheck: exact existing 913-error baseline, with no added or removed diagnostics. Changed-file ESLint and diff checks pass.
- Studio full suite: 3,142 passed. Build, typecheck, lint and commit hook pass; protocol has 10 passing cases, and actual SQLite persistence and control-client retained-owner checks pass.
- Independent source review: no Critical or Important findings. A live-harness cleanup issue involving a lost COMMIT acknowledgement was corrected before execution: cleanup independently checks exact owned IDs and run markers instead of trusting the acknowledgement flag.

Raw evidence is under `.verification/page-studio-builder-rnd-20260917/provisioning-*`.

## Staging rollout

Consumers are deployed before the Dashboard producer. Prepared configuration preserves the provider's bindings, runtime variables, compatibility settings and coordinator scheduler. The clean guarded Dashboard preview release and provider readback pass. All semantic Worker settings, bindings and schedules are preserved.

- Dashboard source: `9c8ff25b723539ae042fdec6c00decf62fd4a9a3`.
- Dashboard freshly fetched main: `a917386dde67f06921843fd6e3a1ed1b4b984c6f`, included in the candidate.
- Studio source: `ce66aa7d3b63226dbf995b0a633e1963039d081e`.
- Studio freshly fetched main: `f3495cfe8ae17fb74eb9d9d7674662f4d64c2c43`, included in the candidate.
- Target: Dashboard preview and the staging provisioning coordinator, executor and content router only.
- Before rollout, the provisioning queue contained six complete and 26 failed historical jobs, all unbound, with zero active jobs. No historical record was adopted or modified.


### Verified release artifacts

- Dashboard preview: `a2a6d2d8-89a7-4840-89e9-ea1b5c1435ba`, source marked clean and successful, at https://preview.agency-dashboard-6cm.pages.dev.
- Coordinator deployment: `f255daf7-b6a0-4ea1-a7f8-f43eeb37772f`.
- Executor deployment: `9141d1f1-8157-4790-bc56-82f364eb81eb`.
- Content router deployment: `8958a89c-ce2a-424c-a9a4-800dd45dd871`.
- Production remains `8798c363-6e9c-472a-a78f-47d8ce780ef4`; Studio control and sandbox deployments and container source/configuration are unchanged.
- Raw Dashboard Worker bundle: 25,468,037 / 25,468,928 bytes, with 891 bytes remaining. The guard was not raised. Future server growth needs bundle reduction or extraction before another release.

## Live acceptance and limits

The executed acceptance created one synthetic staff/client/site/proposal fixture. It inserted an owned D1 job with a thirty-minute claim lease before accepting the proposal; its original parent login expires within five minutes. This prevents the scheduler from provisioning customer resources while testing the retained contract. All four cases passed: private fresh authority allowed login A; native POST replay returned 200 without exposing the digest or extending the parent; actual logout durably revoked A and private authority returned 403; login B for the same active user returned 403 without replacing the retained owner. The original lease/payload remained unchanged.

Cleanup retired exact owned SQL identities, grants and entitlement before deleting the exact leased D1 fixture. Uncertain ownership, native mutation outcome or retirement retains the safety lease and records operator recovery. No provider database, worker or route was created. The original synthetic site's checkpoints, versions, heads and proposals remained unchanged. Independent cleanup readback confirms zero active test accounts, roles, clients, sites, entitlements, magic links, native parents or editor grants; the D1 fixture and private connection file are removed. The archived synthetic site remains as an audit fixture. This is retained-job replay acceptance, not fresh public enqueue or actual provider execution; fresh producer behavior and portal coverage are automated tests.

## Browser and workspace verification

Authenticated browser checks confirm the portfolio, existing site Overview, saved drafts and named versions render with their controls. QR Codes navigation renders with the expected permission denial for the restricted browser account; the authorized synthetic QR API returned 200. These browser checks are read-only and do not replace the complete two-customer acceptance matrix. The owned browser tab is closed.

The temporary clean Dashboard release checkout was retired after acceptance. The implementation commits remain on the local feature branches for reviewed integration; they are not merged to main or released to production. The report and task pack are mirrored in the owned worktree and root planning files.

## Remaining work

Provisioning metadata commit fencing, in-flight external effects, deliberate legacy-job reconciliation, preview script isolation, CPU containment, exact expiry at COMMIT, orphan cleanup and the complete two-customer/browser/public matrix remain open. The earlier checkpoint probe's first logout timeout remains unlocalized. Production integration remains separate.

The task list still contains 38 top-level tasks: R01–R05 complete as research, R06 partial, R07–R12 pending and all 26 delivery tasks pending. Client admin linking to Studio and a shared CMS/record service remain the first delivery priority. Generated customer execution stays disabled.
