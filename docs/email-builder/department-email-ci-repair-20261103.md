# Department email PostgreSQL CI fixture repair — 3 November 2026

The eight failures in general CI `41453139060` are reproduced and repaired in the PostgreSQL fixture. No production source was changed by this worker.

## Proven cause

CI workflow head: `956330e9b1131b50b368e8c236dea1e166f53a2f`; its synthetic merge checkout was `2c4200953f597ee76bf3c499d96c4e4c1016ee86`, with parents `052eefaf992b8a6bd419b069f544c6aec7da64bb` and `956330e9b1131b50b368e8c236dea1e166f53a2f` (existing CI receipts under `.verification/ci-followup-956330e9b/`). Local diagnosis ran on `bc8a3ba961c117b4a27efc61cd486af237339bac`; ending HEAD is `bc8a3ba961c117b4a27efc61cd486af237339bac`. Before correction, the owned fixture and `campaigns.ts`, `review.ts`, `email.ts`, and `departmentEmailOperations.ts` were byte-identical to head `956`. Concurrent slice4 work subsequently changed monitored production source; the before/after receipts and hash table below distinguish the initial `956` comparison, the verified test snapshot, and the later handoff observation. This worker made no production edits. Final PG and neighboring checks recorded identical before/after source hashes, and the final receipt distinguishes those bytes from `956`. These are local checks bounded to their recorded source snapshot; they do not change the failed remote run. `campaigns.ts` changed again after both final test invocations; no result is claimed for that later edit.

The first draft operation returned `{"ok":false,"code":"unavailable"}`. The real `isEmailReviewWorkflowEnabled()` then exposed the concrete underlying error:

```text
[vitest] No "getCachedBinding" export is defined on the "~~/server/utils/email" mock. Did you forget to return it from "vi.mock"?
```

At head `956`, `campaigns.ts:278` calls the real review-workflow gate while choosing the optional `review_required` INSERT column. `review.ts:103` reads the cached binding; the real email module exports this function (`email.ts:16`), but this fixture omitted it. The department operation's exception boundary maps that uncategorized mock error to `unavailable` (`departmentEmailOperations.ts:656`). Eight email tests failed during draft setup; eight other tests passed. This is a missing fixture contract, with no proven product-source defect.

## Fixture change

- Add only `getCachedBinding: () => undefined` to the existing email dependency fake. Keep the real review gate and explicitly unset `FIGFLOW_EDM_WORKFLOW_ENABLED` in the fixture, exercising its default-off path.
- Preserve the pre-497 path, adding the real existing migrations `163` (custom modules) and `491` (canonical design foundation) verbatim after a concurrent source change introduced a canonical template lookup. An additional real database assertion proves `campaigns.review_required` is absent, while real draft creation succeeds. Draft creation also asserts zero fake batch/test dispatches.
- Replace fixed `dept_email_test` pre-drop with `dept_email_test_<UUID>` per execution. Create without `IF NOT EXISTS`, mark ownership only after successful creation, and drop only an owned name matching the strict UUID pattern; always close the client. No existing schema is pre-dropped.
- Restore explicit `CREATE EXTENSION IF NOT EXISTS citext WITH SCHEMA public;` after independent review identified a P2 extension-lifetime issue. The owned schema cleanup cannot remove a public extension. Existing extensions are never moved or dropped. The previous scratch cleanup receipt describes the earlier fixture only; it is not proof of the revised extension lifetime.
- Use Vitest environment stubs and restore their original values after the suite, including the previously leaked synthetic link secret. No production gate is replaced or weakened.

All **134 original assertions** remain byte-for-byte intact as assertion expressions, and all **16 test names and their order** are unchanged. Three assertions were added (137 total). Existing consent, exact recipient, suppression, immutable freeze, independent review, request-binding precedence, fresh authority, idempotency, and zero-dispatch-on-refusal assertions all ran unchanged. No inventory assertion or shared helper was edited.

## Concurrent source dependency and correction

After the original mock correction passed 16/16, final source comparison caught concurrent changes. A bounded current-source check produced **1 failed / 15 passed / 0 skipped**, with safe draft result `unavailable`. A temporary direct call to the real campaign creator proved PostgreSQL **`42P01`: `relation "email_design_documents" does not exist`**. This was a separate fixture schema dependency introduced by the new unconditional canonical-template lookup, not the original missing mock export. Evidence: `current-source-pg.json` and `current-source-diagnostic.json`.

The existing migration `491_email_design_revisions.sql` supplies the real design documents/revisions and requires modules from `163-edm-custom-modules.sql`. Both now execute verbatim in the owned namespace. No canonical lookup, database behavior, migration constraints, recipient checks or production gate was faked or bypassed. The fixture still omits migration 497, and its new assertion verifies the default-off path works without `review_required`. The coordinator was notified of both the original cause and the concurrent dependency before completion.

## P2 review follow-up — explicit public citext lifetime

Independent review `.verification/reopen-and-ci-fixture-review-20261103.md` found no P0/P1 and identified P2-1: a database-wide citext extension installed in a temporary namespace could outlive/interfere with concurrent fixtures, and `DROP SCHEMA … CASCADE` could remove it. The bounded correction restores the original explicit placement in `public`; the UUID-owned schema creation and guarded cleanup are unchanged. This follow-up changed **one fixture SQL line only**, with no product source, helper, assertion, migration list or environment-handling changes.

- Before fixture SHA-256: `2f24906d6926082b4acbddbaccfbbc5cea0e8c4ef793445a6056e6628fc04f1c` (the prior tested fixture).
- Revised fixture SHA-256: `ff4a6cdcaacae7641158afcb7b84ee4c5b4f349e646cdeabcdfcfbe6c9b353d7`.
- Node 24.18.0 scoped ESLint passed with no diagnostics (`citext-review-lint.json`).
- A read-only transaction on the exact approved Unix socket found **no citext extension** (`citext-review-namespace.json`). No extension or namespace was created, moved or dropped during this follow-up, and no other database changes were made.
- **Fresh PG verification is pending general CI on its fresh dedicated database.** No local PG run was attempted because creating a public extension on this shared scratch cluster is outside the authorized namespace scope. No neighboring tests were rerun against the moving backend.
- `citext-review-source-freeze.json` records point-in-time source hashes before/after lint and the retained test-receipt hashes. The fixture stayed unchanged through lint at the revised hash for parent integration. Production source changed during that interval; the receipt identifies each changed path and both hashes. The backend remains concurrent work, not a claimed globally frozen candidate.
- `citext-review.diff` proves the sole fixture-line change. The original 16 PG / 80 neighbor evidence and cleanup receipt remain unchanged and source-bounded to their original fixture/source hashes; they do **not** validate the revised fixture or current backend.

## Validation

Node **24.18.0**, existing dependencies, Vite `envDir: false` via an owned validation config; no `.env` was loaded. Real PostgreSQL used only Unix socket `/private/tmp/figflow-postgres-20261102-recovered`, port `55483`, role `figflow_test`, database `figflow_design_test`; identity checks confirmed no TCP connection. Provider clients remain existing in-process fakes; there were no real sends.

| Check | Result | Safe receipt |
| --- | --- | --- |
| Red, isolated schema, original missing mock export | 8 failed, 8 passed, 0 skipped; exit 1 | `red.json` |
| Initial mock-only green | 16 passed, 0 failed, 0 skipped; exit 0 | `green.json` |
| Concurrent source, before schema update | 1 failed, 15 passed, 0 skipped; exit 1; `42P01` proven | `current-source-pg.json`, `current-source-diagnostic.json` |
| Prior full affected PostgreSQL file (before P2 fix) | 16 passed, 0 failed, 0 skipped; exit 0; source hashes stable | `final-pg.json` |
| Prior eight neighboring scoped files | 80 passed, 0 failed, 0 skipped; exit 0; matching stable source hashes | `final-neighbors.json` |
| Prior scoped ESLint | Exit 0, no diagnostics | `lint.json` |
| Revised fixture scoped ESLint | Exit 0, no diagnostics | `citext-review-lint.json` |
| Revised fixture fresh PostgreSQL check | Pending fresh dedicated general CI; shared scratch has no public citext | `citext-review-namespace.json` |
| Original assertion/test inventory | 134/134 preserved, 16/16 names/order retained | `assertion-inventory.json` |
| Historical scratch cleanup (before P2 fix) | No `dept_email_test%` namespaces or `citext` extension remained; matches that run's before-state | `cleanup.json` |

Neighbor files: `departmentEmailInboxOperations`, `departmentEmailInboxTools`, `emailCampaignSendingRuntimeConfig`, `emailCampaignSend`, `emailCampaignDispatchSnapshot`, `emailCampaignSenderSuppression`, `emailReviewWorkflow`, and `emailReviewRoutes`. Their exact paths and named outcomes are in `final-neighbors.json`. The runner retains allowlisted test/result/error metadata only; temporary reproduction instrumentation was removed before green verification.

Safe evidence directory: `.verification/department-email-ci-repair/`. Its `SHA256SUMS` hashes every evidence output plus this report and the final fixture; validate from the checkout using `shasum -a 256 -c .verification/department-email-ci-repair/SHA256SUMS`. Final fixture SHA-256 after P2 correction: `ff4a6cdcaacae7641158afcb7b84ee4c5b4f349e646cdeabcdfcfbe6c9b353d7`. The red/green and source receipts have their exact hashes in that manifest.

## Prior repair source hashes (before P2 fix)

SHA-256. Both final invocations have matching, stable before/after hashes. The later handoff observation captured another campaigns edit; the test results apply to the verified column only.

| Path | Head 956 | Verified final test snapshot | Later handoff observation |
| --- | --- | --- | --- |
| `test/ai/departmentEmailInboxPostgres.test.ts` | `58ec62cdfed835ece34d440ea34d17cf01d50e49ce5a6632a0eb2222c2c8ef78` | `2f24906d6926082b4acbddbaccfbbc5cea0e8c4ef793445a6056e6628fc04f1c` | `2f24906d6926082b4acbddbaccfbbc5cea0e8c4ef793445a6056e6628fc04f1c` |
| `server/utils/email-marketing/campaigns.ts` | `f0c3793f35fd8edd64d3da8aafe010932943eb1851cc41a469c2cb407b2701cd` | `394feca5a3d1cc19d92e0b94fe97ac370882f0d7f24d1c8a6ea4c544e2779437` | `61c427bcd774b171445cae0879ccf890ffad8455048d147648d5d255fc82f7f5` |
| `server/utils/email-marketing/review.ts` | `a2dc8ed3c9e92067ee5310920437ec51394f753ccf67af4f6cea9fba39c80209` | `ab278a543f95b6a02045e180f5f1b17817267208a7ff4a651b0f4e1d8101ac8d` | `ab278a543f95b6a02045e180f5f1b17817267208a7ff4a651b0f4e1d8101ac8d` |
| `server/utils/email.ts` | `6cbaeabefbb9e1b72fef204c444103a58b4ca5d10de53d5d649c460d5bd1331b` | `6cbaeabefbb9e1b72fef204c444103a58b4ca5d10de53d5d649c460d5bd1331b` | `6cbaeabefbb9e1b72fef204c444103a58b4ca5d10de53d5d649c460d5bd1331b` |
| `server/utils/ai/marketing/departmentEmailOperations.ts` | `ef390109c8b2847d8a642e375b9fe39dfb70e731941d0007371e7b790b55a1c6` | `0dace5262390af83f97d0005851cd93a65fcfbcf99249bd16533685592668d64` | `0dace5262390af83f97d0005851cd93a65fcfbcf99249bd16533685592668d64` |

## Remaining owner action

The coordinator owns integration, checking the continuing slice4 edits (including the later campaigns hash), and a fresh general CI run on the settled intended candidate. The prior fixture repair was verified at its recorded test snapshot; the revised explicit-public fixture still needs fresh PG verification in general CI, and no subsequent concurrent edit is claimed to pass. The existing general CI run remains failed; these 96 local scoped passes do not establish full CI, build, release, browser or hosted acceptance. No native, package, actual-WASM, browser, build, CI trigger, Git mutation, deployment, configured database or provider action was performed. Concurrent dirty foundation/harness work was left untouched; no global clean-tree claim is made.
