# Owner God Mode Runbook

## Operating contract

God mode is always on for every authenticated team member whose current database row has `is_active = TRUE` and exact `user_role = 'owner'`. It is not granted by email address, pilot membership, a browser claim, a session toggle or a request parameter.

God mode makes every registered application and MCP capability available. It does not bypass authentication or session validation, fresh active-owner authority, tenant/client/entity isolation, mandatory immutable audit, the infrastructure emergency control, provider bindings or secrets, database constraints, or SSRF protection. Ordinary employees remain governed by release, evaluation, permission, budget and confirmation controls.

## Emergency disable

1. Set `GOD_MODE_DISABLED=true` in the Cloudflare Pages production environment and the standalone MCP Worker environment.
2. Deploy Cloudflare Pages separately. From a clean repository worktree, run `pnpm deploy:check`, then the guarded `pnpm deploy:production` command. Do not invoke Wrangler directly for Pages.
3. Deploy the standalone MCP Worker separately by following `workers/mcp-server/DEPLOYMENT.md` and the supporting operator guidance in `docs/mcp-server-guide.md`. The Pages command does not deploy this Worker; do not invent or use a single combined deployment command.
4. Sign in as an owner and confirm the `God mode active` status is absent.
5. Confirm the AI governance page reports `Emergency disabled` while retaining employee draft, failed, suspended and retired readiness data.
6. Present an existing connector claim with `godMode: true` and confirm it is rejected while the emergency disable is active. Do not accept that rejection as the governed-fallback test.
7. Reconnect the connector so it performs a fresh OAuth exchange and receives `godMode: false`. Only then run an owner MCP request and confirm it follows ordinary governance. Run an owner application request separately and confirm it also follows ordinary governance.

Treat a malformed `GOD_MODE_DISABLED` value as disabled. Do not change owner roles to operate the emergency control.

## Audit verification

For each representative application and MCP call, locate the bounded `god_mode_audit_events` records by correlation ID. Confirm an immutable `attempt` exists before execution and one terminal `succeeded` or `failed` outcome exists. Verify actor, channel, route/tool, tenant/client/entity scope, bypass-control classes and emergency state are present without prompts, message bodies, provider responses, tokens, credentials or signed claims.

An `ambiguous` event is non-terminal reconciliation evidence, never proof that execution completed. Require a later `succeeded` or `failed` terminal event before closing the verification. If no terminal event can yet be established, keep the case as an actively tracked unresolved reconciliation with an alert and named owner until reconciliation produces the terminal evidence.

Attempt-audit failure must prevent execution. Terminal-audit failure must roll back transactional mutations or leave the execution ledger in its defined non-replayable reconciliation state. Never update or delete audit rows during investigation.

## Role downgrade or deactivation

Downgrade the account through the normal role-management workflow or deactivate it. The next request must freshly revalidate the database row and deny God mode. Confirm the shell indicator disappears, My Assistant returns governed authority, MCP God-mode discovery is rejected, and ordinary permissions apply. Do not use an email-specific denylist.

## MCP signing-secret rotation

1. Schedule a short maintenance window because exact signed claims are intentionally short-lived and single-use.
2. Rotate `MCP_REQUEST_SIGNING_SECRET` to the same new secret in Cloudflare Pages and the standalone MCP Worker without reading or logging either value.
3. Preserve `MCP_INTERNAL_SECRET`; it is a separate service-authentication boundary.
4. Redeploy/restart both sides, then force clients to reconnect so no process retains the old signer.
5. Verify a new owner claim succeeds once, replay fails, an old/forged/expired/cross-user claim fails, and a current non-owner claim cannot gain God mode.

If coordinated rotation cannot be completed, set `GOD_MODE_DISABLED=true` before changing secrets and restore only after both runtimes pass the claim tests.

## Rollback

1. Set `GOD_MODE_DISABLED=true` first to return owners to ordinary governance.
2. Revert the God-mode application release using the normal Git/Cloudflare release procedure and guarded deployment scripts.
3. Leave additive audit, replay-ledger, execution-reconciliation and memory-outbox tables in place unless a separately reviewed migration explicitly removes them.
4. Verify ordinary AI, MCP, Finance, Marketing, Banners, publishing and administration flows.
5. Record the incident correlation IDs and deployment IDs without secrets or private payloads.

## Paul and Clara smoke checks

These emails are lookup targets for deployment verification only; they never grant authority.

- Query `paul@adme.net.au` and `clara@adme.net.au` using parameterized SQL. Each must resolve to exactly one active row with exact role `owner` before production activation.
- Sign in separately as each account. Confirm `God mode active` appears in the agency shell, admin shell and My Assistant.
- For each account, discover representative application and MCP capabilities in Finance, Marketing, Banners, publishing, generation and administration.
- Execute one safe representative read and one disposable/reversible write through both application and MCP paths; verify attempt and terminal audit records.
- Confirm cross-client and cross-tenant targets remain denied and audited.
- Confirm an active non-owner control account never sees the status and retains governed releases, permissions and confirmations.

Task 10 appends deployment IDs, timestamps and non-sensitive smoke-test evidence here after production verification.
