# Marketing feed repair MCP implementation plan

**Goal:** Marketing staff can complete the Knox Ford repair through their own MCP connection: diagnose catalogue type/import errors, create a Vehicles catalogue, attach the client's configured feed, create a New & Demo set, correct field values, refresh imports and read provider receipts.

**Architecture:** Extend the existing department catalogue and inventory-feed suites. Preserve fresh role/grant/client checks, read/write consent, independent review, exact revision acknowledgement, durable claims and provider readback. Existing trusted supplier feeds may be managed only when explicitly referenced by the client's stored default feed IDs and exact seller scope. No raw token, arbitrary fetch URL or owner impersonation is exposed.

**Tech stack:** Nuxt/Nitro TypeScript, existing Meta/feed providers, Postgres proposal receipts, Zod and Vitest.

## Tasks

- [x] Add shared ownership validation for explicitly bound supplier feeds; test unbound, cross-seller and manual-include rejection.
- [x] Extend catalogue suite with catalogue diagnosis/type evidence, reviewed Vehicles catalogue creation, reviewed product-set creation, exact upload refresh and upload status/error readback. Preserve independent approval and record IDs before subsequent steps; do not claim processing means approval.
- [x] Extend inventory-feed changes with typed field-mapping updates and bounded platform settings, preview the candidate and merge changes without discarding unrelated mappings. Allow existing source templates for feed setup without exposing credentials. Test the drivetrain correction, redaction, changed-source rejection and at-most-once execution.
- [x] Verify all new tool names are registered, projected for enrolled marketing staff with write consent, and routed through the department coordinator. Update public feature descriptions and operator guidance.
- [ ] Run focused and boundary tests, independent code review, deployment target/source checks, preview acceptance, then release the verified artifact and check live tool exposure. Test staff-owned OAuth only with a real authorised staff session; never impersonate an employee.

## Acceptance

The MCP tool catalogue and real executors cover each repair step; fixtures recreate commerce-versus-vehicles diagnosis and the source mapping correction. Revoked authority, self-review, stale revisions, foreign clients/catalogues/feeds and lost acknowledgements fail closed. Public tool outputs and durable proposals contain no supplier credentials. Live receipts separately state configuration, import processing, provider acceptance and campaign delivery.

Ruling: full marketing access means the complete client-scoped repair workflow, retaining the existing independent approval model. It does not grant owner identity or disable audit and entity isolation.

Ruling: deployment is in scope because the user asked that the exposed MCP can perform the repairs. Preserve all newer production features and do not release a stale branch.

## Verification so far

- Focused repair, provider, ownership, staff discovery/policy and deployment-guard checks: 114 passed. Four localhost-only PostgreSQL tests were first skipped, then run successfully against a dedicated disposable database on the existing local test server; this includes the stale successful-creation race.
- Independent review identified the successful-creation race; creation scope now remains reserved under its advisory lock even after completion. The reviewer rechecked the fix and reported no remaining blocking findings.
- New/changed server and test code lint clean after style corrections. Marketing navigation has 35 existing style violations away from the one changed text row; no broad formatting change is included.
- Current production before release: Pages `0a21b015-a984-4d97-845b-36a4ad660e6a`, source `40ad011`, matching the fresh base. No newer production source will be displaced.
- No database migration, provider write, credential change, campaign activation or budget change is part of this implementation verification.

- Final repair/discovery/boundary run: 169 tests passed across 21 suites, followed by five real PostgreSQL tests including definitive busy-refresh release. The added busy-refresh path was independently reviewed with no blocking findings; only exact HTTP 400/subcode 1798046 before an upload ID is terminally rejected. Unknown/partial outcomes remain held.
- Preview deployment `d5d7acf8-8303-4041-a50a-045ef39beb08`, source `4a78d3ab230c4621b1985d9592b5ae983f8a0d17`. Updated marketing repair page verified over HTTP. Raw bundle 25,348,499 / 25,468,928 bytes; gzip 7,311,239 / 9,750,000 bytes. The final busy-response follow-up is verified separately and will be included in the guarded production rebuild.
- Full typecheck reports 1,189 repository-wide errors, none in changed implementation files. Broader CI runs independently; main has no required status checks. Focused checks, independent review, source/target guard and production build are release gates for this bounded change.
- Signed-in browser surfaces are unavailable (CUA service startup failed; Kimi extension disconnected). Employee-owned OAuth acceptance remains pending and is not inferred from owner tools, HTTP 200 or source tests.
