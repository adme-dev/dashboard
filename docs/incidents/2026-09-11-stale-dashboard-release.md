# Stale Dashboard release omitted current application features

## Impact and cause

The user reported missing QR Codes and other established application features on
11 September 2026. Production deployment `4a4748fa-7e9e-4400-a122-9f996ac35c57`
used `733efc6880b414374a6d61c0b61f8279f4fff166` from the divergent
`release/send-scan-foundation` lineage. That source omitted QR pages and Tools
navigation present in current `origin/main`, along with Operations and other
application features. The agent incorrectly treated this lineage as the release
base. Focused Page Studio tests did not detect the missing established features.

Cloudflare metadata labelled the deployment `main`, identifying its production
environment, not its Git ancestry. Freshly fetched `origin/main` was
`b442ae430b846da7cc66249f9d22242d478d6816`. Main and the remote release branch
diverged by 1,159 and 151 commits respectively at investigation time. The 18
successful production artifacts after the current-main artifact all lacked the
QR index source file and did not contain that main commit.

## Restoration and evidence

At `2026-09-11T02:21:31.277Z`, Cloudflare canonical deployment readback confirmed
restoration of existing successful production artifact
`54b15c18-73bb-4897-b201-1956ea89fd5d` on `agency-dashboard`. Its exact source is
`b442ae430b846da7cc66249f9d22242d478d6816`, with `commit_dirty: false`.

Before restoration, the agent freshly checked remote main, verified the exact
current and target deployment IDs through the Cloudflare API, inspected the
published route bundle and QR page chunk, and passed `pnpm deploy:check` from a
new worktree based on current main. Restoration used Cloudflare's existing
artifact rollback endpoint; it did not upload a new build or change the database.

After restoration:

- The canonical deployment ID matches the selected artifact.
- `https://app.xeroflow.io/` serves entry `/_nuxt/CZ1FmCEL.js`. Its SHA-256,
  `e6108a9147bd0990f140239a30251ac25cdd4eb11b1132018e8986b80acfdbe7`, matches
  the verified artifact's entry bytes.
- An authenticated browser loads `/agency/qr-codes` with title and heading
  `QR Codes`, existing codes and scan counts, and Campaigns/Competitions links.
- Browser DOM inspection confirms a sidebar `QR Codes` link to
  `/agency/qr-codes`. No QR creation, scanning, booking or customer messaging
  was performed for this verification.

This verifies restoration and the QR workflow's read path, not every application
feature. The separate Page Studio staging Sandbox Worker remains at its verified
version `0b61859d-9240-4bf8-a9d0-112afa0748fe`; this Pages restoration did not
change that Worker.

## Permanent prevention

The user's rule is recorded in root `AGENTS.md`: work from current main, verify
remote ancestry before merge/release, never blindly merge old branches, and
retire integrated branches after accounting for unfinished work.

`scripts/pages-source-guard.mjs` fetches main, obtains complete history for shallow
checkouts and proves the candidate contains the fetched main commit. Both
ordinary and frozen Pages release paths enforce it, including check-only mode.
Ordinary releases recheck ancestry, unchanged source commit and a clean worktree
after building and before upload. Frozen releases recheck immediately before
their external execution. Ordinary uploads explicitly record the verified source
commit. Remote verification failure blocks deployment without logging credentials.

Regression tests cover current feature work, a divergent branch misleadingly
named main, stale local tracking refs, main advancing during a build, source
changes during a build, unavailable remotes, shallow CI history, and rejection
before either release path executes. This guard does not replace review of the
actual feature diff or smoke testing established functionality.

## Reconciliation ledger

- [x] Restore current-main artifact and verify QR Codes in the signed-in browser.
- [x] Record branch policy in project instructions and local Graph Wiki.
- [ ] Merge and adopt the source guard on current main after required checks.
- [ ] Reconcile recent Page Studio setup/fact-review and editor handoff changes
  onto current main. Preserve source `60efe83d6` from
  `fix/page-studio-setup-fact-review` as reference; do not merge its old base.
- [ ] Reconcile business-admin work from `feature/page-studio-business-admin`
  (`b1be71745`) against current main, preserving current app functionality.
- [ ] Review the recent Google review sync and measurement changes from the old
  production lineage for still-needed corrections before reapplying them.
- [ ] Smoke test the reconciled Website Builder, QR Codes and representative
  existing navigation before the next new production build.
- [ ] Retire owned integrated branches/worktrees only after their remaining
  changes have been reconciled or explicitly recorded. Preserve active user work.

The restoration temporarily removes recent improvements exclusive to the stale
lineage. Client data and saved brief records have not been rolled back. Fantasy
Limo remains a draft requiring its previously recorded client facts; this incident
does not establish completion of that client delivery or the wider platform goal.
