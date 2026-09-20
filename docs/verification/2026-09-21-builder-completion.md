# Generated CMS and workflow integration — final verification

Paired Studio source: `81e6202` (`feat/ai-feature-contract`). Dashboard extends
`346c62239` on `feat/page-studio-cms-authority`. Both branches included freshly
fetched main before this checkpoint; unrelated worktrees were preserved.

## Delivered locally

- Shared native CMS authority, versioned collection/record HTTP APIs, strict
  cross-repository wire validation and explicit retained upgrade setup.
- Generated schema authoring and seven-type entry forms inside the existing
  agency/client Business Content workspace, preserving existing page editing.
- Append-only record revisions, historical restore into a new draft, archive,
  optimistic conflicts, pending-save edits and recoverable multiple local drafts.
- Separate workflow upgrade audit/grant, private coordinator bridge and setup
  endpoints. Shared collection/workflow implementation retains strict per-kind
  schemas, grants, receipt pins, method names and original-login replay checks.
- Relevant Page Studio marketing descriptions reflect generated administration
  where configured. No arbitrary customer source execution is advertised.

See `2026-09-21-generated-collections-admin.md` and
`2026-09-21-workflow-upgrade.md` for contracts, rollout order and recovery limits.

## Review and checks

Independent review accepted native authority, setup, generated administration and
the final shared-core consolidation. Parent review/browser work fixed receipt
projection, inaccessible inactive drafts and duplicate IDs on optional fields.
The shared schema projection now explicitly excludes undefined indexed values
under the Dashboard's stricter TypeScript settings.

- Three real-browser scenarios passed using production Vue/Nuxt UI components:
  save/reopen, append-only history restore, collection isolation, conflicts,
  draft recovery, archive, mobile, keyboard, schema creation and compatible
  schema updates. Synthetic transport is explicit; this is not live customer UAT.
- **164 real PostgreSQL tests passed** after consolidation, covering original
  agency/portal login, roles, package and site policy, retries and revocation.
- **45 focused native/HTTP/isolation tests passed** after consolidation. Per-kind
  collection/workflow grants cannot substitute for one another.
- Golden protocol fixtures originate from the built Studio protocol.
- Changed application/server/shared/test files pass ESLint. The modified
  mechanical gate-inventory file retains four pre-existing explicit-any findings;
  its changes only update counts/digest for the new routes and shared setup check.
- Full typecheck exposed 914 diagnostics: one in the new collection mirror was
  corrected; 913 referenced unrelated files. Full repository typechecking is not
  a passing gate. The final full rerun reports **913 diagnostics and none in any
  changed/new file**. The isolated generated Vue/Nuxt UI typecheck passes.
- Studio: 3,815 tests, 23 build tasks, 37 typecheck tasks plus security types,
  988-file lint and 15 exact-artifact runtime checks pass. Its required commit
  formatter made no changes.

Final full Dashboard regression: **14,152 tests passed, 836 skipped** across
2,112 files (2,081 passed, 31 skipped), with two workers. Explicit grant-isolation
recheck: **4/4 passed**. Generated Vue/Nuxt UI typecheck and final changed-file
ESLint pass. Environment-dependent PostgreSQL suites were exercised separately.

**Release build remains blocked by the immutable size gate.** Nuxt compilation
and 169 prerendered routes succeed. Initial raw size was 25,500,358 bytes; reviewed
consolidation reduced it to **25,490,717 bytes**, still **21,789 bytes over** the
25,468,928-byte budget. Gzip is 6,634,468 / 9,750,000 bytes. The guard is unchanged.
An emitted ESM reachability audit found all **2,795 deployed files reachable**
from `index.js`, with no missing relative imports, nonliteral dynamic imports,
or orphan files to remove. Existing exact duplicate unrelated handlers total
only 8,307 bytes; removing them cannot resolve the overage and would break routes.
Releasing requires further server functionality extraction/consolidation, followed
by a fresh successful full build; the current artifact must not be deployed.

## Not activated / remaining

No production migration, deployment, customer schema change or scheduled email
sending was performed. Reviewed runtime policies and explicit environment setup
are release prerequisites, not consequences of source implementation.

Arbitrary custom Worker execution remains blocked: the fresh bounded hosted R06
probe failed all four CPU containment gates, including direct child CPU telemetry.
Its namespace, Workers and tail session were deleted and absence verified. See
Studio's `docs/research/2026-09-21-generated-action-containment.md`. Broader AI
proposal acceptance, reusable component execution/broker and generated browser
isolation are still incomplete; the four-part builder objective is not complete.

Existing dependencies/worktrees were reused. No package installation or repeated
GitHub push/Actions run was needed. Owned browser/database fixtures are cleaned
after testing; other contributors' worktrees and database clusters are preserved.
