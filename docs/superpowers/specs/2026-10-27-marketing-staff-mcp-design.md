# Marketing staff MCP completion

Status: proposed design incorporating Claude planning, Kimi's source audit and
an independent Claude builder review. No product changes or activation.
Source inspected: `5d17d2fa4012a011f943df8a80c579923f163dd8`, equal to freshly fetched
`origin/main` on 27 October 2026. Branch:
`adme-dev/Garrix-Lopena-marketing-MCP-for-the-marketing-employees`.

## Outcome and scope

Marketing employees use their own XeroFlow identity from Claude or ChatGPT to
inspect assigned client accounts, analyse campaigns, prepare social content and
tracking changes, submit work for review, and inspect execution results. Owners
retain existing God mode. Admins can review delegated marketing work without
being silently promoted to owner authority.

The user requested Google, Facebook, LinkedIn, TikTok, tagging and broader
marketing workflows, and requested Claude for planning with Kimi helping.
The supplied example describes arbitrary GTM tag/trigger/variable management;
that is broader than the current XeroFlow tag installer.

Proposed policy, pending user choice: staff may read and prepare drafts for
assigned clients; publishing, scheduling for automatic publication, advertising
spend changes and tracking activation require owner/admin review. Existing
management access remains explicit. This is a design assumption, not a recorded
user approval. Custom staff roles receive only capabilities established by the
existing role resolver and explicit marketing action grants; unknown roles fail
closed. No blanket FINANCE, ADMIN or God-mode grant is part of this work.

Proposed defaults resolve the builder review's policy questions:

| Decision | Proposed default |
| --- | --- |
| Pilot population | Individually enrolled `media_buyer`, `account_manager`, `creative`, `producer`, or approved custom-role employees; enrollment does not change their base role. |
| Narrow capabilities | Separate marketing reporting, social drafting, ads planning and tracking planning grants. Reporting includes assigned-client spend, budgets and pacing, but no invoices, payroll, profitability or agency finance. Grant only the families needed by each employee. |
| Leads / project managers | Retain existing explicit management read scope; they do not become reviewers for this new workflow solely from those roles. Owner/admin are the proposed reviewer set. |
| Separation of duties | The requester cannot approve their own submission in this delegated workflow, including an admin requester. Existing owner direct execution remains a separate, unchanged path. |
| Campaign changes | Pauses, negative keywords, bidding, budgets and conversion changes all require review; no implicit emergency exception for staff. |
| Client sign-off | Preserve all existing required client/portal approvals in addition to internal review. Neither replaces the other. Both must cover the current content revision. |
| Inbox messages | Read and draft replies in the initial scope; sending comments, replies or DMs is an external publication and requires review before it is added. |
| GTM drafts | Staff may prepare a local change proposal. Writing a provider workspace/version is a separate reviewed operation after tracking ownership checks; no blanket installer permission. |

These are builder-selected defaults for review, not claims about policy already
chosen by the user.

This extends the existing Worker/Pages MCP and provider services. It does not
create another marketing backend or duplicate accepted-enquiry conversion delivery.
Provider coverage is per operation: organic publishing, paid ads, reporting and
tracking are separate capabilities.

## Verified starting point

| Area | Source evidence | Remaining work |
| --- | --- | --- |
| Remote MCP | `workers/mcp-server/src/index.ts`, `server/api/internal/mcp/` | Exercise genuine staff OAuth, scopes, tools/list and tools/call in both hosts. |
| Owner authority | `server/utils/godMode/authority.ts` checks current active owner | Preserve owner behavior; admin is not currently God mode. |
| Staff execution | `server/utils/ai/internalFetch.ts` calls `mintMcpGodModeInternalAiDelegation` for MCP; its implementation rejects non-owners | Implement an ordinary, permission-preserving service path for selected marketing tools. Do not weaken the owner bridge. |
| Tool preview | `server/api/agency/ai/mcp/my-tools.get.ts` hardcodes suite flags false and read scope | Share actual policy inputs with server discovery; label a preview separately from a particular OAuth connection. |
| Scope enforcement | `wrangler.toml` has `MCP_REQUIRE_WRITE_SCOPE = "false"`; ordinary call gate is conditional | Require signed write consent for every mutating marketing operation, including stored drafts and proposals. Plan reconnect before activation. |
| Google Ads | `server/utils/ai/mcp/googleAdsTools.ts`, `googleAdsServer.ts` provide inventory, diagnostics, planning and governed actions | Verify per-client authorization and capability flags; reuse the existing control plane. Flags in source do not establish deployed configuration. |
| GTM | `gtmTools.ts` exposes nine tools only to owner projection; `gtmRunner.ts` wraps the XeroFlow installer | Add scoped staff audit/drafting and reviewed execution; arbitrary tag/trigger/variable operations need a separate bounded extension. |
| Facebook / Instagram | Existing social provider implementations, publishing, reporting and proposals | Trace and expose safe scoped workflows; retain Meta provider permissions and lead-retrieval review gates. |
| LinkedIn | Provider and Company Page publishing/inbox/analytics code exists; `docs/runbooks/linkedin-activation.md` records prerequisites | Separate organic and ads connections; verify granted scopes and actual connected-account readiness. |
| TikTok | `socialPublishing/platformReadiness.ts` explicitly marks publishing not production-ready | Complete publishing, refresh handling, provider audit prerequisites and live acceptance before offering publishing to staff. |
| Approval | `call.post.ts` atomically claims an MCP proposal by the same user | Add a distinct reviewer decision for delegated publication; self-confirmation is not manager review. |
| Role fit | Social reads require CLIENTS; social post proposals CREATIVE; ad pacing FINANCE | Provide narrowly scoped marketing capabilities instead of granting unrelated finance or admin access. |

Local baseline: 122 tests passed across eight suites on 27 October:
`mcpGtmTools`, `mcpScope`, `mcpProject`, `mcpGoogleAdsTools`, `mcpWriteTools`,
`mcpGodModeDirectExecution`, `aiInternalFetchDelegation`, `socialClientAccess`.
These prove the existing tested contracts, not staff readiness or live provider delivery.

Kimi identified two further release blockers, independently checked against source:
`get_leads(summary:true)` resolves clients and queries counts without an assignment
predicate or tool-level required permission; `get_client_overview` queries clients
and profitability without an assignment predicate. The broken HTTP bridge does
not protect these direct database paths. Scope or deny them before the staff pilot,
even though they are outside the initial six marketing reads. Audit the complete
effective staff catalog, not just new tools. These are source findings; no live
customer data was accessed to reproduce them.

The current guide's blanket write-scope promise also conflicts with owner direct
execution, which records a scope bypass in `mcp/directExecution.ts`. Preserve
existing owner behavior in this work, describe it explicitly, and enforce the new
staff consent contract without accidentally changing owner semantics.

## Access and execution contract

1. Authenticate each employee through existing OAuth. Resolve current active
   identity, permissions and assignment at execution; never trust client IDs,
   role strings or approvals supplied by an assistant.
2. Intersect tool permissions, client assignments, signed OAuth scopes,
   capability flags and actual provider connection readiness. Listing and calling
   use the same policy. A stale host catalog cannot authorize execution.
3. Filter discovery, fuzzy-name disambiguation, summaries, aggregates, pagination,
   status, assets and replay to the same authorized resources. No assignment
   means no clients, not agency-wide access. Resolve every site/container/account/
   campaign/post back to its client server-side.
4. Prefer shared application services taking a trusted actor and resolved scope
   for ordinary marketing execution. Refactor selected HTTP-backed handlers to
   share that service with browser endpoints. Do not forge browser cookies,
   forward provider secrets or reuse the owner delegation brand for staff.
5. Use current database authority at review and dispatch. Removing an employee,
   client assignment, provider permission or action grant prevents further work,
   including confirmation and replay of sensitive results. Avoid stale assignment
   caches at mutation boundaries.
6. Keep the owner coordinator and its execution ledger intact. Marketing grants
   do not expand owner or admin status, and tenant/client validation remains mandatory.

Reuse `ToolContext.assistantScope` for the employee's multi-client scope and
the existing personal-assistant authority/role-resolution machinery where
compatible. Freshly resolve authority and assignments at sensitive boundaries;
do not assume existing cached helpers meet that requirement. The dealer-creative
PRs' single-client `clientScope` is a separate restriction and, when present,
must intersect the employee scope. Apply access checks in shared tool/services
so in-app chat cannot bypass the same client boundary. Keep current owner
behavior and explicit management scope while reconciling the existing helpers'
role-list versus permission-group differences in one tested resolver.

## Draft, review and publish contract

A draft is editable and cannot be scheduled into automatic dispatch by a staff
proposal alone. Submitting freezes an immutable revision with requester, client,
exact provider resources, content/parameters, intended action and cost impact.
An owner/admin reviewer approves or rejects that exact revision through XeroFlow.
The implementation should reuse compatible existing approval storage and UI;
it must not treat a natural-language yes or a host tool confirmation as reviewer proof.

Before dispatch, recheck reviewer and requester authority, assignments, provider
readiness and the approved revision. Editing, changing target account or provider
version drift invalidates approval. Approval expires and is single-use for the
exact operation. Requester cannot self-approve under the proposed staff policy.
Record requester, reviewer, executor, revision, attempt and outcome separately.

Reuse durable idempotency and provider reconciliation. Retries must not publish
twice or spend twice; unknown provider outcomes remain held pending read-back.
Report queued, accepted, published, failed and unknown distinctly. Admin review
uses ordinary governed execution, not a fabricated owner delegation.

## Tracking contract

Before any dealer-specific proposal, record dealer/client ID, exact host/form
endpoint, native DriveAgent versus external site, current conversion owner,
consent requirements and existing provider hooks. Inspect current source, tracking
guides, maintained wiki/graph and Conversion Delivery evidence. This design
selects no dealer, host or container and authorizes no tracking mutation.

Native DriveAgent enquiries retain their supported server delivery. A GTM action
requires a documented browser need or an external-site integration with verified
ownership and provider-specific deduplication. Do not run the XeroFlow installer
merely because a user asks for conversion tracking or a provider shows a warning.

For the screenshot's broader workflow, provide bounded read inventory and audit
first, then typed tag/trigger/variable/folder changes in isolated workspaces.
Compilation produces an exact version and reviewable diff. Publish requires the
reviewed version, freshness check and live read-back; rollback targets the known
previous version. Exclude arbitrary custom HTML/JavaScript from the initial staff
capability. Record unsupported templates honestly rather than promising universal
GA4/Google/Meta/LinkedIn/TikTok tag creation.

## Delivery slices and acceptance

### 1. Working staff foundation and a usable read pilot

Implement shared policy/config resolution, scoped client discovery, and ordinary
service-backed marketing reads for campaign/ad diagnostics and social reporting.
Correct the connector tool preview and onboarding instructions. Use explicit
marketing grants where existing role groups do not fit. Cover alternate routes,
summary queries and client-name resolution before exposing those tools.

Start with `get_campaign_breakdown`, `get_ad_breakdown`, `get_ad_creative_text`,
`get_search_terms`, `get_adspend_pacing`, and `get_social_performance`, plus scoped
client/account discovery. Each tool ships only after its full data path satisfies
the scope contract. Keep existing tool semantics and add marketing-only pacing
access without widening finance access. Resolve runtime configuration from
`event.context.cloudflare.env` first, with local/test environment fallback, through
one shared resolver for discovery, preview and execution. New capability rollout
switches must never disable authorization checks or restore agency-wide exposure.
Existing role-visible tools outside the reviewed marketing set must either pass
the same client/data-class checks or be withheld from the pilot at both discovery
and execution. In particular, a generic client overview cannot expose profitability
through a marketing reporting grant, and lead summaries cannot leak other clients.

Acceptance: two staff identities assigned different clients see only their own
clients in lists, aggregates and detail results. Unassigned IDs, ambiguous names,
custom roles without grants, deactivated users and revoked assignments fail
before data/provider access. Browser preview matches the equivalent actual scope
and policy projection; owner behavior remains intact. No staff tool is advertised
as working if its only execution path requires owner authority.

### 2. Social drafting and genuine reviewer approval

Connect scoped account discovery, post drafts and status tools to existing social
services. Support Facebook, Instagram and LinkedIn only as far as their connection
readiness permits. Introduce revision-bound review and approved scheduled dispatch.
Do not enable all existing MCP writes just to expose this subset.

Extend the current text-only post proposal with authorized media asset references
and exact client-bound account targets. Instagram requires media; a text draft
alone is not a publishable Instagram workflow. Validate attachment ownership,
provider formats and platform-specific prerequisites before submission for review.
Provider OAuth/account setup remains a dashboard flow: connecting XeroFlow to
Claude or ChatGPT does not connect any social or advertising account by itself.

Acceptance: staff creates a draft for its assigned client, a different authorized
reviewer approves the exact revision, one provider dispatch occurs, and receipt
and status are stored. Deny target swaps, edited approvals, missing write scope,
self-review, revoked reviewers and repeated confirmation. Verify ordinary admin
execution without owner elevation. Use mocked providers first, then an explicitly
selected real post/account for hosted acceptance.

The existing social create endpoint already forces a draft and has client-access
checks; reuse it and the existing request-approval/approve/publish flow where
compatible. Add missing revision binding and separation of duties without
replacing required client approvals. An MCP-generated `scheduledAt` does not
authorize scheduler dispatch.

### 3. Google Ads and GTM marketing workflows

Reuse Google Ads inventory/planning/validation/action services and add reviewer
policy without bypassing current budgets or destructive-action controls. Add
client-bound GTM reads/audits, isolated typed drafts and reviewed publish/rollback.
Do not expose agency-wide Google connection/account discovery to scoped staff.

Acceptance: exact client/account/connection mapping at read, proposal, review,
execution and replay; validation makes no live campaign changes; provider drift
invalidates approval; write/automation/destructive gates are distinct; tracking
ownership evidence precedes any installation. Compile and fixture checks are
reported separately from publication and actual conversion delivery.

### 4. Remaining platform capability completion

Complete TikTok independently of the already-supported social platforms. Audit
paid-ad versus organic coverage for Meta, LinkedIn and TikTok and add missing
typed operations only through their existing provider services. Unsupported
actions remain visibly unavailable with a specific reason.

Acceptance is per platform/action/account: OAuth scope grant, refresh/revocation,
target mapping, safe failure, approval, dispatch idempotency and provider receipt.
Do not change `productionReady` solely because a local test or OAuth flow passes.

### 5. Rollout and staff handover

Test real employee OAuth in Claude and ChatGPT, role and assignment revocation,
read-only versus write scope, host tool refresh, denial paths and action results.
Start with selected staff/client accounts, then expand after evidence is recorded.
Update `docs/mcp-server-guide.md`, relevant public feature pages/navigation and
maintained tracking documentation when behavior changes. Use current-main source,
repository deployment guards and QR/navigation regression checks for release.
Record source SHA, deployment target/ID and live verification separately.

## Dependencies and current evidence boundaries

Open PRs inspected: #683 (banner client scope; currently conflicting), #684
(video client scope), #687 (generation client scope), #689 (proposal/replay client
scope). They form a dealer-creative stack and are not merged acceptance evidence.
Coordinate overlapping files and extract/reconcile necessary work onto then-current
main; do not blindly merge the stack or require unrelated creative delivery for
the staff read pilot. Dealer-scoped OAuth is distinct from internal staff assignment.

The June MCP roadmap is historical context and contains stale capability claims.
Current source governs this design. No database, Cloudflare environment, provider
credential, live employee login or account-specific entitlement was inspected or
changed in this assessment. No customer enquiry was fabricated. Wiki/graph
freshness and dealer-specific tracking evidence remain prerequisites for slice 3.

Host documentation checked 27 October 2026:

- [OpenAI custom MCP setup](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt): current Plugins setup replaces the old mandatory Developer Mode steps; full write support is documented for Business and Enterprise/Edu, while Pro has read/fetch access. Workspace tools require admin refresh after changes. Confirm the actual staff workspace at rollout.
- [Claude custom connectors](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp): remote connectors include Free (one connector) and paid plans; organization controls and per-user OAuth still apply.

## Next decision

Approve or adjust the proposed staff action policy and this staged scope before
implementation. The recommended first implementation is slice 1, followed by the
reviewed social workflow; TikTok completion and general GTM editing remain explicit
deliverables rather than implicit promises of the initial pilot.

## Resume record

Worktree: `/Users/paulgiurin/orca/workspaces/dashboard/Garrix-Lopena-marketing-MCP-for-the-marketing-employees`.
Only this design document was added. Product code, flags, database and deployments
are unchanged. Baseline commands were `pnpm exec vitest run` with the six MCP
suites listed above, then the two targeted internal-delegation/client-access suites.
Planning/audit reports are `/tmp/marketing-mcp-claude-plan.md`,
`/tmp/marketing-mcp-kimi-audit.md` and `/tmp/marketing-mcp-builder-review.md`;
this document retains the reconciled decisions because temporary reports may expire.
Claude's suggestions to require the dealer-creative PR stack first and defer the
ordinary read execution fix were not adopted: overlap needs coordination, while
slice 1 must deliver actually executable staff reads. Its old host instructions
were superseded by the official documentation checked above. The builder's policy
questions are resolved as explicit proposed defaults, pending user review.

Next: record the user's policy/design response, fetch current main again and
check relevant PR ownership, produce the detailed slice-1 implementation plan,
then implement and verify its real staff execution and client isolation. Preserve
remaining social, ads/GTM and TikTok slices until their acceptance is satisfied;
do not call the read pilot completion of the full marketing MCP request.
