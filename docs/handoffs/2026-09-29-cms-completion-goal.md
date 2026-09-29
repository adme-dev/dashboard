# Dynamic CMS completion goal

The user requested autonomous completion on 29 September. Only the isolated synthetic staging sites and Dashboard preview are authorised deployment targets for this goal. Customer production activation remains separate.

## Verified

- Customer component generation and acceptance exist for both synthetic scopes.
- Second site: component insertion, saved property edit, reopened draft and current CMS refresh work in the actual browser. Strict checkpoint acknowledgement was repaired in `c54f93033` and verified on preview deployment `c5d0a65b-6e75-4dd5-ad40-8cd3def53b79`.
- Second site: customer saved a named draft, agency submitted the exact checkpoint for review, edit-only actor was denied approval (403, unchanged version), and authorised agency approval succeeded.
- Approved version: `ece160c8-2ce5-4e4e-b843-15cb4290cf70`; checkpoint `checkpoint_769418b3-7f1b-4de0-88a9-a5dc7f272ca4`; digest `81ac4a5cc358258ea3ec2beb595c59fb4ecbacd7b3fe793e079ce18eaec40792`.
- Attempting production publication from preview correctly returned 403.
- Staging activation with idempotency key `b_publish_goal_1` returned 500 before activation. A scoped read-only diagnostic reproduced PostgreSQL `42883`: `character varying = user_role`. Commit `caf0c9951` casts the native enum to text. The corrected publisher snapshot succeeds against isolated staging. The real PostgreSQL publication suite passes 131 checks, one existing skip, with its fixture corrected to use an enum. The same test failed before the fix.
- Standalone customer entry implemented at `/studio`, using invited/provisioned accounts and existing scoped APIs. My sites, CMS and draft history use a product shell. No new billing or publication authority. See the independent-entry architecture document.

- Dashboard source `f2c655848e3ab0473657b0538374a00f5fc3b4c9` deployed to preview `67f50adf-ccdf-41c7-804f-02bf8c4e1db0`. It includes the enum fix, standalone entry, redacted publication stage timing and a regression fix separating the remote-storage deadline from final SQL authority revalidation. The relevant suites pass 135 tests with one existing skip.
- The second site's approved version is now active: release `0c9b80ad-c168-4ba7-8d84-650ae748a239`, activation `969cb820-22a8-4b9a-ae22-a2082e42b963`, pointer version 1. Native publication and state readback succeeded. Public GET still returns 503: its authority request reaches the 10-second deadline. Publication success alone is not end-to-end acceptance.
- Standalone entry verified in Chrome on desktop and at 390px: existing invited customer login, assigned sites, CMS, draft history, return navigation, denied cross-site access, sign-out and native magic-link deep return. Open Studio launches the correct second-site editor. No email delivery was tested; the fixed synthetic account used a one-time native verification fixture.
- Additional Studio property/outline polish now serves from both synthetic editors: overlay SHA256 `3378c1a55395bf617a8457305a7a74948eb041f635b48715ad98e18570322031`, 2,508,967 bytes. The same pinned image completed startup after staging capacity changed from lite to basic in Studio `4d638d0`. Both asset probes match, and the second site's saved draft/current content reopened in Chrome. This supports retaining the increased staging capacity; no production sizing changed.
- Hosted native role negatives now also verify VIEW-only record writes and EDIT-only publication return 403 with record and publication rows unchanged.
- Preview `df6a995c-4f09-407a-b3a2-35ce6d9b86ad` (source `a0ee81b21a23ee18e72436ee05bf5e7a3fab7b21`) tested a targeted region hint. Pages retained only placement mode, and the public timeout persisted. A private service-binding diagnostic with a longer diagnostic-only deadline returned native200 in 29,257ms, with current public fields and no private/cross-scope markers. This does not satisfy the public10s deadline. Switch to Pages-supported Smart Placement and trace the native projection stages.

## 29 September routing and first-site progress

- Primary customer editor: inserted the accepted component once, edited its heading to “Services at Northline Motors”, saved and reopened the draft. Both preview frames retained current public records and excluded private fields. The exact checkpoint `checkpoint_2c1be2a7-2519-4266-a5d2-2ab51673c509` was submitted as version `e49c866a-1420-47cc-881b-3a4652b5a137`, compared and approved. It is not published yet.
- Preview source `41a26adc1` is deployment `8c73b856-b630-49d6-8618-27196d6ffdc1`, with Pages-supported Smart Placement. The private staging control gateway at source `6c7309ef1` now runs near the isolated US East Postgres database. Authority reads improved to roughly 100–150ms.
- Provisioning D1 reported its primary in Sydney. Studio staging now resolves routes through bounded private Service-binding fetch near that primary. Coordinator version `94646d01-4cfb-4d0e-97d9-0f3b9e1a6aee`; router version `1977632b-d274-4fb6-aefd-3c2c2f885caa`. A real Workers-runtime test caught and fixed unsupported redirect handling. Public rendering still exceeded 10 seconds because the native adapter repeated target/object/target RPCs.
- The next adapter uses `readManagedCmsObjectsAtTarget`: one bounded read with the admitted target, fresh route checks before and after, and unchanged physical ownership/hash/scope checks. Deploy the matching Studio router before this Dashboard revision. No fallback is allowed when that method is missing. Production release must also follow this order; no production deployment is authorised by this goal.
- Verification for this increment: business-content suite 890 tests passed; native graph/release/action PostgreSQL integration 171 tests passed. Hosted timing verification remains pending deployment.

## In progress / remaining

1. Resolve intermittent public projection timeouts. Both scopes have successful GET/HEAD proofs with the unchanged 10-second deadline; earlier isolated requests returned 503. Staging route diagnostics now distinguish authority, provenance and snapshot latency.
2. Implement and verify the reviewed newly-private-field transition through the accepted CMS graph. `checkPreparedItem` currently rejects visibility changes with `GRAPH_SCHEMA_CHANGE`; ordinary managed schema writes also require graph acceptance. The existing wrong-version check proves conflict handling only.
3. Finish paired current-main/CI verification and final release records. Current PR descriptions are being updated; no production release is authorised.

Durable closed-tab recovery and final hosted keyboard/property/outline checks
are complete in both editors. See the records below.

The equivalent browser/publication journeys, current-record edits, rollback,
archive, schema-version conflict, quota exhaustion and permanent activation
revocation checks now pass in both scopes. Cross-site requests were denied with
404 in both scopes. Edit-only approval/publication and read-only record mutation
were denied in the second-scope role fixtures. The duplicate management staging
panel is repaired and verified in Chrome.

Private request/response receipts and the fixed-scope acceptance harness are under `/private/tmp/cms-typed-acceptance-20260929`. Credentials and raw storage objects are excluded from repository documents. A failed request is never repeated with a new intent simply to make it succeed.


## Hosted public proof, 29 September 09:40 UTC

- Studio router source `8d094ef`, deployed staging version `a3711001-d5c9-46a7-b914-5dc014d7c939`; native source `e4d70cc8bed41e74d624d959b160ccb29eb2067a`, preview deployment `b295c2ec-441b-4c2d-a9c5-22599da62751`. Provider readback confirms source and preview alias. Both sources include freshly fetched main.
- Both synthetic hosts passed public GET + HEAD (200), `no-store`, correct section headings/current public records, and private/cross-tenant marker exclusion. The first measured second-site request took 9.026s; the 10-second deadline has not changed.
- Primary approved version is now active in staging: release `e19a9974-8069-42b8-8148-17abcfb12fbe`, activation `c5b8f316-f895-4e46-ae73-f76a5361a0ab`, pointer version 11. Publication returned 200 and native readback succeeded. Chrome independently shows the public component and current public fields.
- Second record revision 3 (`CMS_DESCRIPTION_B_3`) appears publicly while release `0c9b80ad-c168-4ba7-8d84-650ae748a239` and version `ece160c8-2ce5-4e4e-b843-15cb4290cf70` remain unchanged. Primary revision 2 (`CMS_DESCRIPTION_A_2`) also passes public GET/HEAD without template publication. Private markers remain excluded.
- One successful second record write was followed by an evidence-filename collision in the private harness. The write was not repeated; a separate native read confirmed revision 3. The harness now uses a distinct follow-up-read label and preserves the original receipts.
- Narrow hosted dialog check: scroll shell stays within 390×844, no horizontal overflow, labelled heading field works. Escape from a text field needs a follow-up Studio image: source fix `94c13ab`, 1,393 overlay tests/typecheck/build/lint pass, not yet deployed in the editor image.


## Rollback and stale identity proof, 29 September 09:55 UTC

- Second templates were saved in Chrome, compared, approved and published: primary version `07ab4b7f-0796-4db1-b836-3718a8bf36f3`, release `a5b11872-a1ec-4288-8e76-f010bf4c6cd3`, pointer 12; second version `abc2def4-3640-47e9-9d73-07f5b7fffc71`, release `043db28c-8e8e-4bcd-b8fd-50d92fe7be0d`, pointer 2. Both public templates passed GET/HEAD/privacy checks. One second-site publication attempt returned 500 before pointer change; exact native state was inspected, and the same idempotency key succeeded on retry.
- New records were saved after those publications: primary revision 3 (`CMS_DESCRIPTION_A_3`), second revision 4 (`CMS_DESCRIPTION_B_4`). Native rollback restored each first CMS release with record readback byte-identical before/after. Both public pages show the first heading with these newer records, return GET/HEAD 200 and no-store, and exclude private/cross-scope markers.
- Primary restored release `e19a9974-8069-42b8-8148-17abcfb12fbe` has a fresh activation `778e38ab-1820-43fa-be06-a45a46bfd232`, pointer 13. Second restored release `0c9b80ad-c168-4ba7-8d84-650ae748a239` has activation `c4b138f3-be1a-4d10-9534-f14c00e3d751`, pointer 3.
- Each exact second-template private projection first returned native 200. Replaying the unchanged body after rollback returns native 409 `PUBLISHED_FEATURE_UNAVAILABLE` for both scopes. The older second first-publication identity also returned 409 after template-two publication. A concurrent record-edit probe failed closed during projection; stable post-edit probes passed.
- Reliability remains open: one primary public request returned 503. Fixed-stage logs isolate the failure to projection (12,374ms); router logs show an 8-second route-transport timeout, while individual coordinator fetches sometimes take 9.5–9.9 seconds. Other projections take roughly 5.9–7.9 seconds. Successful later reads do not close this intermittent issue.
- Archive and schema-version mismatch checks are now in progress on the run-owned records. Do not freeze quota/revocation fixtures until archive restoration completes.


Archive checks passed on both public hosts (GET/HEAD 200, no-store, original
heading retained, archived/public/private/cross-scope record markers absent).
Wrong-schema writes were safely rejected before storage, but returned 502
`COLLECTION_RESPONSE_INVALID` because an absent requested version (`null`) was
treated as a malformed response. The native boundary now returns 409
`COLLECTION_CONFLICT` for that case; malformed non-null responses retain 502.
The regression failed before the fix. Hosted re-verification and archive
restoration remain pending this preview build.


## Schema rejection verified, 29 September 10:09 UTC

Preview `737e5b11-bf83-4b62-acd4-72400206ff14` serves source
`e54a477a227076357876b17f8209d2c6f6fd1020`; provider readback verifies the
preview alias, staging runtime digest and successful deployment. Both scopes
now reject nonexistent schema versions with 409 `COLLECTION_CONFLICT` and
byte-identical record readback. This proves version conflict handling, not the
separate newly-private-field migration case. Archive restoration is in progress.

The management page also mounted staging twice when its default runtime state
was staging. Overview now mounts its additional publishing panel only for a
production runtime state; the dedicated staging panel remains the staging entry.
Lint and Vue template compilation pass. Hosted verification follows the next
preview build. No production deployment or activation was performed.


## Hosted negatives and recovery, 29 September 10:22 UTC

- Preview `00afb4c1-5f8d-4c44-b8b8-bcdbe328f038` serves source
  `607fe1fd11000759602859bdd8a0982a8b3cc946`; provider readback confirms the
  preview alias and expected runtime digest. Chrome shows exactly one Website
  staging panel, and the QR Codes navigation/page still loads.
- Both archived records were restored via normal writes with the same values:
  primary revision 5 (`CMS_DESCRIPTION_A_3`), second revision 6
  (`CMS_DESCRIPTION_B_4`). Both public GET/HEAD/privacy checks passed.
- Quota tests temporarily lowered each synthetic entitlement to actual usage
  (primary 30, second 9). Hosted generation returned 429 `AI_USAGE_EXHAUSTED`
  with no additional AI reservation and unchanged usage. Exact conditional
  updates restored the original limits (100 and 20). This verifies native
  pre-provider admission; it does not claim independent provider telemetry.
- Each current rollback activation first passed a private native projection.
  Exact scoped revocation then left pointer, release, seal and record heads
  unchanged. The same projection returned 409 `PUBLISHED_FEATURE_UNAVAILABLE`;
  public GET/HEAD returned 503/no-store with no record markers.
- Recovery used the normal retained-release restoration API. Primary template-two
  release `a5b11872-a1ec-4288-8e76-f010bf4c6cd3` is now active with fresh activation
  `32256e88-2686-4749-afe3-051f75543918`, pointer 14. Second release
  `043db28c-8e8e-4bcd-b8fd-50d92fe7be0d` has activation
  `dde717de-9b30-44fb-bc57-9d33677d86f8`, pointer 4. Records were byte-identical
  before/after recovery, both public GET/HEAD/privacy checks pass, and replaying
  either revoked identity still returns 409.
- Attempts to activate an already retained version correctly returned 409
  `RELEASE_ALREADY_EXISTS`; no retry changed those results. The private fixture
  validator now accepts exact native restoration receipts as well as activation
  receipts, retaining its scope/current-pointer/seal/record/identity checks.
- Studio coordinator source `a212813`, staging version
  `4fa95823-02ee-40c8-94c3-ab80576ec0ec`, emits only fixed stage/outcome/timing
  fields. First observations show authority reads taking 0.3–2.5 seconds while
  local provenance/snapshot reads take tens of milliseconds. This narrows the
  investigation; intermittent reliability remains open.
- The second synthetic fixture expiry was extended with an exact conditional
  update of `effective_until` only, to `2026-09-29T14:05:01.397Z`. The plan,
  permissions and usage were unchanged. All evidence remains private.


## Durable component request recovery implementation, 29 September

Migration 437 adds a metadata-only native request ledger scoped to tenant,
client, site, environment and signed actor. Its transactional claim serializes
concurrent tabs before any generation charge, retains dismissed IDs against
replay, and checks live model/checkpoint authority before and after writes.
Reopening the library discovers the pending ID and its saved-draft digest; reads
never trigger inference. Dismissal must acknowledge that exact request, and late
acceptance cannot clear a newer request. No prompt, token or generated content is
stored in the ledger.

All 37 disposable PostgreSQL cases pass, including real lock races and final
authority rollback. Migration 437 was applied only to the isolated synthetic
staging database; the initial ledger was empty. Gateway and internal error
tests pass (23 cases). Studio recovery client, worker and editor checks pass;
full Studio checks and hosted closed-tab acceptance remain in progress. Deploy
the native preview and private staging gateway before the new Studio worker and
editor image. This is not yet a hosted-completion claim.


## Recovery rollout in progress, 29 September 10:54 UTC

Native source `dab193db53d14d34c1525e54b87a7c0b9030bf55` is deployed to preview
`17a1e217-0ea0-4c79-89d4-13d60a378f97`; provider metadata confirms source and
preview alias. Staging gateway version `79733f06-05bd-4ba3-898c-dcaa0005a856`
is at 100%. Both synthetic native runtime-state reads return 200.

Studio source `b27ece5db9cc13f316eeae367fa8708e1f13e550` passes full build,
typecheck, tests and lint (1,437 files), plus four actual Chromium dialog tests.
All 29 editor image files match that build. Staging-only pin `c93189f` selects
image `ab2147ece0e5aacb11dc782cefe0672ccdfd9d2d02863657ca88c09aaa7baa08`;
worker version `4a636efa-f14b-43cc-bf24-bb458e03065e` is at 100%. Container
rollout `6046cb91-d285-4055-8a1b-460176848093` is still progressing from
version28 to29. A worker deployment alone is not editor-image acceptance.
Hosted closed-tab, Escape/keyboard and final asset verification remain open.

## Hosted recovery acceptance, 29 September 11:15 UTC

The version29 rollout completed with all seven instances healthy and no errors.
Both normally launched editors serve the expected overlay SHA-256
`42128afc4a1daf3188aba5a0385ec08630700da21a37ab19757ecc7a8880cd03`
and hook bytes. Escape from the primary dialog's description field closes it
and returns focus to its trigger.

Each scope generated one disposable request, then its original browser tab was
closed. A separately opened tab discovered the request from native storage;
Generate remained disabled even with a nonempty description. The primary
request failed bounded component validation, and Check previous request reported
the unavailable result without generating again. The second request recovered
its exact two-component proposal and rendered both previews. Neither proposal
was accepted, inserted or published.

Explicit Discard previous request acknowledged each exact native ID, removed
the recovery/review UI, and retained a dismissed tombstone. Full native usage
rows were byte-identical before checking, after checking and after dismissal:
33 primary and 12 second-scope reservations. These counts include the original
generation attempts; recovery and dismissal added zero. Existing website
checkpoints, records and publication pointers were not mutated by these tests.

Evidence: `/private/tmp/cms-recovery-image-20260929/`, including the three
`*-closed-tab-*.json` snapshots and recovered/dismissed screenshots. During final
keyboard review, Tab escaped to the document body; a real Chromium regression
independently reproduced focus reaching a control behind the dialog. The local
focus-wrap fix is undergoing full checks. Hosted keyboard completion remains
open until that updated editor image is verified.

Dashboard CI found two stale expectations after 14,887 other passing tests:
the marketing navigation now correctly opens `/studio`, and the publication
role predicate now casts its PostgreSQL enum to text. The navigation assertion
and frozen inventory digest were updated after reviewing the exact source diff;
inventory counts and classifications are unchanged, with an explicit assertion
for the cast predicate. Both suites pass all 14 checks, and touched-file ESLint
passes. The full CI rerun remains required.

## Hosted editor polish complete, 29 September 11:35 UTC

Studio application `16e2c9cfe38ec550cc0ecf2692bf606fe9bdd7e9`, configuration
`e165568ae2fade9bdb2c938b0f25e236d54ad3aa`, is deployed only to staging.
Worker version `36870245-2349-4504-a44e-180941359197`, deployment
`09053411-9562-4a5f-b8b1-7a1e9bfda06c`, serves image
`05b165550096d8663f439e7f5ddb10fbdfa34cd8dc7369eb46936252c2df58e6`.
Container rollout `9a72f8fe-ca48-4eef-b3df-19e1b986cc78` completed all seven
instances at version30 without health errors. Both editor overlay/hook hashes
match the packaged build.

Chrome verifies Tab and Shift+Tab wrapping, Escape dismissal and trigger focus
restoration in both editors. The 390×844 dialog has no horizontal overflow;
its saved Heading field has one linked label and is 34px high. Both outlines
show Custom component. Six real Chromium checks, full Studio build/typecheck/
tests/lint and 39 staging security/configuration tests pass. Evidence:
`/private/tmp/cms-focus-image-20260929/`.

Public reliability remains open: the 11:23 UTC sample returned primary503 in
12,662ms and second200/current content in 7,065ms. Coordinator authority reads
spiked to 2,429ms and 3,344ms. An isolated read-only EXPLAIN ANALYZE of the exact
native completion query took 0.083ms (planning0.187ms); this points further
investigation toward service transport/request startup, not proof of a slow SQL
plan. No timeout or fresh-authority check was changed.

### Private completion authority staging experiment — 29 September, 11:56 UTC

Public GETs reproduced the remaining latency failure: primary200 in11.009s;
second503 in10.477s. Native second projection finished after10.256s. Of its
four fresh completion checks, three took15–26ms and one took2290ms; the exact
SQL plan executed in0.083ms. This isolates an expensive native HTTP/request
path; cold start versus connection acquisition is not yet proven.

The staging control gateway now selects a private service binding for only
`POST /internal/page-studio/content-attachments/completion`. The existing
management Worker exposes a separate `ContentAttachmentAuthority` entrypoint
with only `readCompletion` and HTTP404. The shared reader preserves exact
scope/operation SQL and strict equality of the whole committed receipt. Every
coordinator before/after authority fence remains. Fresh Hyperdrive caching is
verified disabled against the isolated staging Neon database. No caching,
retries, fallback to HTTP, deadline changes or activation mutations are added.
Production transport configuration remains unchanged.

Requests are capped at4096bytes, parsed strictly, and checked against the
configured environment. The gateway revalidates the full returned receipt and
uses fixed safe errors. Unit tests initially failed on the missing transport;
real workerd tests verify the named entrypoint and actual service-binding proxy.
Verification:202 focused Worker/endpoint tests and111 real PostgreSQL tests pass;
both Worker typechecks, touched-file lint and staging dry-runs pass. Hosted
performance remains unverified until the two Workers are deployed and measured.
Rollback targets before this experiment: control79733f06-05bd-4ba3-898c-dcaa0005a856;
management76c518c4-ffd6-4c16-a848-337764381368. No Pages or customer production
release is part of this experiment.

The previous Dashboard head004db21a3 completed both current Linux CI jobs
successfully (runs36562875546 and36562869606). New source changes require their
own CI; Studio57c5b16 Linux/Windows jobs remain in progress at this checkpoint.

### Completion RPC deployed; storage-region follow-up prepared — 12:10 UTC

Dashboarda3028f20e deployed managementf4a1ce9e-b39e-4df0-8094-119f730d4324
(deployment03ec4e3d-fb3b-4e36-b4ce-581ee95c03d6) then
control9d351913-6eb3-48b3-8a78-f3cce5bacc59
(deployment84c8df83-bad2-4ebd-8fe1-0930a41d2617), both100%.
Eight hosted receipt checks pass: each exact scope200, changed digest/business403,
wrong environment503. The named capability additionally passes real workerd
valid-input/missing-Hyperdrive503, unrelated management RPC denied, HTTP404.
Private probe is stopped. Evidence: `/private/tmp/cms-completion-rpc-20260929/`.

Public latency remains open. First pair:primary503/15.116s, second200/7.797s;
second pair:primary200/8.468s, second200/7.432s. Current fields rendered and
private fields stayed absent. Fresh completion calls measured29–218ms, but
other native requests still had startup/authority spikes. The physical object
read occupies several seconds between the route checks.

Read-only provider `SELECT 1` confirmed the two synthetic storage D1 primaries
in MEL and SYD (zero rows written). The next change calls the existing content
router using private fetch, enabling its Sydney placement for physical reads.
Only preview sets `PAGE_STUDIO_CMS_OBJECT_TRANSPORT=placed-fetch`. Exact native
scope, admitted target and pin batches are retained; every existing router
fence and physical proof runs unchanged. Responses are streamed with a2MB cap,
validated by the existing object parser/hash checks, and failures never fall
back to RPC. Production retains its prior transport. Deploy the Studio router
endpoint first, then preview; do not claim this latency item complete yet.
