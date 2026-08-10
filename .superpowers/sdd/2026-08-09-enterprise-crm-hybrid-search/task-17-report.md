# Task 17 Report — Truthful Public CRM Search Claims

## Result

Task 17 is complete. Public CRM search copy now describes the shipped control boundary consistently: visible agency and portal ranking is keyword-based, semantic retrieval is limited to approved agency-assistant contexts, the capability is off by default, portal semantic ranking is unavailable, only people, companies, and opportunities are eligible, and records become eligible only after confirmed indexing.

The feature catalogue, feature detail, navigation, AI/platform pages, resource pages, landing surfaces, privacy disclosure, and pricing draft no longer claim universal, continuous, automatic, instant, all-entity, or unqualified semantic search.

## Checked Claim Contract

- `CRM_SEARCH_MARKETING_COPY` is the shared source for the feature catalogue, detail page, and navigation label.
- `CRM_SEARCH_MARKETING_CLAIMS` pins the capability ceiling and maps each occurrence by source, route/component, rendered or SEO field, entity set, user surface, maximum mode, and rollout state.
- Fifty-six entries distinguish the controlled CRM path from existing Smart Watch, AI-context, knowledge, rate-card, and provider-disclosure surfaces.
- Fourteen exact negative assertions reject every broad present-tense claim found during the inventory.
- Source assertions fail on a new unmapped CRM/vector/search/indexing occurrence in any declared public claim surface.
- Rendered-contract assertions cover all 13 changed surfaces and their qualified copy. Light/dark treatment is required everywhere except the three explicit always-dark contracts: `MarketingNav`, `/landing`, and `/ai-training`.
- The offline smoke script independently loads the manifest and sources, checks manifest coverage, negative claims, the central capability boundary, and the exact theme contracts without a browser, network request, provider, or deployment.

## Strict TDD Evidence

The initial source/rendered run failed all 32 assertions because the manifest did not exist and the public site still contained automatic indexing, broad Vectorize, all-entity, continuously fresh, instant retrieval, and unqualified semantic-search claims.

Incremental implementation reduced that RED through the manifest, synchronized feature/nav copy, route-specific public copy, privacy language, SEO descriptions, and theme assertions. The smoke-script slice was separately captured RED on its missing checked artifact before implementation. A bounded existing compatibility assertion then failed because it required the exact obsolete unqualified homepage sentence; its RED was corrected to require keyword-visible and approved agency-assistant language and to reject the old sentence.

Final affected gate:

```text
Task 17 source/rendered + AI marketing compatibility: 38 passed (3 files)
Offline marketing smoke:                              13 surfaces, 56 claims, 14 negatives
Node 24 lint — manifest/smoke/tests:                   0 diagnostics
Targeted manifest TypeScript + smoke syntax:          passed
git diff --check:                                     clean
```

The earlier bounded compatibility run passed 17 of 18 assertions; the sole stale assertion was the compatibility RED described above. After that test-contract correction, the affected gate passed 38 of 38.

## Baseline Gate Evidence

The repository-wide Nuxt typecheck was run once under the required Node 24 runtime. It reached the known repository baseline and exited with approximately 2,151 unrelated diagnostic lines across existing application and server code. No Task 17-owned diagnostic was identified; the new manifest passes a targeted strict TypeScript compile and the source/rendered tests compile through Vitest.

Whole-file ESLint over the legacy marketing Vue pages reports the existing formatting baseline (525 errors, chiefly historical single-line element and trailing-comma rules). The new manifest, smoke script, both Task 17 tests, and the updated compatibility test pass targeted Node 24 ESLint with zero diagnostics. The initial lint attempt under the shell's Node 20 failed while loading ESLint because `Object.groupBy` is unavailable; rerunning with the project's Node 24 runtime produced the evidence above.

## Deep Review

All Task 17 diffs and every new manifest, test, and smoke-script line were reread. The audit checked frontend import aliases, route bindings, SEO descriptions, source-to-manifest needles, entity and rollout ceilings, explicit always-dark exceptions, stale broad-claim scans, duplicate UI sections, and whitespace. No form, input, server fetch, database, provider, queue, secret, or deployment path was introduced.

No Task 15 or Task 16 path was edited or staged. No browser, external network, provider, database, Cloudflare resource, or deployment operation was performed; live light/dark and viewport browser smoke remains an explicit Task 18 deployment-environment gate.
