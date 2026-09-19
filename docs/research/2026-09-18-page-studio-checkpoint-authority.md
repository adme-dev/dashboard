# Page Studio — ordinary checkpoint transaction authority

18 September 2026. R06d.3 follow-up. Implementation and local verification complete; paired staging deployment and four instrumented live acceptance cases pass. A first-attempt logout timeout remains an unresolved reliability observation. Production is unchanged. R06 remains open.

## Result and boundary

Ordinary browser and bearer editor saves now supply their original signed session to a dedicated private editor commit route. A forged forwarding header is ignored. Missing or denied credentials cannot fall back to the trusted service route.

Dashboard verifies the token, actor, scope and checkpoint capability, then checks current authority inside the transaction that writes checkpoint metadata, the draft head and audit. Authority locks serialize a save against logout/revocation. Final clock checks also apply to replay. The site uses `FOR NO KEY UPDATE`, avoiding the site/audit foreign-key deadlock when logout completes while a save waits.

Provisioning retains its guarded null-base CAS service route; native-admin restore retains its trusted writer. These are distinct callers requiring separate lifecycle work. No schema migration or public UI feature was added. Ordinary saves do not consume AI allowance or create published versions.

## Verification

| Check | Result |
|---|---|
| Dashboard full suite | 13,961 passed; 421 skipped, including the separately run database suites |
| Studio full suite | 3,139 passed, including security suite |
| New disposable PostgreSQL cases | 26 passed across agency/client identities |
| Existing PostgreSQL regressions | 167 passed |
| Latest endpoint/gateway focused check | 42 passed |
| Studio build/typecheck/lint | Pass; 863 files clean |
| Dashboard changed-file ESLint | Pass |
| Dashboard typecheck | 913 baseline errors; exact normalized comparison has no added or removed diagnostics |
| Application source review | No remaining Critical or Important findings; provisioning separation and absence of fallback explicitly reviewed |

The new PostgreSQL cases cover both save/logout orderings with actual lock contention and logout audit foreign keys, revocation/expiry while waiting, replay after revocation, scope/actor/capability failures and save with no AI budget. The initial database RED run failed the absent-writer contract; it did not execute 26 independent failing behaviors. Endpoint and Studio forwarding tests were also observed failing before implementation.

Evidence is under local `.verification/page-studio-builder-rnd-20260917/checkpoint-*`. Credentials are excluded from reports.

## Source and rollout

Dashboard code: `1141bd8dbce8322a01fa1bb736283be4cc27785c`, includes freshly fetched main `a917386dde67f06921843fd6e3a1ed1b4b984c6f`.
Studio code: `033775a981d575df4c4aa91f6bb256ac15cc981a`, includes freshly fetched main `f3495cfe8ae17fb74eb9d9d7674662f4d64c2c43`.

Order: clean Dashboard preview checkout and guarded deployment; private control gateway; Studio Sandbox Worker without container rollout. Read back provider deployment IDs, sources, unchanged bindings/container and unchanged production before live acceptance. Old Studio Workers still use the trusted route, so Dashboard deployment alone is insufficient.

### Verified staging artifacts

- Dashboard preview: `37116758-470a-447b-8d11-1bf51739a94b` (source above; clean source metadata verified).
- Control gateway: version `0326131e-8e2d-4cf7-ae05-47cd4208544e`, deployment `6fc44bd4-cfc1-4d2a-91a7-366c2a9825c1`.
- Sandbox Worker: version `d20c2268-0631-4553-8fb3-bf26b7bb1641`, deployment `07225c0a-c690-4b16-bd9e-e22fed27b3a8`.
- Container application `a0329e66-ac29-49de-b757-943ac7d3299c`, version 15 and digest `4342f54e8dd9ced65fd7655eea3a81eea2b1f7deb12d5c9406a2d13553924dd2` unchanged.
- Production Dashboard deployment `8798c363-6e9c-472a-a78f-47d8ce780ef4` unchanged.
- Bundle guard: 25,463,676 / 25,468,928 raw bytes; 5,252 bytes remaining. No budget increase.

Provider readback verified exact Worker source annotations, single active versions at 100%, unchanged bindings and unchanged production/container. Evidence: `checkpoint-release-after.json`.

## Live acceptance

First attempt: real logout timed out at 15 seconds while the save waited. The harness then released its lock and the still-authorized save committed. No logout audit was found; the temporary login and grant were revoked by cleanup. This is not evidence of a commit after completed logout. The original synthetic content was restored through native admin draft history, preserving the test checkpoint. Query-shape diagnostics were added before rerunning. The instrumented rerun passed all four cases without application-code changes. Its observer confirmed parent and editor revocation before unlock; logout had no database blocker. The first timeout cannot be attributed from the original evidence and remains an open reliability follow-up, not a claimed fix.

The passing probe used a disposable agency identity and the synthetic staging site, held the actual site row, admitted a public checkpoint request, completed real logout, then released the writer. Observed result: logout HTTP 200, zero active parent/editor grants before unlocking, then save HTTP 502; no checkpoint/head/version/save audit change, only the legitimate logout audit. It retired the temporary login/grants/actor/role and removed its own verified uncommitted R2 blob (404 readback). Fresh browser launch rendered desktop/mobile previews and the expected Home page. QR page rendered with the expected restricted-account denial; the separately permitted synthetic actor received QR API 200.

Failed run `6ff5bb00-9069-4bd2-98a5-450730913008` and passing run `5ed1140c-efe6-4e17-adb9-c1108bb4f200` remain separate reports. Native recovery created `restore_ea416b05-62a1-4615-9f3b-ba6bfc65dfcc` through exact CAS against the owned test checkpoint. Its digest matches original `restore_49eaec20-e9cc-4f6c-bc63-cca5003d0739`. The committed test checkpoint remains in history; it is not an orphan and was not deleted. The first harness release-on-error path is retained as a test-harness finding and hardened before future runs. Fatal transport/connection loss cannot be represented as a successful cleanup.

Cleanup verification covered both attempts: active synthetic grants, parent logins, staff and writable roles were all zero. The private credential was removed.

## Remaining work

Native-admin restore and provisioning/job authority, in-flight jobs, exact expiry at the COMMIT instant, R2 orphan collection, preview script isolation, CPU containment and the full two-customer/browser/public matrix remain open. Private authority denial currently appears as public `502 CONTROL_PLANE_UNAVAILABLE`; clearer editor error handling remains work. Production integration is separate.

CMS and the customer component/schema library remain delivery tasks. The approved first delivery is the client-admin entry linked to Studio, shared collection/record authority and content editing inside Studio. Generated customer execution remains disabled.
