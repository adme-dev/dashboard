# Removed-form email template cleanup — 2 October 2026

Status: implemented and verified in the local Fantasy Limo demo. Independent
review approved the final change with no remaining findings. No hosted deployment,
customer activation, migration, publication or email delivery occurred.

## Customer behavior

Forms → Website email defaults → Team template / Customer template shows
"Templates for removed forms" only when saved custom templates refer to shared
definitions absent from the current website. Each row shows its subject and form
identifier. Remove stages a change; Undo removal restores it. Save template draft
commits the selected removals. Discard and existing navigation guards include
pending cleanup. Read-only users cannot stage or save removals.

An existing definition with no page placements is not a removed form. Other
overrides remain untouched, and team/customer documents remain independent.
An unchanged website template is preserved exactly, including absent optional
legacy fields. Missing images in that unchanged default do not block cleanup;
editing the default still requires normal media validation.

## Storage and authority

The existing website draft PUT accepts optional `removeOverrideDefinitionIds`:
at most 100 unique valid definition IDs. Per-form PUT rejects this field. The
server checks that every selected override exists in the scoped saved head and
its definition is absent from the admitted website document. Unknown IDs, existing
definitions, duplicates, stale checkpoints and stale revisions fail before write.

Current authorization is rechecked around asynchronous reads. Cleanup uses the
existing append-only storage contract and expected revision; no worker contract or
migration changes. The cleanup field never reaches storage. The complete write
acknowledgement is verified, and uncertain responses never trigger automatic replay.

## Verification

- 71 focused tests across template service, mounted Forms UI, scoped media and
  native Forms HTTP adapters pass. Regressions were observed failing before the
  initial implementation, legacy preservation fix and stale-media fix.
- Chrome: removal sets dirty state and protects navigation; Undo restores clean
  state; save removes the row; reload retains revision 6 without the obsolete
  override. No browser errors. At 390px, document width and scroll width both 390.
- Local HTTP/store check confirms exact website template and remaining override
  preservation, unchanged customer audience, and a rejected unknown removal
  (400) with no revision change. No website forms/pages were removed.
- Two disposable fixtures were appended through the existing local template store
  during acceptance. The first exposed legacy normalization; the guarded second
  restored the original representation and proved the fix. Team revision is now 6;
  its template and overrides equal the original revision 2. Customer remains 14.
- Independent review's stale-media finding is fixed and re-reviewed successfully.
- Lint passes for all seven changed source/test/marketing files. Full typecheck
  exits 2 with the same 933 baseline diagnostics and no new normalized errors.
  An initial direct typecheck hit its default 4 GB heap limit; the normal project
  command with its configured 16 GB limit completed. Intermediate narrowing
  errors were fixed before the final run.

Private/local evidence: `customer-cms-demo/check-template-cleanup.mjs`,
`private/template-cleanup-before.json`, `private/template-cleanup-*.log` and
`fantasy-limo-template-cleanup.png`. Pre-test backup:
`private/backups/2026-10-01T23-10-57.207Z/`. Preserve this evidence and the demo data.

## Remaining work

Preview remains deployment `1d44f4ee`, source `a0e369591`. This local follow-up needs
the normal build/size/release checks before deployment. Hosted native sign-in and
cross-account acceptance still need the two user-provided mailboxes and supported
scoped setup. Stored revision history/restore, AI proposals, sender/reply routing,
outbox, published outcomes and webhooks remain separate checklist items.
