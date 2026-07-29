# Task 2 Report — Transport-neutral MIME and provider parsing

## Outcome

Implemented the pure shared email parser boundary in `shared/leads/email/`.
It is transport-neutral and has no database, Nitro, Cloudflare event, network,
AI, or persistence imports. The parser applies deterministic ADF/XML,
provider-adapter, then generic extraction, and hashes the selected raw identity
before returning `EmailLeadExtraction`.

## RED → GREEN evidence

### RED

The initial focused test run was executed before implementation. It failed with
three import-resolution failures because `mime`, `parser`, and `providers`
modules did not exist:

```text
Cannot find module '../../shared/leads/email/mime'
Cannot find module '../../shared/leads/email/parser'
Cannot find module '../../shared/leads/email/providers'
```

### GREEN / stability

Executed with explicit Node `v24.18.0`:

```bash
/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node \
  node_modules/vitest/vitest.mjs run \
  test/workers/email-lead-mime.test.ts \
  test/workers/email-lead-parser.test.ts \
  test/workers/email-provider-conformance.test.ts
```

The final focused suite passed twice consecutively:

```text
Test Files  3 passed (3)
Tests       31 passed (31)
```

The targeted TypeScript compilation and `git diff --check` also completed with
exit status 0. Project `pnpm run typecheck` completed successfully under Node
24.18.0.

## Delivery details

- Bounded `postal-mime` parsing: 2 MiB raw message limit, 64 KiB header limit,
  depth 20, and 256 KiB XML/ADF attachment limit.
- HTML is converted using an inert string transformation; active markup and
  remote-resource URLs are not run or fetched.
- XML first receives a stateful lexical safety scan which rejects declarations,
  DTDs, and non-built-in entity references; it is then parsed by
  `fast-xml-parser` with entity processing disabled. XML is not trusted based
  on regex alone.
- ADF fields cover customer contact, comments, provider ID, request date, and
  vehicle year/make/model/stock number. ADF remains higher priority than all
  provider and generic parsing.
- Registry validates unique stable IDs/priorities, sorts deterministically, and
  ranks body evidence above subject, sender, and expected-provider hints.
  Expected-provider hints only break ties of equal evidence strength.
- Provider adapters: Carsales, AutoTrader, CarsGuide, Drive, Gumtree, Meta,
  Instagram, TikTok, Google, and Generic. Every adapter runs through the shared
  deterministic/non-mutating/conformance test.
- External identity selection is provider lead ID → Message-ID → canonical
  stable fingerprint, followed by a synchronous runtime-neutral SHA-256 hash.
  Raw identifiers are removed from the returned field map.

## Fixtures

All fixtures are synthetic and use `.example.test` addresses and synthetic
names/IDs. The fixture directory covers Carsales ADF in body and attachment,
AutoTrader, CarsGuide, Drive, Gumtree, Meta, Instagram, TikTok, Google,
generic labelled, direct-customer, HTML-only, forwarded/replied, phone-only,
malformed MIME, hostile HTML, entity-expansion XML, and relay-without-customer
contact scenarios.

## Dependencies

- `postal-mime@^2.7.4`: now a direct dependency because the shared module
  imports it rather than relying on Resend's transitive dependency.
- `fast-xml-parser@^5.10.1`: now a direct dependency for the XML parser with
  `processEntities: false`.

Both versions were already present in the lockfile transitively; the importer
entries were added without changing resolved package versions.

## Full suite baseline delta

Ran the complete Vitest suite once using Node 24.18.0. The result exactly
matched the documented baseline:

```text
Test Files  20 failed | 1224 passed | 3 skipped (1247)
Tests       39 failed | 6974 passed | 6 skipped (7019)
Errors      3 errors
```

No Task 2 tests failed, so the parser introduces a zero delta against the
known 39 failures / 3 errors.

## Remaining concerns

- Provider marker patterns are intentionally conservative and should be
  broadened only with newly sanitised representative emails from each provider.
- The parser is deliberately isolated from endpoint policy resolution,
  transport normalisation, signing, raw storage, and persistence; those belong
  to later tasks and were not started here.

## Correction round 1 — adversarial review remediation

### RED → GREEN

Added regression tests before changing production code. The first correction
run failed five targeted assertions, proving the reported defects: encoded
active HTML remained in output, numeric XML entities were rejected,
Message-ID spellings hashed differently, direct-customer sender email was not
available, and a provider sender suffix spoof classified as Carsales.

After remediation, the focused suite passed twice consecutively under Node
24.18.0:

```text
Test Files  3 passed (3)
Tests       40 passed (40)
```

`pnpm run typecheck` and `git diff --check` completed successfully. The final
full Vitest run retained the documented 39-failure / 3-error baseline (20
failed / 1,224 passed test files; 39 failed / 6,985 passed tests / 6 skipped).
The passing-test total increased only with the new Task 2 regressions; no Task
2 tests failed.

### Fixes

- Replaced regex HTML stripping with a Worker-compatible inert tokenizer. It
  decodes known entities before tokenization and suppresses active/resource
  element content, including encoded and unclosed script markup. No DOM or
  browser globals are used.
- Added `XMLValidator` well-formedness validation, namespace removal and
  local-name normalization for ADF. Namespaced/uppercase roots, repeated nodes,
  and numeric character references are supported; DTDs and custom entities
  remain rejected before parsing.
- Replaced provider sender substring matching with RFC addr-spec extraction and
  exact normalized-domain comparison. Display names and suffix domains no
  longer classify a provider.
- Added direct-customer detection only when parsed envelope and header mailbox
  addresses exactly agree, after provider matching has failed. It extracts
  sender email only in that mode, derives a prose name, preserves the customer
  message, and removes reply/signature tails.
- Canonicalized bracketed Message-ID syntax with a lower-cased domain before
  hashing. Stable fallback fingerprints now include all normalized vehicle
  fields.
- Wired all nineteen sanitised fixtures into parser/MIME tests and extended
  conformance coverage for post-extract immutability, no fetch calls, sender
  spoofing, and ADF protection from lower-priority overwrites.

### Attachment allocation bound

Postal-mime exposes attachment encoding plus header/nesting limits but no
per-attachment streaming abort hook. Its attachment content is consequently
decoded before the parser can apply the 256 KiB extraction cap. The strict 2
MiB raw pre-parse limit is therefore the raw-input ceiling; the parser then
explicitly rejects decoded XML/ADF attachments over 256 KiB. A focused test
documents and exercises that post-decode rejection. No ineffective guard was
added.

## Correction round 2 — parser hardening

### RED → GREEN

Added the regressions first. The RED run produced five failures: a nested active
HTML tree leaked text, unbracketed Message-ID syntax did not canonicalize,
header provenance was rejected by the shared contract, and direct-customer
classification promoted insufficiently verified mailbox addresses.

After remediation, this focused command passed under Node 24.18.0:

```bash
/Users/paulgiurin/.nvm/versions/node/v24.18.0/bin/node \
  node_modules/vitest/vitest.mjs run \
  test/workers/email-lead-mime.test.ts \
  test/workers/email-lead-parser.test.ts \
  test/workers/email-provider-conformance.test.ts \
  test/server/utils/leads/emailIngestion.test.ts
```

```text
Test Files  4 passed (4)
Tests       54 passed | 1 skipped (55)
```

`git diff --check` and `tsc --noEmit --pretty false -p tsconfig.json` also
completed successfully.

### Fixes

- Replaced single-tag HTML suppression with a nested active/resource stack.
  It stays fail-closed for mismatched or unclosed nested tags and covers
  encoded markup.
- Accepted exactly one valid Message-ID addr-spec in either bracketed or
  unbracketed form, retaining the normalized-domain identity hash and falling
  back to a fingerprint for malformed or multiple values.
- Added `header` field provenance to the shared schema and use it only when a
  direct customer email is promoted from the aligned mail headers.
- Tightened direct-customer promotion: exact header/envelope mailbox alignment
  now also requires a personal (not role/automation) mailbox/domain, human
  first-person prose, and no automation or multi-label-template signal.
  Captured names are constrained to one or two capitalized tokens and stop
  before conjunctions or intent prose.
- Made adapter conformance temporarily replace `global.fetch` with a rejecting
  mock and restore globals in `finally`, so any accidental network call fails
  deterministically.

### Correction round 2 full-suite delta

The controller reran the complete Vitest suite after the correction commit
because the implementation report did not yet contain repository-wide evidence:

```text
Test Files  20 failed | 1224 passed | 3 skipped (1247)
Tests       39 failed | 6987 passed | 6 skipped (7032)
Errors      3 errors
Duration    34.80s
```

The failure/error baseline remains exactly 39/3. The passing-count increase is
the new Task 2 regression coverage.

## Correction round 3 — literal markup and identity hardening

### RED → GREEN

The new regressions failed before implementation: an entity-decoded closing tag
could pop a literal active HTML stack and expose hostile text; invalid local
dot-atoms were used as Message-ID identities; and an aligned mailbox with the
instruction “Please contact the customer” was promoted as a customer email.

After remediation, the focused suite passed under Node 24.18.0:

```text
Test Files  4 passed (4)
Tests       55 passed | 1 skipped (56)
```

The full Vitest run retained the established baseline exactly:

```text
Test Files  20 failed | 1224 passed | 3 skipped (1247)
Tests       39 failed | 6988 passed | 6 skipped (7033)
Errors      3 errors
```

No Task 2 test failed, and the established 39-failure / 3-error baseline did
not change. `git diff --check` and `tsc --noEmit --pretty false -p tsconfig.json`
completed successfully.

### Fixes

- Literal HTML tags now exclusively control the outer active/resource stack.
  Text chunks are entity-decoded and inert-tokenized independently, so encoded
  tags are suppressed but cannot close or otherwise mutate literal nesting.
  Regressions cover template/script, nested same/different tags, fully encoded
  markup, literal-plus-encoded markup, and malformed input.
- Direct customer promotion now default-denies unless it has a bounded
  first-person name/identity plus a distinct first-person enquiry or explicit
  “contact/call/email me” intent. Automation, role, relay, and labelled-template
  exclusions still apply.
- Message-ID local parts must be valid dot-atoms. Leading, trailing, and
  consecutive dots, whitespace, and multiple IDs now fall back to the stable
  fingerprint; one valid bracketed or unbracketed addr-spec still canonicalizes
  its domain.
- The rejecting fetch mock now wraps every adapter `matches` and `extract`
  call, including the first extraction used for the immutability comparison,
  with restoration guaranteed by `finally`.

## Correction round 4 — encoded chunk continuity and direct-intent hardening

### RED → GREEN

The tests were added before the implementation change. The first focused run
failed the two new regressions: decoded active markup leaked across benign
literal tag boundaries, and aligned personal mailboxes were promoted for
non-enquiry `can`/`want`/`need`/`could` prose.

After remediation, the focused suite passed twice consecutively under explicit
Node 24.18.0:

```text
Test Files  3 passed (3)
Tests       45 passed (45)
```

### Fixes

- HTML sanitisation now maintains independent literal and decoded-markup
  suppression stacks. A literal tag cannot clear decoded active state, and
  decoded tags cannot close or mutate literal nesting. Regression coverage
  includes split encoded tags, multiple benign literal tags, nested encoded
  elements, unclosed input, and safe text after a valid decoded close.
- Direct-customer promotion now requires both a bounded first-person identity
  and a concrete enquiry/contact action. Generic status/report language no
  longer promotes aligned sender addresses; legitimate vehicle-inspection
  enquiries remain accepted.

### Verification

`tsc --noEmit --pretty false -p tsconfig.json` and `git diff --check`
completed successfully. The complete Vitest suite retained the established
failure/error baseline exactly:

```text
Test Files  20 failed | 1224 passed | 3 skipped (1247)
Tests       39 failed | 6990 passed | 6 skipped (7035)
Errors      3 errors
```

No Task 2 tests failed; the two additional passing tests are this correction
round's regressions.

## Correction round 5 — literal-suppression state isolation

### RED → GREEN

The regression was added before the implementation change. Its RED run exposed
that an entity-decoded closing tag inside literal-suppressed `<template>`
content could pop a pre-existing decoded `<script>` stack and leak the later
URL. The same flaw let an encoded opening tag inside a literal `<script>` hide
safe text after the literal close.

After remediation, the focused suite passed twice under explicit Node 24.18.0:

```text
Test Files  3 passed (3)
Tests       46 passed (46)
```

### Fix

- `htmlToText` now does not call the decoded-tokenizer while literal active
  content is being suppressed. The encoded stack is therefore left unchanged
  across literal-suppressed regions; encoded tags inside literal content cannot
  pop an existing outer stack or open a stack that hides later safe text.
  Regressions cover the exact split script/template sequence, nested literal
  suppression, and encoded open/close input within literal markup.

### Verification

`tsc --noEmit --pretty false -p tsconfig.json` and `git diff --check`
completed successfully. The complete Vitest suite retained the established
failure/error baseline exactly:

```text
Test Files  20 failed | 1224 passed | 3 skipped (1247)
Tests       39 failed | 6991 passed | 6 skipped (7036)
Errors      3 errors
```

No Task 2 test failed; the one additional passing test is this correction
round's regression coverage.
