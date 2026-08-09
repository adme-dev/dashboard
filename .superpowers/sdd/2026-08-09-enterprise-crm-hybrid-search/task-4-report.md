# Task 4 Report — Harden POST-Only CRM Keyword Search

## Result

- Base and pre-task HEAD: `1745baee7bbad20b5429eb184451dd145b8e94a8`.
- Intended commit: `feat(crm): harden POST keyword search`.
- Scope: Task 4 only; no network, AI provider, database, migration, deployment, or production action was run.
- Final behavioral gates: 10 focused files/115 tests and 32 Task 1–3/security files/283 tests passed.

## Implemented Boundaries

### Canonical request and privacy admission

- Added strict Zod JSON parsing for `{ clientId?, query, limit? }`; unknown fields and coerced caller values are rejected.
- Normalization is versioned and applies NFKC, whitespace-control separation, Unicode control/format removal (including bidi controls), Unicode whitespace collapse, and trimming before validation.
- Blank input and normalized input above 256 Unicode code points are rejected. Limits default to 20 and clamp to 1–50.
- The versioned privacy classifier keeps normalized full-width/mixed-script emails, phones, UUID-like values, and high-entropy identifiers out of semantic retrieval while leaving them available to authorized keyword search.
- No exact BGE tokenizer assets or direct tokenizer dependency exist locally. The explicit `CrmSearchTokenAdmission` seam therefore defaults to the honestly named, fail-closed `bge-base-en-v1.5-conservative-utf8-v1` admission: UTF-8 bytes plus two special tokens must be at most 512. It can conservatively reject safe non-ASCII text and does not claim to be the provider tokenizer.

### Server-owned authorization and deterministic keyword retrieval

- Agency POST search requires a strict body client selector, then resolves a fresh canonical agency context.
- Portal POST search explicitly requires `view`, rejects caller-supplied client scope, and derives a fresh canonical portal context from the authenticated session.
- Keyword SQL consumes only `CrmSearchContext`, applies the authoritative client/deletion boundary and entity-specific owner visibility predicate to people, companies, opportunities, activities, and tasks, and remains parameterized.
- Retrieval always builds a stable pool of at most 50 and has the total order `rank DESC, title ASC, type ASC, id ASC`; routes slice only after that pool.
- Exactly `POST /api/client-portal/crm/search` is classified as `view`. Trailing-slash, child, and prefix-near-match POST paths remain `edit`; DELETE remains `admin`. The existing middleware consumes this classifier directly, so no separate middleware source edit was necessary.

### Caller, AI tool, and retired transport cleanup

- The existing Nuxt UI v4 command palette now sends explicit JSON POST bodies, never query text in a URL. Agency sends `clientId`; portal omits it. Request sequencing prevents stale responses from overwriting current results, and loading, generic error, and empty states are announced accessibly.
- The AI CRM tool no longer uses internal HTTP or the global client resolver. It resolves `resolveAgencyAiCrmContext`, executes the direct authorized keyword pool, omits raw query text from results, and returns non-disclosing failures for unresolved, ambiguous, stale, or unauthorized scope.
- Removed CRM search from the God-mode internal read allowlist and AI internal-fetch inventory.
- Deleted both GET routes and the unsafe agency semantic GET route with no redirect, alias, or compatibility handler.
- Added repository-source caller and route-absence checks covering agency and portal CRM search literals.
- Intentionally updated the Task 1 canonical inventory for the two POST route replacements and the new request-normalization service; no surface was excluded.

## Behavioral TDD Evidence

The exact required suite was first run before production edits and observed RED with 24 failures across 109 assertions. Failures covered the missing request contract, normalization/privacy cases, context-owned search scope, deterministic ordering, exact portal POST classification, POST routes, URL-query UI behavior, the AI internal GET hop, retained God-mode inventory, and the three legacy GET route files.

The component test initially encountered the local Node 20/Vite `crypto.hash` incompatibility before component collection. Re-running with the repository's Node 24 runtime exposed the intended caller behavior RED; all later gates used Node 24.

No production implementation preceded those behavioral failures. The final focused run passed all 115 tests.

## Verification

### Exact Task 4 gate

```text
PASS: 10 files, 115 tests
```

This is the exact focused command from the brief and covers request normalization/privacy/token admission, keyword SQL, component transport/states, POST endpoints, portal boundary/RBAC, AI direct retrieval, God-mode removal, internal-fetch inventory, caller scanning, and route absence.

### Task 1–3 and security regression gate

```text
PASS: 32 files, 283 tests
```

This gate covers owner-scope batch/child/aggregate/indirect surfaces, CRM bulk/dedupe/meeting/quote/targets/actions, canonical record access and inventory, search contexts, portal access/RBAC/client auth, email/trusted-system behavior, custom records, activation/assignment/stage automation, reminders, and the CRM cron worker.

### Static checks

- `git diff --check`: clean.
- ESLint over every new or rewritten Task 4 source/test path: clean.
- Full Node 24 `pnpm run typecheck`: remains broadly red in unrelated baseline files (Nuxt UI event-handler return types, legacy strict-undefined errors, and other existing project diagnostics).
- Filtering the full typecheck output to Task 4 paths after repairing the command-palette click handler: zero diagnostics.

## Deep Review

- Re-read every modified/new file end-to-end and reviewed each deleted route from the diff.
- Confirmed all server imports use `~~/server`, SQL inputs are positional parameters, client scope is taken only from fresh canonical contexts, and owner filters precede names/ranks/results.
- Confirmed privacy decisions use the same normalized form presented to future semantic retrieval and do not disable Postgres keyword retrieval.
- Confirmed no URL query transport, internal CRM search fetch, God-mode allowlist entry, GET route, semantic alias, hidden selector echo, or raw storage error remains.
- Confirmed the UI retains the existing command/search control, Nuxt UI components, semantic colors, keyboard behavior, and current layout without redesign or AI styling.
- No marketing-page change was required because this is security hardening of an existing search control rather than a newly exposed product feature.

## Additional Necessary File

- `server/utils/crm/recordAccessInventory.ts` was intentionally changed beyond the brief's explicit staging list so the canonical Task 1 inventory tracks the two route replacements and new service instead of silently drifting.

## Remaining Concern

- Before any future provider call, Task 7 must repeat exact-tokenizer admission when schema tokenizer assets become available, or retain the current conservative fail-closed admission. This seam is already versioned so that replacement will not require contract drift.
