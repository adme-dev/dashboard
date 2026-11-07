# Personal assistant and native chat integration

Base/current origin/main: fa14776da587cf9bac3ffdc77aa3fffa0f442715. Isolated backup-drive worktree; preserve canonical pre-existing changes. User authorises fixing the architecture gaps and researching Cloudflare/GitHub/docs. Clarification pending whether service-account access was intended; no service-account grants are part of this fix by default.

## Required behaviour

Employees use their personal assistant preferences, permitted client scope, memory and reviewed marketing tools through native AI Chat. Explicit conversation focus overrides personal defaults; selecting inheritance clears the stored override. Text/voice/transport retries retain actor, conversation and message binding. My Assistant is discoverable from chat. Company Finance access remains a fresh explicit role grant and is not expanded.

MCP and native marketing tools reuse reviewed schemas/handlers and fresh per-actor grant/scope policy. Native calls have authenticated chat provenance and private authority branding, never fabricated OAuth scopes. Discovery and execution agree; revocation, read-only, persona, disabled-tool and governed-release ceilings remain enforced. Native writes require a persisted message identity and retained domain idempotency/review semantics. Test using fixtures and disposable PostgreSQL only; no live advertising/provider or accounting writes to prove success.

## Tasks

1. UI defaults/navigation and conversation persona readback; TDD.
2. Native marketing catalogue adapter and shared execution authority; TDD, negative/revocation/scope tests.
3. Shared MARKETING_MANAGEMENT all-active client scope and accurate runtime tool-enabled diagnostics; TDD.
4. Official Cloudflare docs/GitHub research; prepare real rollout readiness/preflight without fabricating approvals or evaluation results.
5. Independent integrated review, regression/PG checks, public-page and canonical docs updates, fresh-main merge and guarded production release on backup drive, real signed-in readback.

## Baseline facts

Live My Assistant applies to chat already. Native owner preview57 vsMCP171 tools; staff subsets differ. Garrix Lopena is one active staff record, rolemedia_buyer/customMarketingManagement,93assignedof95activeclients. No personal savedconfig or recordednativeAIChatturns last30days; defaultsettingsstillapply. Livegovernedreadiness:20employees,0covered,readyForPilot=false,enforcement=false; releasesdraft/missing/unmapped. Observe-and-learnreportedfalse. ModelOpsreports plainenvironmenttoolsEnabledfalse while UI mirrortrue, so diagnostics must use canonical runtimeconfig authority. No employee-session acceptance claimed.

## Decisions

Ruling: Reuse existing domain handlers and reviewed grants; retain legacy mcp database discriminator as a shared storage namespace where needed, while runtime provenance/audit and stable chat request keys identify chat — avoids an unnecessary broad ledger migration; wrong provenance could impair audit/replay, so verify both transports and peer-review identity.
Ruling: Do not activate draft packs or invent evaluation/privacy approval to make readiness green — preflight is reviewable, activation requires real exact-release evidence; this can leave the governed rollout pending while native integration works under existing approved marketing authority.
Ruling: Preserve current Think infrastructure and model routing; no SDK rewrite/upgrade is required for this integration repair — avoids unrelated state/transport migration.

## Research sources

https://github.com/cloudflare/agents
https://developers.cloudflare.com/agents/harnesses/think/
https://developers.cloudflare.com/agents/harnesses/think/lifecycle-hooks/
https://developers.cloudflare.com/agents/harnesses/think/tools/
https://developers.cloudflare.com/agents/runtime/routing/authentication/
https://developers.cloudflare.com/agents/model-context-protocol/apis/client-api/
https://developers.cloudflare.com/agents/concepts/conversation-state-and-memory/

The existing graph is pre-path-ID and stale/colliding; use current source and live metadata as authority. No generated graph is release proof.

## Implementation and review evidence

- Personal default inheritance, explicit General, owning conversation persistence and text/voice parsing implemented. No evaluation turn persists a personal focus change.
- Native reviewed department tools compose through the existing effective catalogue. Every new native mutation prepares an exact human-confirm card; bounded executor rechecks current authority, tool flag, schema, personal narrowing and release policy before original domain dispatch. Provider receipt states remain bounded and unknown outcomes require reconciliation.
- Shared all-active client scope includes the explicitly granted Marketing management role without supplying Finance. Runtime tool availability uses one private resolver for engine, Model Ops and My Assistant metadata.
- Independent review passed after confirmation, default-persona and receipt findings were fixed. No live ad/provider/accounting mutation was used for verification.
- Integrated Node 24.18 regression run: 243 suites passed, 2,435 tests passed, six suites/44 tests skipped. Both new disposable PostgreSQL suites ran, including concurrent proposal creation and double-confirm dispatch. Initial static UAT source assertion was updated for the extracted persistence boundary; a source-guard timeout passed on bounded-worker rerun.
- UI verification also covered compiled Vue cards, exact escaped arguments, separate rich acknowledgement and no completion claim for queued/partial results. Existing lint diagnostics were compared with HEAD; introduced formatting diagnostics were corrected.
- Company-wide evaluated employee rollout remains blocked by real release/membership/evaluation requirements. No flags, department membership, pack release or Finance grants were changed to bypass that gate.
- Build, exact merged source, production deployment ID and authenticated live readback are recorded separately in the release receipt; a plan is not release proof.
- Pre-merge production build passed: worker raw 25,399,893 / 25,468,928 bytes; gzip 7,327,271 / 9,750,000. Full repository typecheck remains red on its 1,184 existing diagnostics. The concurrent initial run also saw the earlier focus-helper error; current helper was separately semantically typechecked with the server configuration and has zero diagnostics. Six chat click-handler diagnostics map to unchanged HEAD handlers. No whole-repository typecheck pass is claimed.
