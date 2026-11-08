# Marketing specialist rollout — 8 November 2026

Status: PR #896 is merged and the repair is deployed to production. Owner-session
smoke checks passed; genuine marketing staff-session acceptance remains open.
This record narrows the rollout
to the existing marketing cohort; it does not claim company-wide governed-pack
activation.

## Current evidence

- The canonical database was read on 8 November. Garrix Lopena and Hannah Lavina
  are active, with the writable Marketing Management custom role. Both have
  CLIENTS, CREATIVE, MARKETING_MANAGEMENT, MEDIA_BUYING, QR_CODES and the four
  Page Studio view/edit/approve/publish groups. Neither has general ADMIN,
  MANAGEMENT or FINANCE. No role or assignment was changed in this audit.
- The earlier [marketing management release](../runbooks/marketing-management-mcp-release-20261028.md)
  records their authorized enrollment and department capability grants. That
  historical secret-grant evidence still needs employee-session confirmation;
  the current Pages configuration download does not disclose secret values.
- PR #896 merged at `647974d7171ac86c7156480cc35a269fb54b3625` on
  8 November at 11:51:11 UTC. That exact current-main source passed
  `pnpm deploy:check` and `SEARCH_AUTHORITY_ENABLED=true pnpm deploy:production`
  on Node 24.18.0. Production Pages deployment is
  `c3ca1dd6-7085-4edb-adbc-5dcdd01115f4`, project `agency-dashboard`, branch
  `main`, URL `https://c3ca1dd6.agency-dashboard-6cm.pages.dev`. The deployment
  listing confirms source `647974d`. The previous production deployment was
  `c5a665e3-a2e5-4de1-a3d2-8b11cf40c9db` at `62776b7`.
- A fresh production configuration download confirms MCP is enabled. The compact
  configuration enables generation, reviewed writes, video discovery, banners,
  feeds and Google Ads read/write. Financial, video generation, Google Ads
  automation and destructive suites are false. No legacy suite override was
  present in the downloaded production variables. No configuration was changed.
- The owner-authenticated connector page loaded, displayed the MCP endpoint and
  reported 171 tools in its owner preview. This is not a staff catalog or OAuth
  acceptance result. My Assistant reported the existing `legacy` runtime mode.
- After deployment, `/api/health`, `/api/admin/ai/mcp/status` and
  `/api/agency/ai/my-assistant` returned HTTP 200 on `app.xeroflow.io` in the
  owner's existing session. The status endpoint now reports the compact suite
  configuration above correctly, including the Google Ads flags, instead of
  incorrectly reporting every suite false. My Assistant retains `legacy` mode.
  Owner counts (171 MCP tools and 63 assistant tools) remain owner diagnostics.
- Live QR Codes, Ad Spend, My Assistant and AI Chat navigation rendered their
  expected page headings and controls. These are owner-session page/API smoke
  checks, not employee tool execution, external-host OAuth or provider delivery.

## Delivery boundaries

The existing operational marketing MCP and its native chat adapter use fresh
role, capability, client and operation checks. The evaluated assistant-pack
rollout is a separate release mechanism. Zero evaluated active packs does not
alone prove that every marketing MCP tool is unavailable. Conversely, a working
MCP connector does not establish that a governed pack passed evaluation.

Keep the current runtime policy and exact operation gates. Do not switch to
enforced mode, fabricate evaluation approvals or grant owner authority to make
staff discovery pass. Native chat uses its authenticated actor; external MCP
requires that employee's actual OAuth consent.

## Staff acceptance

Run the following separately for each enrolled marketing staff member using
their genuine XeroFlow login. Keep identity/session evidence private; never
copy tokens, private client content or customer payloads into this report.

1. Open **Tools → My Assistant** and **AI Chat**. Confirm the displayed role,
   marketing focus and available workflows reflect the staff account. An owner
   preview cannot substitute for this step.
2. Ask for available marketing capabilities and a source-dated, read-only
   summary for an authorized active client. Check reporting/source freshness,
   client scope and clear unavailable-data explanations. Missing data must not
   be presented as zero performance.
3. Verify a company-finance request is denied. Check inactive or foreign client
   boundaries using the approved test case without returning restricted data.
4. For an agreed internal example, verify draft/proposal actions display the
   exact confirmation and independent-review stages. Do not publish, spend,
   send email or alter a customer's setup merely to obtain a smoke-test receipt.
5. If external Claude/ChatGPT access is required, open **AI → Connect AI
   Assistants**, refresh access, and connect using the endpoint shown there and
   the employee's own host account. Compare its actual tools with the preview
   and review write consent. Website operations may require reconnection for
   original-login proof. Host menus can vary; use the current host's setup flow.
6. Record each tested operation as available, denied as expected, unavailable,
   or failed, with its time and source/deployment. Provider operations need their
   own authorized target and outcome receipt.

Supported operation details and revocation procedure remain in the
[marketing MCP runbook](../runbooks/marketing-staff-mcp.md). The separate
[assistant-pack rollout](../runbooks/ai-assistant-rollout.md) retains its exact
evaluation, independent approval, pilot and privacy/security requirements.

## Engineering verification

- Combined verification on Node 24.18.0: 150 tests passed in 16 files covering
  fresh role authority, evaluation approval/orchestration/API, MCP diagnostics,
  both gate inventories, native marketing discovery/execution/confirmation and
  role skills. `pnpm deploy:check` passed for `agency-dashboard / main`; its
  source check initially confirmed base head `17b7b1879` includes main `62776b77a`.
  Final changes were committed at `2d347132188dc5ce0f1cb57316889fc4058bc3b8`,
  then squash-merged and rebuilt from the exact source recorded above. The final
  deployed Worker is 25,447,190 / 25,468,928 raw bytes (21,738 remaining) and
  7,341,034 / 9,750,000 gzip bytes. Size guards were unchanged. The changed-path lint
  comparison found one added explicit-any diagnostic in a new test callback;
  changing that callback to `unknown` restored baseline parity. Its 12 API tests
  passed again. No new lint diagnostics remain in the changed TypeScript files.
- Claude: shared-resolver admin status fix and 106-test affected selection
  completed. CI evidence and retained exact-main comparison attribute the
  1,184 typecheck diagnostics to existing baseline debt. The typecheck remains
  red; no workflow gate was weakened. Independent cost-approval review found no
  blocking defects and repeated the 60 focused tests. A separately retained
  PostgreSQL 14.19 exact-store-code proof passed 15 checks, covering creator
  rejection, distinct approval, exact identity/spend/expiry boundaries, replay,
  legacy self-approval exclusion and revocation. Its private evidence filename is
  `claude-eval-self-approval-pgproof-20261108.log` in the owned task evidence directory.
- Kimi: independent role/revocation review passed 263 tests across role/context,
  native marketing discovery/execution/confirmation and domain workflows,
  including two real PostgreSQL authority/concurrent-confirmation tests. No
  blocking findings remained.
- Grok: preflight-creator self-approval is rejected at approval insertion and
  execution. The store refuses self-approved trust artifacts and the orchestrator
  rejects them before executor creation or run claim. Sixty focused mocked/SQL
  contract tests passed; a real disposable PostgreSQL 14.19 check confirmed
  same-creator rejection, historical-row retention without execution authority,
  idempotent replay and distinct-approver admission. No migration or production
  record was changed. Independent review of the admin status correction found no
  high or medium findings, with 13 focused tests passing. Reviewed handler blob
  `dd57256f06fb384b4c2692b66d063493e3e128e8`, status-test blob
  `9f938db60599a6fc0522dd50c315ab90b9c81161` and inventory-test blob
  `195ba9a1c8fcfc7f88448d135f6fcc6e5024c6df` were unchanged after review.
  Admin registered-tool counts remain a diagnostic projection rather than
  staff OAuth/catalog acceptance evidence.
- Final-head main CI passed, including the full test suite, production Worker
  build, email-renderer artifact isolation, social-publishing regression and
  Pages deploy guard: [run 42472885704](https://github.com/adme-dev/dashboard/actions/runs/42472885704).
  The separate email-design typecheck remains red with exactly the existing
  1,184 raw / 1,160 unique diagnostics, zero added or removed against the retained
  baseline. Its worker and PostgreSQL jobs passed. No check was bypassed or
  weakened, and PR #896 used the normal GitHub merge operation.
- Coordinator: combined review, current-main reconciliation, integration,
  guarded production deployment and owner-session live checks completed.
  No production role, client assignment, grant, suite switch or provider record
  was changed to obtain acceptance. The Orca workspace reports `isPinned: true`.
- Staff: complete genuine signed-in acceptance. No employee acceptance has been
  inferred or impersonated.
