# CMS client permissions and conflicting edits — 20 September 2026

## Outcome

The existing client-admin CMS passes real Chrome acceptance for editor/viewer
access and conflicting edits. No application changes or deployment were needed.
This continues the [completed production connection](./2026-09-20-page-studio-cms-production.md);
Fantasy production content and the user's browser sessions were not touched.

## Tested behavior

| Scenario | Result |
| --- | --- |
| Two client editors open the same saved collection | Both receive the same saved content and can edit. |
| Viewer opens content | Read-only message; fields and add/remove/save controls disabled. |
| Viewer bypasses the controls with a direct PUT | HTTP 403; saved content unchanged. |
| Same-client account without site membership reads content | HTTP 403. |
| Both editors change the same record; A saves first | A succeeds; B receives HTTP 409. B's text remains visible and another save is disabled. |
| Conflicted editor cancels Reload | Unsaved text remains. |
| Conflicted editor confirms Reload | Latest saved text appears; conflict clears; a new edit saves and survives reopening. |
| Editor becomes a viewer while its page is open | Subsequent save returns HTTP 403. Reload shows read-only controls. |

The harness uses separate headless Chrome contexts and temporary synthetic
accounts. Each signs in through the existing magic-link verification endpoint;
no email is sent and no existing user's cookies are read or changed.

## Source and preservation evidence

- Staging origin: `https://preview.agency-dashboard-6cm.pages.dev`.
- Provider-confirmed deployment: `f7d9a415-9f30-4eef-824a-9f27275ad168`.
- Deployed application source: `b916537580bf82c49c2518d7db023986d823e848`.
- Acceptance branch base: Dashboard main `36526e725588447bd9a043add0d9d96b0a1fe0e3`.
- Synthetic site: `a27135dc-1374-475c-a56d-7e60310425bb`.
- First successful run: revision 2 → 5. Reviewed final run: revision 5 → 8.
  Each restores the original collection through a normal revisioned CMS write;
  earlier revisions are retained.
- The IDs of all 13 page checkpoints and five named versions, and the current
  pointers, are unchanged. Checkpoint/version payloads were not compared in this slice.
- Final run confirms zero active fixture sessions, unexpired magic links, active
  fixture users or remaining site memberships. Deactivated synthetic accounts
  remain as attribution for retained CMS revisions.

Sanitized evidence:
`.verification/page-studio-builder-rnd-20260917/cms-client-acceptance-20260920.json`.
No credential values, cookies or browser traces are included.

## Verification

- Five grouped live acceptance cases pass on the reviewed harness.
- 62 focused CMS regression tests pass.
- Final Dashboard suite: **14,069 passed, 657 skipped** across 2,070 passing and
  29 skipped files. Optional database cases were not enabled in this run; these
  counts do not replace the separately recorded prior PostgreSQL verification.
- Changed-script lint, syntax and whitespace checks pass. Independent review
  found two test-cleanup gaps, both resolved before the final acceptance run:
  reconcile a committed write whose response failed, and explicitly report
  fixture-retirement failures.
- The first full-suite attempt was stopped after sandbox restrictions blocked
  browser/local Worker tests. The allowed rerun completed successfully.
- Application build/typecheck and Studio tests were not repeated: application
  source is unchanged. Their preceding results remain in the production report.

## Repeatable test

`scripts/page-studio-cms-client-acceptance.mjs` requires explicit
`CMS_ACCEPTANCE_ALLOW_MUTATION=synthetic-only`, a private
`CMS_ACCEPTANCE_CONNECTION_FILE`, and a writable `CMS_ACCEPTANCE_REPORT` path.
It rejects any database host/database, site, tenant, client or baseline collection
outside the fixed synthetic fixture. It needs installed Playwright, Chrome and
network access. Credentials remain private and must be deleted after use.

On uncertain saves it reads authoritative content, checks the run's actor and
exact payload, then restores using the current revision. Unrelated concurrent
edits fail cleanup rather than being overwritten. Failure reports retain fixture
IDs and the original synthetic baseline for deliberate recovery.

## Remaining work

This closes the portal/editor/viewer and concurrent-edit browser acceptance gap
listed in the production report. It does not complete the wider cross-customer,
keyboard/mobile, Studio canvas-to-content or generated-schema acceptance matrix.
The 26 builder delivery tasks and partial R06 research remain open. Next delivery
work is the shared access-policy/schema foundation and Studio Content integration;
Fantasy's actual collections and page bindings require reviewed customer facts.
Generated customer backend execution remains disabled.
