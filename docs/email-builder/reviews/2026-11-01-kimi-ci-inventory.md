# FigFlow CI inventory review — 2026-11-01

## Scope and revisions

- Worktree: `/Users/paulgiurin/orca/workspaces/dashboard/figflow-edm-release-20261101`
- Reviewed HEAD: `a202cbd89baa1150e685741265ba5ae838862095`
- Compared against: `origin/main` `a0535275dbff02c99e53965dce5f3096fa91d1d9`
- Runtime: Node `v24.18.0`, pnpm `10.17.1`, Vitest `4.1.10`
- Changed only `test/config/godModeGateInventory.test.ts`, `test/config/godModeIsolationInventory.test.ts`, and this report. No runtime, database, commit, push, or deployment action was performed.

## RED reproduction

Command:

```bash
PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH" pnpm exec vitest run \
  test/config/godModeGateInventory.test.ts \
  test/config/godModeIsolationInventory.test.ts --maxWorkers=1
```

Before the changes, both target assertions failed:

- Gate rows: expected `1715`, received `1718`.
- API inventory: expected `{ totalRouteFiles: 2310, mutationRouteFiles: 1259, explicitlyGuardedMutationFiles: 408, guardedMutationFilesWithTransactionCall: 55 }`; received `{ totalRouteFiles: 2315, mutationRouteFiles: 1262, explicitlyGuardedMutationFiles: 406, guardedMutationFilesWithTransactionCall: 55 }`.
- Result: 2 failed test files, 2 failed tests, 18 passed tests.

## Exact route inventory audit

| Metric | `origin/main` | Reviewed HEAD | Delta |
|---|---:|---:|---:|
| Route files | 2310 | 2315 | +5 |
| Mutation route files | 1259 | 1262 | +3 |
| Inline explicitly guarded mutation files | 408 | 406 | -2 |
| Guarded mutation files with a direct transaction call | 55 | 55 | 0 |

The five added route files are:

1. `server/api/email/design/[...path].ts`
2. `server/api/email/design/drafts/[id].get.ts`
3. `server/api/email/design/drafts/[id].patch.ts`
4. `server/api/email/design/drafts/[id]/metadata.patch.ts`
5. `server/api/email/design/drafts/initialize.post.ts`

The three mutations are the draft PATCH, metadata PATCH, and initialize POST. Their route bodies call `assertDesignMutationRequest`, validate the session, and delegate fresh client authority to `assertFreshDesignAccess`; none registers a God mode bypass or adds a direct route transaction.

The two inline-guard removals are relocations, not authorization removals:

- `server/api/email/templates/[id].patch.ts` now re-exports `designTransport`. Its canonical `server/utils/email-marketing/templateUpdateHandler.ts:19` retains `requireWriteAccess`; lines 28–30 retain existing-client and requested-client scope checks.
- `server/api/email/templates/[id].delete.ts` now re-exports `designTransport`. Its canonical `server/utils/email-marketing/templateDeleteHandler.ts:7` retains `requireWriteAccess`; line 12 retains `assertEmailClientAccess` for the stored client.

The route-isolation test now pins all five paths, all three mutation paths, both canonical handler relocations, fresh read/write authority, and absence of God mode registrations. Existing mutation-family, reviewed-read, native-scope, and fail-closed assertions were not relaxed.

## Exact gate row audit

A multiset diff used the test's existing roots, exclusions, lexical pattern, normalization, and classifier. It compared every `server`, `app`, and `shared` TypeScript/Vue source row at `origin/main` with the reviewed worktree. The complete delta is five additions and two removals, net +3.

Added rows:

```text
server/utils/email-marketing/designAccess.ts	SELECT tm.user_role::text AS role, tm.custom_role_id,	identity_tenant_hard_boundary
server/utils/email-marketing/designAccess.ts	OR (tm.custom_role_id IS NULL AND cr.is_system=TRUE AND cr.slug=tm.user_role::text)	identity_tenant_hard_boundary
server/utils/email-marketing/designAccess.ts	|| (access === 'write' && (isReadOnlyRole(row.role) || row.is_read_only))	application_governance_bypass
server/utils/email-marketing/templateDeleteHandler.ts	const user = await requireWriteAccess(event)	application_governance_bypass
server/utils/email-marketing/templateUpdateHandler.ts	const user = await requireWriteAccess(event)	application_governance_bypass
```

Removed rows:

```text
server/api/email/templates/[id].delete.ts	const user = await requireWriteAccess(event)	application_governance_bypass
server/api/email/templates/[id].patch.ts	const user = await requireWriteAccess(event)	application_governance_bypass
```

The three genuinely new gate rows are in `designAccess.ts`: two fresh staff-role identity predicates and one read-only write denial. The two handler rows exactly replace the two relocated route rows. Therefore identity increases by two and application governance increases by one; every other class is unchanged.

| Gate metric | Old frozen value | Reviewed value | Delta |
|---|---:|---:|---:|
| Total rows | 1715 | 1718 | +3 |
| Identity/tenant hard boundary | 133 | 135 | +2 |
| Provider/infrastructure availability | 222 | 222 | 0 |
| Application governance bypass classification | 1627 | 1628 | +1 |
| Ordinary user behavior | 301 | 301 | 0 |
| Unrelated configuration | 431 | 431 | 0 |

Inventory SHA-256 digest:

- Old: `cace1e9a913cb7e9c97c58d4eb86516c8b93f99206ed6add1b0c2fe81f971eaa`
- New: `71bd85521112871f03cca79e6028264c68e674a7f4b84583505fe241ae25543c`

The new source assertions also pin `validateSession(token)`, actor/session equality, active fresh staff lookup, client assignment/agency scope, read-only write denial, and absence of God mode bypass registration in `designAccess.ts`. All pre-existing hard-boundary assertions remain present.

## Changed assertion review

Only the failed frozen totals, their two affected gate-class counts, and the inventory digest were updated. The duplicate literal API inventory expectation was kept consistent with `API_INVENTORY`. New assertions explicitly enumerate the additions/removals and their authority evidence rather than accepting snapshots alone. No reviewed-read route, deferred mutation family, production mutation-registration expectation, native client-scope expectation, or other hard boundary was removed or weakened.

## GREEN verification

Focused tests, using Node `v24.18.0` and one worker:

```text
Test Files  2 passed (2)
Tests       21 passed (21)
Duration    891ms
```

- `godModeGateInventory.test.ts`: 8 passed.
- `godModeIsolationInventory.test.ts`: 13 passed, including the new FigFlow route/authority inventory test.

Lint:

```bash
PATH="$HOME/.nvm/versions/node/v24.18.0/bin:$PATH" pnpm exec eslint \
  test/config/godModeGateInventory.test.ts \
  test/config/godModeIsolationInventory.test.ts
```

Result: exit 0, no findings. `git diff --check` for both test files also passed. The existing Vite `configLoader: 'native'` warning about `__dirname` in `vitest.config.ts:23` remains informational and unrelated to these changes.

## SHA-256 evidence manifest

Owned test files:

| Path | Lines | SHA-256 |
|---|---:|---|
| `test/config/godModeGateInventory.test.ts` | 580 | `52f4f8e4ccef465328164c145dcba88127302e69446992f05a9906798faa44d9` |
| `test/config/godModeIsolationInventory.test.ts` | 412 | `4dda305efe3c78054ebf1807e9a62924e2f412839975de97f24f281228582bf4` |

Reviewed source evidence:

| Path | SHA-256 |
|---|---|
| `server/utils/email-marketing/designAccess.ts` | `335a633fdd449422bae5f3c256ec07f9f4accf6bc9ac506eaec4030a11f72b64` |
| `server/utils/email-marketing/templateUpdateHandler.ts` | `b04c4d3edc9fb1af8db3c88853750e49b96ec4a2ea8a3c1d2d6164533e26e5df` |
| `server/utils/email-marketing/templateDeleteHandler.ts` | `fc092c3b8bb302b0c9983188ae32f319b4f4b4b26d3a38f8d1a9f22e09626bb1` |
| `server/api/email/design/[...path].ts` | `a3323669dbc2fa8aca6e187bb1975ee1291d009e960378fc1e9e097fb875895e` |
| `server/api/email/design/drafts/[id].get.ts` | `e477c5459ec15e64748f07208f1e6388cce0eeda499cb1010098bc1bcd476e66` |
| `server/api/email/design/drafts/[id].patch.ts` | `5a2d91e6a57a8081b75bb22118758dab5d1febc4a1511c20c3ce8607d5c7cd94` |
| `server/api/email/design/drafts/[id]/metadata.patch.ts` | `934788384a69339e8b927afef24f63271250320df86f20a68a7637b76e6cc79d` |
| `server/api/email/design/drafts/initialize.post.ts` | `c9a018b3c5b8e644a2f5c80e46e9fbd713820483199880c7db02de9270d0ef11` |
| `server/api/email/templates/[id].patch.ts` | `a3323669dbc2fa8aca6e187bb1975ee1291d009e960378fc1e9e097fb875895e` |
| `server/api/email/templates/[id].delete.ts` | `a3323669dbc2fa8aca6e187bb1975ee1291d009e960378fc1e9e097fb875895e` |

The three identical transport-only files intentionally have the same hash. These hashes describe the reviewed worktree at the revisions above; they are not runtime or hosted acceptance evidence.
