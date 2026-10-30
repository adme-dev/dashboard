# Creative application upgrades

`check-updates.py` checks the six fixed StoryTold repositories against `releases.json`.
It selects the highest stable semantic version from a bounded release page, ignores
drafts/prereleases, resolves annotated release tags to exact commits and identifies
the exact browser ZIP. It reports whether GitHub provides a SHA-256 asset digest.
The default check downloads no application binaries and changes no release pins.

```sh
python3 workers/craft-editors/check-updates.py --report /private/tmp/creative-updates.json
```

`GH_TOKEN` or `GITHUB_TOKEN` is optional for GitHub API rate limits. Credentials are
sent only to `api.github.com` in a header and are never included in reports,
download URLs or logs. The weekly Monday 06:17 UTC workflow also supports manual
execution. GitHub schedules/manual workflow discovery require the workflow to be
integrated on the repository's default branch; the current rollout branch alone
does not activate the schedule. The workflow publishes a read-only job summary and
report artifact, with no issue/email messages, production credentials or deployment.

## Prepare a reviewable candidate

Start from freshly fetched `origin/main` in a short-lived branch, as required by
AGENTS.md. Preserve unrelated work and verify ancestry before promotion.

```sh
python3 workers/craft-editors/check-updates.py \
  --prepare /private/tmp/creative-upgrade-candidate-NEW \
  --report /private/tmp/creative-upgrade-check.json
```

The candidate directory must not exist. Preparation is optional and downloads only
newer stable releases with an unambiguous browser asset. It verifies a published
asset digest when present; otherwise it records a locally calculated SHA-256 from
the official HTTPS download. It checks ZIP size, resolves and hashes the exact
source archive, and reads only its bounded root `Cargo.lock` without extracting
or executing upstream code. Each download is capped at 300 MiB and the combined
candidate download budget at 512 MiB. It writes proposed `releases.json`,
`source-pins.json`, original archives and an explicitly unapproved `candidate.json`.
Live pin files remain untouched. A failed preparation may leave its new directory
for diagnosis; it is never deployed or reused automatically.

## Build, qualify and promote

1. Review the upstream change log, licenses, source diff and format/storage changes.
   A tag resolving differently or a changed digest needs investigation, not a
   silent replacement of a published release.
2. Replay every recorded branding and behavioral patch against the proposed source.
   Port/review conflicts and update patch hashes. A new source lockfile is a new
   explicit pin. Do not disable the original lockfile/patch guards to make it pass.
3. Build each changed editor from those reviewed pins and run meaningful regressions.
   `creative-tools-build.yml` supports all six browser editors. Source-input changes
   on PRs targeting main build all six (two at a time) and run the Fig save/export
   regressions. Its manual `engine` choice builds all or one selected editor; the
   Fig native tests run for all/fig selections. The original rollout branch retains
   its source-input push trigger. UI, auth, library, artwork and documentation-only
   edits do not trigger these Rust builds. Photo, Vector, Film and Fig font archives
   are pinned by exact commit and SHA-256; Sound/Effect need no extra font archive.
   Review the emitted source, lockfile, tool and ZIP receipts, not just job status.

   ```sh
   gh workflow run creative-tools-build.yml --ref YOUR_CURRENT_UPGRADE_BRANCH -f engine=all
   # Or build only the changed editor, for example:
   gh workflow run creative-tools-build.yml --ref YOUR_CURRENT_UPGRADE_BRANCH -f engine=photocraft
   ```

   Manual workflow discovery requires default-branch integration. A source-changing
   PR provides the automatic path once the workflow is integrated on current main.
4. Stage actual browser packages at new version scopes. Keep old version directories,
   hashes, compatible document/storage identifiers and service-worker scopes.
   A same-upstream-version repair needs a new suffix such as `-flow2`; do not replace
   immutable WASM at an existing URL. Open tabs must keep their existing binaries.
5. Check startup, import/save/export, the shared dock, authentication and installed-app
   scopes on the actual candidate. Installed Safari app login/storage requires its
   own acceptance. Never infer hosted or installed-app acceptance from compilation.
6. Review and promote the stable `/<app>/` routes only after acceptance. Retain the
   previous route map and package hashes for rollback. Old routes remain available
   behind the same registered-user gate. Never clear OPFS/IndexedDB to upgrade.
7. Record source commit, current-main commit, package hashes, Worker target/version
   and live verification. Launcher cards use stable `/<app>/` entry paths. Verify that each selected route
   resolves to the new accepted package while previously published version paths
   remain reachable behind the same account gate.

This checker provides release discovery and immutable candidate inputs. It does
not authorize automatic production upgrades, prove patch compatibility, migrate
user documents or grant access to additional accounts.
