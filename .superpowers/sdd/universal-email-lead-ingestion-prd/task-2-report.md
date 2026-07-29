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
