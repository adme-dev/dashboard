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

1. Resolve intermittent public projection timeouts. Both scopes have successful GET/HEAD proofs with the unchanged 10-second deadline, but a later primary request returned 503 when private route discovery exceeded its transport deadline.
2. Record edits without republishing and template rollback retaining newer records pass on both scopes. Complete archive/schema/quota/revocation checks and restore the test fixtures.
3. Complete the equivalent first-scope browser/publication journey and remaining hosted negative matrix (roles, schema, quota, archive, pointer epochs and revocation).
4. Finish narrow-viewport hosted property/outline verification and record the final Studio rollout/version.
5. Improve closed-tab request recovery without duplicate generation charges or weaker native authority.
6. Refresh paired current-main/CI/QR verification, PR descriptions and release records.

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
