# Pi customer acceptance renewal

The normal invited customer launched Studio using Chrome's native Launch Studio
button. Its unchanged, unrevoked session `e482df0a-a677-4b6f-90fa-1c5bb7e5b889`
expired at 2026-10-19T03:42:12Z. The retained editor's page GET, checkpoint POST
and Pi start-draft POST returned 401 `TOKEN_INVALID` after 03:57 UTC. This proves
browser access closes after natural expiry; it is not a replay test of an expired
signed token because the browser also expires its authentication cookie.

Studio release receipt PR138 passed Linux and Windows CI and merged as
`4dc6331d3274d1dbbb87490b2e8ca0332ebcced5`. Pi remains disabled.

## Scoped preview renewal

Cloudflare's preview is deployment `e07ed0a4-547c-4d23-9ce0-852ac14b2a41`, source
`ce6e92b05eb6917272729ba24c7e8af38feeb930`. That source includes current main
`6b82be128f29101324f4d3db7930ec30f45d1d7d` and 19 already-deployed customer-launch
commits. Preserve that exact application code rather than remove those features
when renewing the test window.

Change only preview `PAGE_STUDIO_CUSTOMER_SIGNUP_EXPIRES_AT` from
2026-10-15T10:30:00Z to **2026-10-20T04:00:00Z**. Retain the existing two approved
mailbox hashes, exact preview origin, sender and all other configuration. No
production signup, Pi admission, customer capability, paid build allowance,
publication, domain or database entitlement changes are included.

The existing native preview plans are separately expired. Renewing login does
not renew those plans or authorize editing, publication or paid AI. Test normal
sign-in, account visibility and cross-account denial before deciding which
supported entitlement workflow is needed. Never rewrite creation receipts or
session expiries to make acceptance pass.

## Verification and execution

- [x] Fresh current-main ancestry and prior preview source verified.
- [x] Signup and deployment-guard suites: 55 tests pass across four files.
- [x] Guarded `pnpm deploy:preview` and provider source/config readback.
- [x] Approved account A: normal email sign-in, own dashboard and launch-state read.
- [x] A's foreign launch-state read denied; full two-account matrix remains open.
- [ ] Approved account B login and reciprocal isolation checks.
- [x] Production Page Studio variables and deployment remain unchanged on readback.

The first test invocation required Nuxt's generated tsconfigs; `nuxt prepare`
resolved that setup prerequisite and the actual tests then passed. Application
code is unchanged from the live preview. Evidence is archived under
`Worktree Archives/2026-10-19/pi-acceptance-renewal/`.

## Hosted receipt — 19 October, 04:22 UTC

Preview deployment `e202f7f4-6373-4d21-8840-d98c4bd70cbb` serves clean source
`256e8c7b150714d0690cd45ff4dae893b7ce39d4`. The guarded source check includes
current main `6b82be128f29101324f4d3db7930ec30f45d1d7d`. Raw Worker size is
25,451,700 / 25,468,928 bytes; gzip is 7,154,399 / 9,750,000 bytes.

The first build passed, but its final Git fetch failed and prevented upload.
An ordinary fetch succeeded and the complete guarded deployment was rerun.
No source guard or size budget was bypassed. Provider readback confirms only
the preview signup expiry changed among Page Studio plaintext variables.
Production retains deployment `630ec0a3-4db8-4b4c-98a8-bcd635314be1` and all
of its Page Studio variables. The original baseline omitted Hyperdrive bindings;
it cannot establish their equality. The post-release receipt records the actual
staging and production binding IDs separately.

The first approved native account requested and received a normal sign-in email,
consumed its one-use link and confirmed through the ordinary verification UI.
Its account and dashboard return 200. Its own launch-state returns 200 and a
foreign site's launch-state returns 403. The dashboard retains the existing
site and reports `needs-attention`, `canPrepareCms=false`, `canOpenStudio=false`;
the expired trial has not been renewed. This is bounded login/read isolation,
not completed two-account editing, Forms or Pi acceptance.
Normal UI sign-out then returned the browser to signup, and the same own-site
launch-state read returned 401 with `private, no-store`.

The second approved mailbox is not available in the connected Gmail session:
the attempted mailbox selection resolves to another account's reauthentication
screen. The owner has been asked to open the correct desktop inbox. No second
sign-in email, substitute identity or database-issued credential was used.

## Separate customer-plan release prerequisite

PR664 already implements audited initial plan transitions and managed transfers.
Do not duplicate that workflow or rewrite immutable preview approvals. Its exact
head `3986dfc69200718a85b6b62aad8c0c27bc169722` failed CI38913506224 because raw
Worker size is 25,471,854 bytes, 2,926 over the unchanged safety budget.
This is a confirmed release blocker, not a missing implementation. The matching
private management Worker must be released before that Pages code. None of those
23 commits beyond the previously live preview are included in this renewal.

The build correction is PR666, initially verified at source
`2d5d543d1d0988aab59a12b1759d00b73b26d9f0`. It shares the existing lazy static
SQL decoder across route modules and preserves separate caches and exact query
text. All 62 focused tests pass, including actual workerd execution after module
minification/renaming. Linux CI39200310701 built successfully:
raw 25,448,362 / 25,468,928 bytes;
gzip 7,149,965 / 9,750,000 bytes. Its full suite found 20 failures across four
stale inventory/deployment fixtures in the broader customer-launch branch.
Source review confirmed the new native recovery POST, production Forms flag and
private production provisioner binding. Those expectations were reconciled in
`43d6d5f3e895371b363f4b361c3d2f24d69add0d`, retaining the exact inventory fingerprint
and adding missing/wrong-production-provisioner rejection tests. All 66 targeted
checks and changed-file ESLint pass. Removing the single added feature-flag row
reproduces the previous inventory fingerprint exactly.

Full Linux CI39202885136 passed on that final code, including the dedicated
PostgreSQL stages, Worker build, artifact checks and deployment guards. The
repository-wide test stages passed 16,608 tests (54 caller tests plus 16,554 in
the remaining suite), with 2,907 conditional tests skipped. Final raw Worker size
is 25,448,434 / 25,468,928 bytes; gzip is 7,150,025 / 9,750,000 bytes.
PR666 merged into the customer-launch feature branch as
`d42479a545236e578f697e7093291c5351e79928`. Deployment jobs were skipped. This is
not a production release or customer activation. Local disk pressure is avoided
by using the existing GitHub build workflow with deployment jobs excluded for this branch. After preserving
the completed preview deployment receipts, only its owned regenerable `dist/`
and `.nuxt/` outputs were removed; source, dependencies and evidence remain.

Fresh production Pi readback still reports version
`e70edf12-e793-47dd-926d-a7d419ca8c92`, deployment
`55bbb328-8f3b-42a2-b087-521e39eae5dd`, disabled admission and an empty site list.
