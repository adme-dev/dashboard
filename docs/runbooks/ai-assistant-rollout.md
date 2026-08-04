# AI assistant company rollout readiness

Use the readiness gate before enrolling a company-wide AI assistant pilot or enforcing governed assistant coverage.

```bash
pnpm readiness:ai-assistants -- --gate pilot --json
pnpm readiness:ai-assistants -- --gate enforced --json
```

The command exits `0` only when the selected gate passes. A successful command prints no blockers. A blocked command exits `1` and prints only stable blocker codes relevant to the selected gate. `--json` emits the same bounded readiness contract used by `GET /api/admin/ai/governance/rollout`, with its blocker list filtered to the selected gate.

## Gate requirements

- Pilot: at least one evaluated pack release in `pilot` state and at least one active, unrevoked pilot member assigned to that release.
- Enforcement: every active employee belongs to an organizational department with an evaluated active pack release. Every active organizational department must resolve to its configured canonical pack, whose actual owner must be active and an explicit current department member; it also requires an active evaluated release.

The response contains only employee IDs, display names, roles, department summaries, and deterministic blocker codes. It deliberately excludes email addresses, assistant prompts, memories, messages, tokens, credentials, and client or vendor data. The admin endpoint requires `ADMIN` permission and sends `Cache-Control: private, no-store`.

## Company-owner release inheritance

Active company owners inherit every evaluation-approved pilot and active employee-assistant release across organisational departments, while draft, failed, suspended and retired releases remain blocked. This applies only to an authenticated, active company owner; administrators and other roles continue to need the existing explicit pilot membership where it is required.

Owner inheritance is an access decision, not a release-management action. It creates no synthetic department or pilot membership, does not activate a draft release or transition any release state, and does not activate runtime or production flags. Existing evaluation, release-state, permission, tool, confirmation, budget, and audit checks still apply every time access is resolved.

## Common blocker codes

- `employee:<uuid>:no_department` — add the active employee to an organizational department.
- `employee:<uuid>:no_mapped_pack` — create and map a governed capability pack for one of the employee's organizational departments.
- `employee:<uuid>:no_evaluated_release` — complete and pass evaluation for a mapped release.
- `department:<uuid>:owner_not_ready` — assign an active governed pack owner who is an explicit current member of that department.
- `department:<uuid>:no_mapped_pack`, `ambiguous_mapped_pack`, `release_draft`, `release_pilot`, `evaluation_gate_failed`, `release_suspended`, or `release_retired` — correct the canonical governed pack mapping, release state, or exact evaluation evidence. `release_pilot` is explicitly not sufficient for enforcement.
- `no_evaluated_pilot_release` or `no_eligible_pilot_membership` — create a passed pilot release and enroll an active, unrevoked member.

If a query returns more than the supported 100 departments, employees, releases, or pilot memberships, the gate fails closed with an `*_unbounded` code. Reduce or paginate the organization before relying on this initial completion gate.

If arguments are invalid, or if a database query or readiness-row validation fails, the CLI exits `1`. With `--json`, it always prints a structured object containing `gate`, `passed: false`, and a stable `error.code`, without database error detail.

## Read/draft three-cohort pilot procedure

This section is an operator procedure, not evidence that a pilot has run. Do not enroll employees, execute paid evaluations, change preview variables, or claim UAT/security approval from a development session. A named environment owner and an independent privacy/security approver must complete the applicable checkpoints.

The pilot covers five exact pack keys mapped to three reporting cohorts:

| Cohort | Exact governed pack keys |
|---|---|
| Account management & production | `account_management_read_draft`, `production_read_draft` |
| Paid media | `paid_media_read_draft` |
| Finance & bookkeeping | `finance_read_draft`, `bookkeeping_read_draft` |

Pilot evidence is release-specific. Never combine an older evaluation, another pack version, or unlinked assistant telemetry with the selected release.

The evidence gate always returns the complete five-pack matrix. A missing pack is `insufficient_data`; multiple current pilot releases for one required pack are a hard failure. Evidence starts at the latest append-only `pilot` audit event for the exact pack version, so a new pilot episode cannot reuse tasks or ratings from an earlier episode.

### 1. Record the preview change request

Record the environment, immutable deployment SHA, operator, rollback owner, planned evidence window, and approved maintenance window. In the preview/branch environment configure only these pilot variables:

```env
AI_GOVERNED_CATALOG_MODE=pilot
AI_PILOT_UAT_ENABLED=false
AI_OBSERVE_ENABLED=false
AI_OBSERVE_PROACTIVE_ENABLED=false
PLATFORM_AGENT_THINK_TURNS_ENABLED=false
```

`AI_PILOT_UAT_ENABLED` is fail-closed and must remain false until the named operator has approval to incur model calls. While it is false, the aggregate gate reports `representative_evidence_caller_unavailable`. Enabling it is a separate, recorded operator action after deployment and migration verification; it is not authorized by this runbook or by an engineering test session.

Do not change any other AI surface flag as part of this pilot-mode change. Before deploying, separately verify that every memory, proactive, portal-write, MCP-write, financial-write, social publishing, email send, budget execution, and other action-specific write flag in the target remains off. At minimum, confirm these known assistant flags are false or unset: `AI_MEMORY_DISTILL_ENABLED`, `AI_CONTROLLER_L2_ENABLED`, `AI_PORTAL_WRITES_ENABLED`, `MCP_WRITE_TOOLS_ENABLED`, and `MCP_FINANCIAL_TOOLS_ENABLED`. `AI_TOOLS_ENABLED` is not part of this change request; preserve its already-approved target value.

Run the deployment guard before any authorized preview deploy:

```bash
pnpm deploy:check
```

Do not run `wrangler pages deploy` directly. Use only the repository deployment script approved for the recorded preview target.

### 2. Seed and evaluate exact versions

For account management, production, paid media, finance, and bookkeeping, complete these steps separately in `/admin/ai/governance`:

1. Confirm the canonical department and an active owner who is an explicit current department member.
2. Seed one dormant draft and record the business reason in the append-only audit.
3. Inspect the exact pack version, evaluation suite version, model assignment, prompt digest, toolset digest, tool bindings, and per-case latency/cost budgets.
4. Run preflight. A second authorized operator reviews the maximum model calls and spend ceiling before entering the cost approval.
5. Execute only the approved evaluation. This may incur model spend; do not run it from an engineering verification session.
6. Inspect every `fail`, `error`, and `human_review` result. Zero scope violations, approval bypasses, and prohibited effects are permitted.
7. Transition only the same evaluated version to `pilot`. A passing run for another version is not reusable.

Retain the run ID, release ID, version ID, case counts, cost approval identity, and terminal result in the approval packet. Prompts, responses, traces, contact data, credentials, and employee-level usage do not belong in pilot evidence exports.

### 3. Enroll the named pilot cohort

After all five exact versions pass, an authorized administrator selects 5–10 current, active department members across the three cohorts. For each membership record the business reason and assigned release. Do not select people from interaction volume, memory, assistant ratings, or any performance proxy. Notify participants that aggregate telemetry is used to assess the assistant and is not an employee score.

Verify with each participant that My Assistant exposes only assigned pilot packs. Revoke one controlled test membership, verify access is lost immediately, then re-enroll only if the change record authorizes it. Keep identities in the access-control record; do not copy them into the aggregate metrics packet.

### 4. Run representative UAT

For every cohort, run the approved suite tasks plus one real, non-sensitive daily workflow. Record pass/fail evidence for:

- citations and source freshness;
- client and tenant scope, including a deliberate denied cross-scope request;
- understandable denial explanations;
- no write proposal or live side effect from read/draft packs;
- immediate loss of access after the controlled pilot revocation;
- latency and cost against the exact pack version budgets.

Stop the cohort on any scope violation, approval bypass, prohibited effect, unexpected write proposal, stale/uncited material fact, or access surviving revocation. Do not repair the evidence by deleting failed turns.

Representative automation uses the ADMIN and write-access protected `POST /api/admin/ai/governance/pilot-uat` harness. Its body contains IDs only: request, release, evaluation case, actor, and conversation. The server loads the approved prompt and tool bindings from the exact passing suite, validates the current pilot episode, active cohort membership, actor-owned conversation, and exact release/version identities, then issues one durable `ai_pilot_task_evidence` record. Never send a prompt, tool list, expected answer, safety verdict, or arbitrary evidence metadata from the browser.

The harness advances one replay-safe state machine from `issued` to `started` to `terminal`, with a unique request ID and turn ID. It preserves the turn across primary/fallback attempts, requires the exact persisted assistant-message link, and records link/caller/provider failures as terminal blockers. Invocation metadata contains correlation IDs only; it is not the source of representative, safety, or feedback authority. Every evidence update must return an acknowledged row or fail the request.

After reviewing the actual persisted response and operational evidence, a different ADMIN assessor submits all six prompt-free verdicts to `POST /api/admin/ai/governance/pilot-uat/<evidence-id>/assessment`: scope, approval boundary, prohibited effects, source freshness, fabrication, and credential leakage. The actor or issuer cannot assess their own evidence. A tool loop cannot self-declare these dimensions green. Failed or missing assessment remains durable evidence and blocks promotion.

### 5. Review aggregate evidence and security approval

In `/admin/ai/governance`, set a canonical ISO window no longer than 31 days and review Three-cohort pilot evidence. The automated release gate requires:

- exact-version evaluation status `completed` with `gate_passed=true`;
- at least 20 non-fallback successful turns for every release;
- zero scope violations, approval bypasses, and prohibited effects;
- useful feedback at least 80% when the release has 10 or more ratings (fewer than 10 ratings are shown but do not create a rating threshold);
- nearest-rank P95 latency no higher than the pack budget;
- total recorded invocation cost divided by successful turns no higher than the pack per-task budget.

Every issued evidence record in the selected current pilot episode and window is included, including incomplete and failed records. A qualifying turn must reach independently `assessed`, have a successful terminal outcome, exact assistant-message link, current active pilot membership, latency, cost, non-fallback execution, authoritative enforcement evidence, and all six independent assessment dimensions. Missing terminal state, link, assessment, latency, cost, membership, or enforcement evidence blocks the gate rather than disappearing or becoming zero.

Use the explicit **Evidence from** and **Evidence through** calendars. Applying a window stores canonical `pilotFrom`/`pilotTo` instants in the page URL, and refreshes reuse those exact values. The endpoint is ADMIN-only, `private, no-store`, and returns aggregate release/cohort evidence only. It deliberately omits employee identities, prompts, responses, memories, contact details, rankings, individual scores, raw traces/tokens, and credentials. Feedback is accepted only when it joins the assessed successful evidence's exact assistant message, actor, release/version, latest pilot episode, evidence window, current active membership, and department membership. Historical, revoked, inactive, cross-turn, or otherwise unlinked feedback is excluded rather than inferred. Treat absent linked ratings as a telemetry limitation, never as positive evidence.

Complete [the independent approval packet](../security/ai-assistant-read-draft-pilot-approval.md). The approver must be independent of implementation and must sign it externally; an engineer or AI agent cannot self-approve.

### 6. Run gates

From the exact deployment SHA, with Node 24 and read-only database credentials where supported:

```bash
pnpm vitest run test/ai/pilotMetrics.test.ts test/server/api/adminAiPilotMetrics.test.ts test/app/aiGovernancePilotMetrics.test.ts
pnpm readiness:ai-assistants -- --gate pilot --json
pnpm typecheck
```

The existing readiness CLI proves that at least one evaluated pilot release has an eligible membership. It does not replace the three-cohort metrics thresholds, UAT record, or signed independent approval packet. Broader activation remains blocked until all four evidence sources pass.

### Rollback

The rollback owner performs these steps in order:

1. Suspend affected pilot releases in the governance UI and record the reason.
2. Revoke pilot memberships and verify My Assistant loses the packs.
3. Restore `AI_GOVERNED_CATALOG_MODE=legacy` in the preview change record; keep observe, proactivity, think turns, memory, portal writes, MCP writes, financial writes, and all action-specific write flags off.
4. Deploy only through the guarded preview deployment script, then re-run the readiness command and a denied-access smoke test.
5. Preserve audit, evaluation, and aggregate metric evidence. Do not delete failed or unsafe records.

Escalate any suspected scope breach, credential exposure, prohibited effect, or unauthorized write through the incident process. Rollback is complete only after the owner records the deployment SHA, revocation check, and incident/reference ID where applicable.
