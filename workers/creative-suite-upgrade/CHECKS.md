# Weekly upstream release checks

The legacy PR728 checker is reconciled here independently of the specialised `workers/craft-editors` EDM integration. The latter is unchanged. The historical ownership/status is recorded in [the workspace ledger](../../docs/plans/2026-10-28-creative-workspace-mcp.md#keeping-upstream-current).

`check-updates.py` compares all six fixed StoryTold repositories with `upstream-releases.json`, whose schema explicitly describes unapproved candidate inputs. An up-to-date candidate is not a deployed or browser-accepted editor. The report also compares a separate source-configured standalone route baseline parsed without execution from `workers/creative-launcher-card-release/source/worker.js`; its exact source SHA-256 and routes are retained. That map is the input preserved by the current gateway generators. It is not authenticated runtime acceptance, and it excludes the separate FigFlow EDM version routes. Neither baseline is silently rewritten by a check.

```sh
python3 -m unittest discover -s workers/creative-suite-upgrade -p test_check_updates.py -v
python3 workers/creative-suite-upgrade/check-updates.py --report /tmp/creative-updates.json
```

The checker selects the highest stable numeric semantic version within the first 100 release records, ignores drafts/prereleases, resolves annotated tags within five hops, and checks exact browser ZIP metadata. It bounds metadata responses to 4 MiB and validates asset URL, size and any published digest. Missing/ambiguous assets are reported; at the candidate's own version they count as changed release metadata. A changed candidate commit, size or available digest also fails the check. Version comparisons against configured routes do not verify their older artifacts. Missing provider digests are explicit, not checksum verification. An available newer release alone does not fail the job. Metadata/schema errors produce redacted failure reports and a nonzero exit; one upstream failure does not suppress checks of the other engines.

Optional `GH_TOKEN`/`GITHUB_TOKEN` credentials go only to the HTTPS GitHub API origin; cross-origin and nonstandard-port redirects are refused. There is no candidate-download, promotion, build, deploy, messaging or production-write operation. Optional candidate preparation from PR728 is deliberately not included.

`.github/workflows/creative-tools-updates.yml` schedules Monday 06:17 UTC and supports manual dispatch. It uses only `contents: read`, validates the checker, writes a job summary, and retains a JSON artifact for 30 days. No production credentials are supplied. The schedule is **not active evidence** until default-branch integration and a successful workflow run are verified. GitHub scheduling is not an exact-time delivery guarantee.

Checks cover numeric version selection, draft/prerelease exclusion, schema failures, changed immutable metadata, missing/ambiguous assets, annotated-tag limits, safe credentials/redirects, failure redaction and source-route/candidate separation. They are deterministic and do not download upstream software. Browser, build and hosted acceptance remain separate gates.
