# Marketing staff MCP setup and operations

This runbook describes source-supported staff access. It is not evidence that a staff member is enrolled, a host has completed OAuth, a provider app is eligible, or a publication reached its destination. Keep source qualification, configuration, deployment, host acceptance and provider delivery as separate records.

## Enroll a staff member

1. An operator identifies the intended active team member, their current role/custom permission groups and active client assignments. Use the normal staff and client administration workflows; do not put staff UUIDs, grant values or credentials in documentation, source control or chat transcripts.
2. Choose only the capabilities needed. `MCP_MARKETING_STAFF_GRANTS` is one operator-owned JSON object mapping team-member UUIDs to arrays containing `reporting`, `social_draft`, `ads_plan`, `tracking_plan` and/or `department_management`. The following is a schema example, not a deployable grant:

   ```json
   {
     "<replace privately with the selected team-member UUID>": ["reporting", "social_draft"]
   }
   ```

   All keys must be UUIDs and every capability must be recognized. One malformed entry invalidates the entire configuration; the parser permits at most 500 entries. Do not use role names, emails or an agency-wide wildcard as keys. Keep the actual grant in approved runtime configuration, not in this repository. Staff enrollment selection is an operator input; this implementation selects nobody.
3. Check live deployment binding capacity and legacy overrides before changing configuration. The compact `MCP_SUITE_CONFIG` source replaces three production variables with one; see [marketing management configuration](marketing-management-config.md). Source variable counts are not a live capacity inventory. LinkedIn credentials and TikTok eligibility remain separate provider requirements.
4. Enable only the intended suites. A present legacy flag overrides the compact source, including explicit false or malformed values. Financial, destructive and autonomous advertising operations remain separately gated. `department_management` requires the explicit `MARKETING_MANAGEMENT` permission group as well as the grant; the group grants all-active-client scope without granting general MANAGEMENT, ADMIN or FINANCE. All ordinary mutations require signed `mcp:write` and a writable role.
5. Open **AI → Connect AI Assistants** (`/agency/ai/connectors`) as that user and refresh access. Review the effective groups, read-only policy, capabilities and client-scope count. Ordinary staff are limited to active assigned clients; fresh MANAGEMENT/ADMIN or dedicated MARKETING_MANAGEMENT authority uses all active clients, including newly activated clients without additional assignment rows. Zero assignments means zero client data, not agency-wide access. The page exposes counts, not other clients' details.
6. Complete the host steps below using the staff member's own login. Compare the real host tool catalog with the expected scope after authorization. The page assumes `mcp:read` and `mcp:write`; it does not inspect the host grant. A preview is not OAuth acceptance. No access-token entry is required on the setup page.

Fresh identity, custom/system role policy, assignments and grants are resolved again on each ordinary catalog or tool request. Storage failure denies access. The owner God-mode preview remains a separate authority path and is not a model for employee enrollment.

## Connect a host

Use the full endpoint **https://mcp-server.adme-dev.workers.dev/mcp**, including `/mcp`. Deployments can configure a different Worker origin; use the URL shown on the setup page for that environment.

Current official instructions were checked on 28 October 2026 local time. Labels and availability can vary by account/workspace. These are documentation checks, not live host acceptance.

- **ChatGPT:** On the web, open **Plugins → + → Add custom MCP server**, enter the connection details and endpoint, review authentication and the risk notice, create and install the plugin. In a new **Work** chat, use `@` to select it. After tool/authentication changes, open the plugin and choose **Refresh**. Account/workspace policy and rollout determine availability; do not promise full writes for every plan. The recorded OpenAI availability note places full modify/write MCP in the Business/Enterprise/Edu beta rollout; check the current official availability before enrollment. Review the OAuth permissions and any action confirmations shown. [Official connection and test guide](https://developers.openai.com/plugins/deploy/connect-chatgpt), [availability](https://help.openai.com/en/articles/12584461-connecting-custom-mcp-servers-in-chatgpt).
- **Claude:** Pro/Max users add a connector under **Customize → Connectors → + Add → Add custom connector**. On Team/Enterprise an authorized owner first provisions it under **Organization settings → Connectors → Add → Custom → Web**; each member then chooses **Connect** in Customize. Remote connectors support Free (one connector), Pro, Max, Team and Enterprise. Review OAuth scopes and tool approvals; enable only needed conversation tools. Avoid unattended “Allow always” without explicit acceptance, and disable write tools for Research. [Official remote connector guide](https://support.claude.com/en/articles/11175166-get-started-with-custom-connectors-using-remote-mcp).
- **Cursor:** Manage MCP under Customize or configure the remote URL in `mcp.json`; Streamable HTTP supports OAuth. Use the staff member's own XeroFlow login and review tool approval settings. [Official MCP guide](https://cursor.com/docs/mcp).

Host authorization connects the assistant to XeroFlow only. It does not authorize Meta, LinkedIn, Google, TikTok or another provider. Connect providers separately through their existing XeroFlow account workflows. A successful host connection does not refresh stored reports or prove a provider action succeeded.

## Supported staff work and operation gates

The actual catalog is authoritative. It intersects the safe reviewed policy, fresh access, capability grants, signed scopes and enabled suites; descriptions below do not grant tools.

| Capability | Source-supported work | Boundary |
| --- | --- | --- |
| `reporting` | `get_campaign_breakdown`, `get_ad_breakdown`, `get_ad_creative_text`, `get_search_terms`, `get_adspend_pacing`, `get_social_performance`; permitted stored Google Ads catalog/status reads | Scoped stored data with date/source/coverage information; no provider refresh by ordinary staff reads. Missing, stale or unmapped coverage is not zero performance. |
| `social_draft` | `list_social_publishing_accounts`, `list_social_media_assets`, `get_social_post_status`; `create_social_post_draft`, `update_social_post_draft`, `submit_social_post_for_review` | The last three require `mcp:write`. Local draft/review preparation only; no staff inbox reply, comment-send or direct publication tool. |
| `ads_plan` | Reviewed `google_ads_plan_*` operations and permitted validation/status reads | Plan creation requires `mcp:write`; retained plans are reviewed/executed through the separate existing workflow. Capability does not permit arbitrary provider mutations or legacy `google_ads_run_*`/`propose_google_ads_action`. |
| `tracking_plan` | `list_gtm_site_inventory`, `get_gtm_tracking_ownership`, `list_client_gtm_connections`, `get_gtm_change_status`; reviewed ownership and `propose_gtm_*` preparation | Ownership recording and proposals require `mcp:write`. Review, exact resource/version checks and verified read-back remain separate; proposal creation is not live publication. |

The `department_management` grant adds the dedicated department suite. Client KPI targets can be read and replaced through `marketing_get_client_kpi_targets` and `marketing_set_client_kpi_targets`; saves require the exact current revision and acknowledgment, use the native target records, and never change provider budgets. `departmentToolNames.ts`, family schemas and the projected catalog are authoritative:

| Area | Department operations | Additional boundary |
| --- | --- | --- |
| Portfolio and reporting | Active clients, daily exceptions, budgets, campaign inventory and aggregate lead/SEO/inbox/email/creative/work reports | Stored coverage and freshness remain explicit; missing data is not zero performance. |
| Budgets, ads and feeds | Reviewed allocation changes, feed configuration/regeneration, Google Ads and PMax preparation/review/execution, paused Meta ad creation, catalog product-set workflows | Independent exact-revision review and current provider/account authority; recorded allocations do not change provider campaign budgets. Catalog price filtering is not supported. |
| Social and inbox | Social drafts, independent publication review/execution, conversation triage/notes and reviewed replies | Exact target/account/message review, per-operation provider eligibility and retained uncertain receipts. Browser manual replies retain their explicit human-action workflow. |
| Email | Campaign preparation/preview, staff-only test sends, exact audience freeze, independent review and bounded send/continuation | Consent/suppression rechecked per batch, configured sender and sending switch required; no automatic dispatch-cron activation. |
| Work, content and leads | Board/task management, scoped brief reads, editorial content/review/publication, lead follow-up assignment and reviewed routing configuration | Native board membership remains required; routing changes never replay existing customer leads. |
| Creative and websites | Banner projects/templates/assets, revision-bound draft changes and MP4 renders; website draft reads, Dashboard-document draft saves, independent version review, submission, candidate builds and approved releases | Banner protections, native website grants/entitlements and original-login checks remain mandatory. See website connection requirements below. |

All department writes require the write suite and signed `mcp:write`. Feed operations require the feed suite, creative operations the banner suite, and Google Ads operations their specific read/write suite. Direct catalog-wide `confirm_action` is unavailable. Provider execution retains exact revision, current actor/reviewer/resource authority and durable unknown-outcome handling.

This suite does not expose every browser action. Studio-editor checkpoint editing, website rollback/domains/subscriptions, video generation, banner asset upload/brand kits/scheduling, email subscriber/list administration and detailed inbox automation settings remain outside the department MCP catalog. Google HTML5 ad publication is preparation-only. Do not describe these source gaps as provider approval failures or imply that a role grant creates missing tools.

### Website connection requirements

Enroll explicit `PAGE_STUDIO_VIEW`, `PAGE_STUDIO_EDIT`, `PAGE_STUDIO_APPROVE` and `PAGE_STUDIO_PUBLISH` groups for staff who manage websites; the marketing group alone does not grant them. Sites must belong to the current agency tenant and an active client with a valid entitlement. Domain and subscription administration are separate permissions.

Deploy Pages before the MCP Worker when introducing the original-login proof transport and OAuth state binding. Existing connected tools remain usable; new connections and in-flight consents must retry after the Worker update. Deploy the Worker immediately after Pages; see its [deployment procedure](../../workers/mcp-server/DEPLOYMENT.md). Staff then reconnect their assistant while genuinely signed in to XeroFlow. Submission, candidate builds and publication retain a non-bearer proof of that original login and recheck native login revocation and permissions. They require another connection after the original login expires; OAuth refresh does not extend it. Older connections without this proof receive `reconnect_required`. No app session token or signed preview bearer URL is returned to the assistant.

Actor-private/self-scoped tools are separately admitted by policy. Ordinary staff do not inherit the entire registry, finance snapshot, unrestricted client profitability, arbitrary lead access or owner catalog. Management uses the fresh group ceiling and still requires signed write scope; active owner authority has its separate audited catalog.

Social account readiness is **per operation**: organic publishing, comments, inbox reads, organic reporting, paid reporting and paid mutation can have different results. Inspect **Publishing → Accounts** (`/agency/social/publishing/accounts`) for account-specific state and reasons. `available`, `code_incomplete`, `unsupported` and `external_blocked` are not interchangeable. Account readiness is a prerequisite, not a publication receipt.

- Facebook and Page-linked Instagram need healthy account grants and required permissions for the specific operation.
- LinkedIn organization publishing requires Company Page authority and publishing grants. Comments/inbox and Page analytics need their own scopes/products; Ads authorization is a separate integration. Video upload/processing, exact media eligibility and provider acceptance still gate publication.
- TikTok publishing is unavailable in production pending actual product/use-case eligibility, audit, creator grant, verified media property and live acceptance. TikTok's guidelines exclude internal-only team upload utilities; code or OAuth alone cannot establish eligibility. Do not substitute advertising credentials or enable an internal publishing utility to clear the gate. [Official content-sharing guidelines](https://developers.tiktok.com/doc/content-sharing-guidelines/).
- Other browser-supported platforms do not automatically become staff reviewed publishing targets. YouTube publishing remains disabled. No universal cross-platform inbox or posting coverage is promised.

## Review, revoke and recover

A social submit creates an immutable revision. An independent owner/admin or explicitly authorised marketing manager reviews that exact revision; the requester cannot approve their own revision. Changes to copy, target accounts, media or options require a new revision/review. Expired review requests must be resubmitted. Approval rechecks the requester’s current grant, writable policy and client access. Fresh authority, assignment, permission, provider and media checks run again before dispatch; a previously visible tool or approval never overrides revoked access. TikTok consent, where the dormant path is tested, is tied to the exact payload/account/media identity and must be renewed after change.

For revocation, remove the staff member's entry or capabilities from the operator JSON, revoke assignments or deactivate the user as appropriate. To revoke all marketing grants, explicitly retain the binding with value **`{}`**. Do not delete the binding as a revocation mechanism: an absent key can fall back to process environment. A present binding wins even if invalid; an invalid configuration grants no marketing capabilities. Revoking this JSON does not revoke management/owner authority, other actor-private tools, a provider OAuth grant or the host connection itself; handle those through their own controls. Refresh the page and host catalog, then verify the next request is denied as expected.

If a publication response is lost or uncertain, retain the durable attempt and reconciliation state. Do not blindly retry publication. Inspect the exact target's initial publication receipt and any separate first-comment receipt; accepted/queued/unknown/partial results do not mean every destination delivered. Reconciliation must reuse retained identity rather than create another send. A published post with an uncertain comment is not a safe invitation to republish the post.

## Verification and release evidence

Focused setup checks:

```sh
pnpm exec vitest run test/app/marketingMcpConnectorSetup.test.ts test/server/api/marketingMcpPreviewMetadata.test.ts
```

These tests exercise the page's loading/error/retry and access display, fresh metadata and shared projection, owner separation and client-detail minimization. UI tests use component adapters and mocked fetch; API tests use fresh storage fixtures. They are not host OAuth or browser-layout acceptance.

The release operator owns combined regression selection, current-main reconciliation, required migration receipts, build/typechecks, `pnpm deploy:check`, guarded deployment and live verification. Before release, record the source commit/current main, target `agency-dashboard`, artifact/deployment ID and the matching live source. Preserve and smoke-test established navigation, including QR Codes, alongside connector access and provider readiness. Record actual employee OAuth/tool discovery and any approved provider operation separately. Do not fabricate a customer enquiry or publication merely to obtain delivery proof.

Source references: `server/utils/ai/mcp/{marketingPolicy,staffAuthority,runtimeConfig,marketingTask4Names,socialToolNames}.ts`, `server/api/agency/ai/mcp/my-tools.get.ts`, `shared/socialCapabilityReadiness.ts`, `server/utils/socialPublishing/{revisions,dispatch,reconciliation}.ts`. These contracts take precedence over older diagrams and marketing copy.
