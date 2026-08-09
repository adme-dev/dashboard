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

---

# Review Round 1 — POST Search Boundary Closure

## Result

- Review base: `54e496922defc8e0039897be5396c90f2e8b8b28`.
- Intended commit: `fix(crm): close POST search review gaps`.
- Scope: the four MEDIUM review findings only; no unrelated fix, network, AI provider, database, migration, deployment, or production action was run.

## Repairs

- Privacy classifier v2 now fails closed for long secret-like single tokens even when they use only uppercase or only lowercase letters. A 20-code-point boundary plus entropy/uniqueness and base-encoding character coverage catches uncertain identifiers; ordinary spaced names, the 19-code-point boundary, and low-entropy long words remain semantically eligible.
- Added the versioned `crm-search-client-selector-v1` normalizer. It applies the shared NFKC, control/bidi removal, and whitespace normalization before enforcing the 160-code-point selector bound. The AI resolver receives only that normalized selector; blank or post-expansion overflow returns the existing generic failed `ToolResult` without resolution or retrieval.
- The command palette synchronously invalidates request identity, results, loading, and errors on every raw term or client change. The debounced request captures the current client and cannot let an old-query, cleared-query, or old-client promise update current state. Client changes re-run the current debounced term with the new server selector.
- Replaced the literal-only caller check with a TypeScript-AST guard over `app`, `server`, `shared`, `scripts`, and `workers`, covering TS/TSX/JS/JSX/Vue/MJS/CJS/MTS/CTS. It resolves local literals, templates, concatenation, conditionals, and options objects; CRM search callers must use the exact endpoint, literal POST, an explicit body, and no query option or URL suffix. Test/spec/fixture directories are narrowly excluded from the production walk, while synthetic template, composition, implicit-GET, options-query, and dynamic-suffix fixtures exercise the guard directly.

## Behavioral TDD Evidence

- Consolidated pre-production RED: 4 files/45 tests, with 13 failures and 32 passes. Failures reproduced three high-entropy admissions, the absent selector normalizer contract, two AI selector leaks into resolution, three stale UI races, and three template/composed caller-guard misses.
- Classifier-version RED: 1 failure with 19 passes proved the changed privacy semantics still exposed the old v1 contract before the version was advanced to v2.
- Dynamic-template adversarial RED: 1 failure with 10 passes proved an unknown URL suffix could evade the initial AST guard before exact-endpoint enforcement.
- No production repair preceded its corresponding behavioral failure.

## Verification

- Exact Task 4 gate: 10 files/134 tests passed.
- Task 1–3/security regression gate: 32 files/283 tests passed.
- ESLint over all review source/test paths: clean.
- Full typecheck output filtered to every review path: zero diagnostics; unrelated repository baseline diagnostics remain outside this scope.
- `git diff --check`: clean.

## Deep Review

- Re-read all eight modified/new source and test files end-to-end, then reviewed the complete staged diff and appended report.
- Confirmed the privacy threshold is conservative only for uninterrupted 20+ code-point tokens and leaves keyword retrieval enabled on uncertainty.
- Confirmed selector normalization and bounds happen before any resolver call and invalid failures disclose neither selector nor storage/scope detail.
- Confirmed raw term/clear/client changes invalidate in-flight work synchronously, the new client ID is captured in the agency body, and portal bodies still omit client scope.
- Confirmed the caller guard scans every requested production root/extension, handles the reviewed composition forms, and accepts only the two explicit POST-body call sites without URL query text.
- The existing Nuxt UI v4 command palette, keyboard behavior, accessible loading/error/empty states, semantic styling, and layout remain unchanged.

---

# Review Round 2 — Fail-Closed Search Guards

## Result

- Review base: `f2054cd02079f90d1651ac4ce113c45dd7a7847f`.
- Intended commit: `fix(crm): make search guards fail closed`.
- Scope: the three MEDIUM review areas only; no unrelated fix, network, AI provider, database, migration, deployment, or production action was run.

## Repairs

- Privacy classifier v3 evaluates contiguous secret-like alphanumeric/base-encoded runs by length and Shannon entropy, with an explicit conservative hex rule. It keeps the repeated lowercase secret, uppercase/lowercase/base32/base64/hex-like tokens, and the 20-character boundary keyword-only. Ordinary spaced names, the 19-character boundary, a normal long word, and `enterprise-account-manager` remain semantically eligible because punctuation is not treated as a token category.
- Every command-palette request invocation now captures a fresh generation plus its raw term, debounced term, and client ID. Raw edits, clear, and client changes invalidate synchronously and reset UI state; settlement can update results, errors, or loading only when the captured generation and all three identities still match. Combined term/client and clear/client transitions therefore cannot resurrect stale results or stop a newer request's loading state.
- The caller guard now analyzes only inventoried transport calls through a scope-aware TypeScript AST evaluator. It resolves block-scoped identifiers, object/property endpoints, templates, concatenations, conditionals, known option spreads, and shorthand values; unresolved target-bearing endpoints/options fail closed. Exact endpoints require explicit POST, a definitely defined body, and no `query`, `params`, or `searchParams`; target-bearing proxy/query/suffix routes are rejected. Production directories named `test` remain scanned, while console/log strings are ignored because they are not transport calls.

## Behavioral TDD Evidence

- Consolidated pre-production RED: 3 files/54 tests, with 14 failures and 40 passes. Failures reproduced the repeated-secret admission, ordinary hyphenated-role false positive, stale classifier version, three combined-generation UI races, caller-guard proxy/params/spread/scope/shorthand/property misses, the safe-spread and console false positives, and skipped production directories named `test`.
- No production repair preceded its corresponding behavioral failure.

## Verification

- Exact Task 4 gate: 10 files/151 tests passed.
- Task 1–3/security regression gate: 32 files/283 tests passed.
- ESLint over all six changed source/test paths: clean.
- Full Node 24 typecheck output filtered to every changed source/test path: zero diagnostics; unrelated repository baseline diagnostics remain outside this scope.
- `git diff --check`: clean.

## Deep Review

- Re-read all six changed source/test files end-to-end, then reviewed the complete diff and this appended report.
- Confirmed v3 evaluates only contiguous secret-like runs, uses no punctuation-as-category shortcut, and leaves keyword retrieval enabled whenever semantic retrieval is denied.
- Confirmed each actual UI invocation owns a unique generation and settlement compares generation, raw term, debounced term, and client scope before mutating any visible state.
- Confirmed agency POST bodies still carry the captured client selector, portal POST bodies still omit it, query text never enters the URL, and accessible loading/error/empty behavior plus the existing Nuxt UI v4 design remain intact.
- Confirmed the repository guard scans `app`, `server`, `shared`, `scripts`, and `workers`, includes production paths named `test`, limits findings to real inventoried transport calls, and fails closed for unresolved target-bearing transport inputs.

---

# Review Round 3 — Encoded Search Guard Closure

## Result

- Review base: `1ac3e4733bf1fc94621717d69191740e15778e27`.
- Intended commit: `fix(crm): close encoded search guard gaps`.
- Scope: the two MEDIUM review findings only; no unrelated fix, network, AI provider, database, migration, deployment, or production action was run.

## Repairs

- Privacy classifier v4 adds punctuation-aware Base64URL admission for high-entropy candidates of at least 20 code points. It strips URL-safe separators for entropy evaluation, treats underscore/digit structure conservatively, and exempts vowel-bearing alphabetic hyphen segments that look like human words. The requested mixed, lowercase, and uppercase URL-safe examples, an exact 20-character boundary, and a one-character digit mutation remain keyword-only, while the 19-character boundary and `enterprise-account-manager` remain semantically eligible.
- The caller guard now resolves local transport aliases, statically proven object-property transport aliases, nested endpoint members, and object-destructured endpoint aliases through lexical scope. Unresolved wrapper expressions recursively retain evidence from known target aliases and fail closed. Generic member `.fetch` calls are ignored unless their receiver is a statically proven transport object or an approved global fetch receiver, preventing `logger.fetch(...)` false positives while keeping genuine aliases guarded.

## Behavioral TDD Evidence

- Consolidated pre-production RED: 2 files/58 tests, with 12 failures and 46 passes. Failures reproduced all requested Base64URL admissions, the 20/19 boundary and mutation behavior, the stale classifier version, direct/property transport alias misses, nested/destructured endpoint misses, an unresolved target-alias wrapper miss, and the unrelated `logger.fetch` false positive.
- No production repair preceded its corresponding behavioral failure.

## Verification

- Exact Task 4 gate: 10 files/164 tests passed.
- Task 1–3/security regression gate: 32 files/283 tests passed.
- ESLint over all four changed source/test paths: clean.
- Full Node 24 typecheck output filtered to every changed source/test path: zero diagnostics; unrelated repository baseline diagnostics remain outside this scope.
- `git diff --check`: clean.

## Deep Review

- Re-read all four changed source/test files end-to-end, reviewed the complete diff, and appended this report.
- Confirmed privacy v4 never decodes, persists, or logs query content; classification only controls semantic eligibility and authorized keyword search remains available.
- Confirmed URL-safe candidate length is checked before entropy, human-looking hyphenated word segments are exempted, and explicit boundary/mutation fixtures cover realistic threshold regressions.
- Confirmed transport identity and endpoint aliases resolve through the nearest lexical declaration, local shadowing prevents a false transport classification, and known target evidence survives unresolved wrapper calls so the guard fails closed.
- Confirmed generic member `.fetch` is accepted only for statically proven transport properties or the approved `globalThis`, `window`, and `self` receivers; unrelated logger methods and console strings remain ignored.

---

# Review Round 4 — Compact Token and Nested Caller Closure

## Result

- Review base: `d7b99f26a13208f01d802bcfb9b5a4a92bfa9d7a`.
- Intended commit: `fix(crm): harden compact token and caller analysis`.
- Scope: the two MEDIUM round-4 findings only; no unrelated fix, network, AI provider, database, migration, deployment, or production action was run.

## Repairs

- Privacy classifier v5 removes the blanket vowel-bearing hyphen exemption. Alphabetic hyphen-only candidates are now judged from the separator-free run's length, Shannon entropy, and unique-character ratio, while underscore/digit structure remains conservatively identifier-like. The three requested alphabetic Base64URL fixtures and the exact 20-character boundary stay keyword-only; the alphabetic 19-character boundary, `enterprise-account-manager`, and repeated human word segments remain semantic-eligible.
- The caller guard now recovers the complete property/index path for nested object or array `BindingElement` declarations from their owning variable or parameter initializer. Endpoint and transport resolution follows that path through scope-aware object/member chains. Unresolved known-transport endpoints recursively retain target evidence through nested call arguments, object properties/shorthands/spreads, and arrays, while one-level aliases, lexical shadowing, `logger.fetch`, and non-transport strings retain their existing behavior.

## Behavioral TDD Evidence

- RED command: `pnpm exec vitest run test/crm/searchRequest.test.ts test/server/api/crmSearchEndpoints.test.ts`.
- RED result: 2 files failed, with 8 expected failures and 59 passes. The failures reproduced all three alphabetic-hyphen admissions, the stale v4 classifier contract, nested endpoint and transport destructuring misses, and nested object/array target-evidence misses.
- No production repair preceded this RED run.
- GREEN command: `pnpm exec vitest run test/crm/searchRequest.test.ts test/server/api/crmSearchEndpoints.test.ts`.
- GREEN result: 2 files/67 tests passed.

## Verification

- Exact Task 4 gate under Node 24.18.0: 10 files/173 tests passed.
- Task 1–3/security regression gate under Node 24.18.0: 32 files/283 tests passed.
- ESLint over all four changed source/test files: clean.
- Full Node 24 typecheck retained 864 unrelated repository diagnostics; filtering the output to all four changed source/test paths returned zero diagnostics.
- `git diff --check`: clean.

## Deep Review

- Re-read all four changed source/test files end-to-end, reviewed the complete diff, and appended this report.
- Confirmed v5 classification controls semantic admission only, never decodes or records the candidate, and leaves authorized keyword retrieval available.
- Confirmed alphabetic compact-run scoring is guarded by the total 20-character candidate boundary and explicit 19-character/mutation/human-word controls.
- Confirmed nested binding resolution starts at the owning initializer, preserves lexical scope, supports object properties and array indexes, and fails closed only for known transports with reachable CRM-search target evidence.
- Confirmed existing one-level aliases, safe explicit POST bodies, logger methods, console strings, and production directories named `test` retain their prior behavior.

## Remaining Concern

- None within the reviewed Task 4 scope.

---

# Review Round 5 — Direct Search Transport Policy

## Result

- Review base: `194cce00fd85bc6496368325e6660ff683a8e805`.
- Intended commit: `fix(crm): enforce direct search transport policy`.
- Scope: the two MEDIUM round-5 findings only; no unrelated fix, network, AI provider, database, migration, deployment, or production action was run.

## Repairs

- Privacy classifier v6 treats the complete Base64URL candidate, including every `-` or `_`, as the 20-code-point admission boundary. It removes separators only for entropy and unique-character scoring. The requested two-separator mixed-case and uppercase 20-character candidates remain keyword-only, their 19-character counterparts remain semantic-eligible, and `enterprise-account-manager` plus all prior fixtures retain their decisions without a vowel exemption.
- The caller guard now applies an explicit fail-closed policy whenever CRM-search target evidence reaches a non-transport call. Function and IIFE wrappers, destructured parameters, wrappers receiving transport/endpoint/options, assignment aliases, `bind`/`call`/`apply`, and nested object/array carriers emit a violation rather than relying on arbitrary higher-order JavaScript dataflow. Statically resolved direct transports still undergo the existing exact-endpoint, explicit-POST, defined-body, and no-query checks; proven property/array/destructured endpoint aliases, safe spreads, lexical shadowing, production `test` directories, and console/logger controls remain sound.

## Behavioral TDD Evidence

- Classifier RED command: `pnpm exec vitest run test/crm/searchRequest.test.ts` under Node 24.18.0.
- Classifier RED result: 1 file failed, with 5 expected failures and 38 passes. Four exact 20-character two-separator candidates were incorrectly semantic-eligible and the v5 classifier contract had not advanced; all 19-character and human-role controls passed.
- Classifier GREEN result: 1 file/43 tests passed after the v6 implementation.
- Caller-guard RED command: `pnpm exec vitest run test/server/api/crmSearchEndpoints.test.ts` under Node 24.18.0.
- Caller-guard RED result: 1 file failed, with 10 expected failures and 35 passes. Every higher-order wrapper/alias/bind/call/apply/nested-carrier fixture returned no violation, while all controls and prior fixtures passed.
- Caller-guard GREEN result: 1 file/45 tests passed after the fail-closed direct-call policy.
- No production or guard implementation preceded its corresponding RED run.

## Verification

- Exact Task 4 gate under Node 24.18.0: 10 files/194 tests passed.
- Task 1–3/security regression gate under Node 24.18.0: 32 files/283 tests passed.
- ESLint over all four changed source/test files: clean.
- Full Node 24 typecheck retained 864 unrelated repository diagnostics; filtering the output to all four changed source/test paths returned zero diagnostics.
- `git diff --check`: clean.

## Deep Review

- Re-read all four changed source/test files end-to-end, reviewed the complete diff, and appended this report.
- Confirmed Base64URL length admission uses the total candidate while entropy and uniqueness use only the separator-free compact run; classification still controls semantic eligibility only and authorized keyword retrieval remains available.
- Confirmed the guard does not interpret arbitrary wrapper execution: reachable target evidence on a non-transport call fails closed, while direct recognized transport calls are statically normalized through the existing POST/body/query policy.
- Confirmed existing exact route matching, safe option spreads, nested endpoint/member/destructuring resolution, lexical scope, logger/console exclusions, and production source-root scanning remain intact.
- Confirmed no route transport handler, UI, server authorization, provider, database, migration, deployment, or marketing behavior changed.

## Remaining Concern

- None within the reviewed Task 4 scope.

---

# Review Round 6 — Complete Search Target Evidence Accounting

## Result

- Review base: `c1ede1653de7954b4c9f1119bd15d1673b5072bd`.
- Intended commit: `fix(crm): account for all search target evidence`.
- Scope: the two remaining caller-guard MEDIUM findings only; no privacy classifier, UI, route, API, provider, database, migration, deployment, or marketing behavior changed.

## Repairs

- The caller guard now maintains a source-wide evidence ledger for CRM-search literals, composed expressions, resolved declarations, assignments, and spread carriers. Evidence is marked consumed only when a recognized direct transport statically resolves to an exact CRM-search endpoint, explicit POST, a definitely defined body, known options, and no `query`, `params`, or `searchParams`. Unsafe uses are reported without being mislabeled as consumed; only explicit console/logger uses are exempted.
- Target evidence now survives array spreads into wrappers, direct transport spreads, destructured-rest carriers, post-declaration endpoint assignments, and chained assignments. Unresolved assigned evidence reaches the final fail-closed audit instead of disappearing when identifier resolution finds an initializer-free declaration.
- Numeric element access is resolved for the existing nested array endpoint-alias control, so its originating literal/declaration evidence is genuinely consumed by the safe direct call. Exact canonical route-inventory values remain non-endpoint metadata, while direct, composed, and escaped endpoint sources still enter AST analysis. The cheap pre-parse candidate filter keeps the repository scan within the existing five-second test timeout without excluding escaped literals.

## Behavioral TDD Evidence

- RED command: `pnpm exec vitest run test/server/api/crmSearchEndpoints.test.ts` before guard edits.
- RED result under the local Node 20 default: 1 file failed, with 6 failures and 46 passes. Five intended failures returned no violation for the array-spread wrapper, later assignment, chained assignment, direct transport spread, and destructured-rest spread. The sixth failure was the known Node 20 repository-walk timeout; the new safe direct/alias and console/logger controls already passed.
- GREEN command under the repository's Node 24.18.0 runtime: `node node_modules/vitest/vitest.mjs run test/server/api/crmSearchEndpoints.test.ts`.
- GREEN result: 1 file/52 tests passed in 2.41 seconds after evidence accounting and the bounded scan filter.
- No guard implementation preceded the five behavioral regression failures.

## Verification

- Exact Task 4 gate under Node 24.18.0: 10 files/201 tests passed.
- Canonical Task 1–3/security regression gate under Node 24.18.0: 32 files/283 tests passed.
- ESLint over `test/support/crmSearchCallerGuard.ts` and `test/server/api/crmSearchEndpoints.test.ts`: clean.
- `git diff --check`: clean.
- The full Nuxt typecheck was not treated as a completion gate: Nuxt's spawned checker twice retained the default 4 GB heap and OOMed, while the direct 16 GB full-project attempt remained resource-intensive amid the known unrelated diagnostic flood and was interrupted from the workflow. A dedicated temporary-project diagnostic filter for the two touched TypeScript files completed with zero matching diagnostics; the temporary config was removed.

## Deep Review

- Re-read both changed TypeScript files end-to-end (656 guard lines and 455 endpoint-test lines), reviewed the complete diff, and reviewed this appended report before staging.
- Confirmed every new target origin in the requested reproductions is either consumed by a statically approved direct call, reported through a specific unsafe-call path, exempted only through the explicit console/logger control, or caught by the final unconsumed-evidence violation.
- Confirmed safe literal, simple alias, nested object/array member, and nested destructured aliases preserve lexical resolution and produce no violation only after their originating evidence is consumed.
- Confirmed the repository walk still covers all required roots/extensions and production directories named `test`; no transport, authorization, privacy, UI, API, server, migration, dependency, or external-state behavior changed.

## Remaining Concern

- The repository-wide typecheck remains an unreliable local gate because of its heap demand and unrelated baseline diagnostics. The bounded touched-path filter, focused behavioral gate, and canonical security gate are clean.
