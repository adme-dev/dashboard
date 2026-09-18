# Imported-site CMS attachment contract

18 September 2026 — CMS-ATTACH-1, contract implementation only.

The [attachment design and six implementation children](https://github.com/adme-dev/dashboard/pull/572)
separate CMS setup from page generation. This section implements the wire request,
scope validation, immutable identity and exact retry comparison in Dashboard and
Studio. It creates no resources, edits no page checkpoints and exposes no API or
customer feature. CMS-ATTACH-2 through -6 remain open.

## Version 1 request

| Field | Meaning |
| --- | --- |
| `version: 1` | Explicit protocol version; unknown versions fail. |
| `mode: "attach-existing-content"` | Cannot be confused with the normal setup job. |
| `operationId` | Server-issued operation key, retained for retries. |
| `scope` | Native-authorized tenant/client/business/site/environment; all five axes are required. |
| `actor` | Initiating agency/client user UUID and required originating login SHA-256 hash. |
| `anchor` | Existing immutable checkpoint ID and manifest digest, resolved by the server. |
| `schemaDigest`, `runtimeDigest` | SHA-256 digests selected from reviewed trusted artifacts. |
| `policyVersion` | Server-selected capability policy identity. |

Objects are strict, fields are bounded, digests are lowercase hexadecimal, and
nothing is trimmed, defaulted or inferred. No template/plan/setup fields or page
replacement instructions are accepted. Collections begin empty in the later
executor implementation; this request does not accept imported records or code.

Dashboard owns authentication, membership, role/action and entitlement checks.
`parseContentAttachmentRequest(input, expectedScope)` compares against a trusted
scope obtained from those checks. Supplying a scope does not authenticate it.
The anchor must be verified against scoped immutable checkpoint metadata/bytes
in CMS-ATTACH-2/-3. These pure functions do not establish those facts.

## Identity and retry compatibility

`contentAttachmentIdentity(input)` returns `cms_attach_` followed by SHA-256 of
the UTF-8 encoding of this exact compact JSON tuple:

```text
[version, mode, operationId,
 [tenantId, clientId, businessId, siteId, environment],
 [actor.kind, actor.userId, actor.loginSessionHash],
 [anchor.checkpointId, anchor.digest],
 schemaDigest, runtimeDigest, policyVersion]
```

No undefined values occur. Object property ordering does not affect the tuple.
The identity is not a bearer credential or authority grant. Changing any field
changes the identity. `requireMatchingContentAttachmentRequest(retained, expected)`
compares the complete validated tuple and rejects a different request, including
a newer login, checkpoint or policy. A durable coordinator must additionally
reserve by full scope and operation key so a changed digest cannot allocate a
second set of resources. That atomic reservation is CMS-ATTACH-3 work.

Existing provisioning jobs, generation metadata, seed identities, states and
parsers are unchanged. Existing setup consumers reject attachment requests.
Future consumers must dispatch an explicit mode and keep legacy identities
byte-compatible; do not widen the old setup path to clear an editor head.

## Cross-repository maintenance

The module is byte-identical at Studio
`packages/protocol/src/content-attachment.ts` and Dashboard
`shared/pageStudio/content-attachment.ts`. Both run the same 61-case contract
suite and golden JSON fixture (including independently generated identity bytes
and SHA-256). Imports differ for the existing setup schemas. Mirror contract and
fixture changes together until a versioned shared package is distributed.

The protocol package exports the new contract. Dashboard's native boundary will
import its mirror in CMS-ATTACH-2. Avoid an import solely to make this unused
contract appear wired into the old setup flow.

## Verification and remaining integration

Focused coverage: valid round trip, property order, every immutable field,
foreign scope on all five axes, required login, malformed identifiers/digests,
terminal newlines, unknown keys, mixed modes and historical setup compatibility.
The initial test-first run failed because the new module did not exist; this was
new-feature scaffolding, not reproduction of an existing application defect.

Native authority, PostgreSQL/D1 revocation coordination, provider execution,
activation receipts, UI and live staging/Fantasy attachment remain required.
The separate session-authority branches contain staging repairs not yet on main;
this additive contract was based on current main and does not replace those
repairs or authorize their release. No production or staging deployment occurs
in this section. There is no customer-facing capability to advertise yet.

## Section results

- [x] CMS-ATTACH-1 source implementation and review: 61 contract tests pass in
  each repository; module and fixture hashes match exactly.
- [x] Dashboard full Vitest suite: 13,982 passed, 284 skipped; no new skips.
  The new module also passes standalone strict TypeScript checking. Full Nuxt
  build/typecheck were not repeated for this unconnected shared contract.
- [x] Studio: 3,150 tests pass including security tests; build, typecheck and lint
  pass. Some unchanged Turbo tasks were served from cache. Typecheck was rerun
  alone after simultaneous test/typecheck build tasks collided on generated
  declaration output; that sequential run passed.
- [x] Independent review: no Critical or Important finding. Existing setup
  source and runtime consumers are unchanged.
- [ ] Merge paired PRs, implement CMS-ATTACH-2 through -6, and prove live attachment.

These counts apply to fresh main-based contract branches, not the separate
staging authority branches. R08/R12 and all 26 top-level delivery tasks remain
open. No new user-visible feature or live storage connection is claimed.
