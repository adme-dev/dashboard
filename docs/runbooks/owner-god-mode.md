# Owner God Mode Runbook

## Operating contract

God mode is always on for every authenticated team member whose current database row has `is_active = TRUE` and exact `user_role = 'owner'`. It is not granted by email address, pilot membership, a browser claim, a session toggle or a request parameter.

God mode makes every registered application and MCP capability available. It does not bypass authentication or session validation, fresh active-owner authority, tenant/client/entity isolation, mandatory immutable audit, the infrastructure emergency control, provider bindings or secrets, database constraints, or SSRF protection. Ordinary employees remain governed by release, evaluation, permission, budget and confirmation controls.

## Production rollout record — 2026-08-05

Owner God Mode and the standalone MCP transport are live in production against the canonical authenticated application origin `https://app.xeroflow.io`.

- MCP Worker version: `fa7bb8d4-cdf8-4569-bcb8-40b2c63fe44e`.
- Pages cron Worker version: `bf5e9bc2-d558-473a-97c1-fb0c71e719aa`.
- Earlier successful guarded Pages deployment: `cccdb9f1`.
- Final read-bridge Pages deployment: `e553592e-8a74-4a60-9037-02ad3d1d530b` (`production` / `main` / `success`).
- OAuth granted `mcp:read mcp:write`, negotiated MCP protocol `2025-03-26`, and discovered 62 registered tools spanning Finance, Marketing, Social, Banners, Video and the wider platform.
- Paul resolves to exactly one active owner, the live UI shows `God mode active`, and governance readiness returns HTTP 200.
- Clara resolves to exactly one active owner in the production database. No Clara browser session was impersonated, so her live UI and connector smoke are still pending.
- The first safe Finance read exposed a read-bridge defect fixed by `0a5a4a89`. Paul's repeated bounded Finance MCP read returned `isError=false`; immutable audit recorded `started`, then terminal `succeeded` with outcome `read_completed` at 2026-08-05 08:27 UTC. No payload or secret value is recorded here.

Production configuration has been verified by name only. Never retrieve or record values. The standalone Worker uses `MCP_INTERNAL_SECRET`, `MCP_REQUEST_SIGNING_SECRET`, `OAUTH_KV`, `MCP_OBJECT` and canonical `APP_BASE_URL`. Pages uses `MCP_SERVER_ENABLED`, `MCP_INTERNAL_SECRET`, `MCP_REQUEST_SIGNING_SECRET`, `MCP_HANDSHAKE_SECRET`, `MCP_WORKER_ORIGIN` and Pages-only `GOD_MODE_INTERNAL_EXECUTION_SECRET`.

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

- Parameterized production queries verified that `paul@adme.net.au` and `clara@adme.net.au` each resolve to exactly one active row with exact role `owner`.
- Paul was verified through his own live session: `God mode active` is visible and governance readiness returns HTTP 200.
- Clara was verified at the database authority boundary only. A separate Clara login was not performed or impersonated; her agency shell, admin shell, My Assistant and MCP connector remain pending.
- Paul OAuth granted `mcp:read mcp:write`, negotiated protocol `2025-03-26`, and discovered 62 tools including Finance, Marketing, Social, Banners and Video.
- Paul's safe Finance MCP read succeeded after Pages deployment `e553592e-8a74-4a60-9037-02ad3d1d530b`, returning `isError=false`. Immutable audit progressed from `started` to terminal `succeeded` / `read_completed` at 2026-08-05 08:27 UTC.
- Still execute one disposable/reversible write through both application and MCP paths before declaring the write smoke complete; never use an irreversible finance or publishing action.
- Confirm cross-client and cross-tenant targets remain denied and audited.
- Confirm an active non-owner control account never sees the status and retains governed releases, permissions and confirmations.
