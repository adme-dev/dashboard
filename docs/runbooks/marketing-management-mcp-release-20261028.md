# Marketing management MCP release — 28 October 2026

Status: implementation and qualification in progress; this record does not yet establish a production release. This extends the earlier [marketing staff release](marketing-staff-mcp-release-20261028.md). Garrix and Hannah are the authorised enrollment targets, across all active clients. Employment titles are unchanged.

## Implemented scope

The dedicated `MARKETING_MANAGEMENT` group and `department_management` grant cover stored department reporting, marketing budgets and KPI targets, reviewed Ads/GTM/social operations, Google PMax plans, paused Meta ad launch, vehicle feeds/catalogs, tasks/briefs/content, email campaigns, community inbox, lead assignment/routing, Banner Studio and Page Studio workflows. The [operator guide](marketing-staff-mcp.md) records supported operations and native-editor/provider limitations. Owner authority, current grants, independent approval, exact revisions and unknown-outcome reconciliation remain separate controls.

The proposed writable custom role contains CLIENTS, CREATIVE, MEDIA_BUYING, QR_CODES, MARKETING_MANAGEMENT and PAGE_STUDIO_VIEW/EDIT/APPROVE/PUBLISH. It does not grant general ADMIN, MANAGEMENT or FINANCE. The client browser boundary supplies marketing views and rejects billing/profitability operations for this role. Selected marketing board memberships remain necessary for task access; all-active-client scope does not waive board permissions.

## Local qualification

- Claude implemented/reviewed operation families, Studio authority and build compaction. Kimi independently reviewed the integrated marketing boundaries and provided native PostgreSQL lead/routing evidence. Codex integrated shared authority, policy, audit and release controls.
- The full regression snapshot passed 19,912 tests with 3,976 existing optional skips and two failures against files changed during that run. The settled lead and inventory checks subsequently passed 12/12. A later combined audit/OAuth/lead/inventory/compactor run passed 67/67. These selections overlap and must not be added as unique totals.
- Four named disposable PostgreSQL Studio authority/history suites passed 104 tests. Other family receipts establish actual scratch PostgreSQL transactions for reporting, budgets, paid proposals, work/content, email/inbox, leads and banner writes. The final eleven-suite department PostgreSQL gate passed 82/82 tests. No synthetic customer event or live provider action was generated.
- Whole-repository lint and strict Nuxt types have existing failures. The final 296-file lint comparison introduced no new rule/message diagnostics. The final full Nuxt type check reports 949 diagnostics against 951 on the exact current-main baseline, with no new file/code/message diagnostics. Two existing ad-publish diagnostics were removed; baseline failures remain.
- The full production build passed unchanged budgets: raw 25,304,507 / 25,468,928 bytes and gzip 7,282,393 / 9,750,000. Data-only compaction preserves decoded values and executable code. The release command must rebuild the final committed source.
- A matching MCP Worker copy passed Wrangler dry-run. This proves bundling, not hosted OAuth acceptance.

## Release and enrollment gates

Fresh main comparison before integration: `b87589958e6e068f712a8f387693ea073436cf60`. No source commit or deployment ID for this extension is recorded yet.

1. Client/browser recovery checks passed 95 tests across ten files; reviewed gate inventories passed 18 tests. Integrate the reviewed current-main diff.
2. Preserve the existing two staff grant entries and add `department_management`; verify Pages binding capacity. Use only the guarded `pnpm deploy:production` target with Search Authority retained.
3. Deploy Pages, then immediately deploy the matching MCP Worker. Existing stored grants remain usable. New or in-flight OAuth connections may fail during the interval and should be retried after the Worker update; state checks must remain strict.
4. Create and verify the dedicated role, assign both exact identities through owner-authenticated native routes, and add the reviewed marketing board memberships. Confirm notification delivery remains paused before membership changes. Read back canonical role, grants and memberships; inspect unknown outcomes before any retry.
5. Verify the deployed source/target, owner tool preview, QR navigation and read-only application readiness. Staff must connect using their own Claude/ChatGPT accounts for actual host acceptance.

Live preflight confirmed both active identities, Garrix's correct email, 93 active clients, 12 inactive clients and zero email campaigns. The selected 219 marketing boards were refreshed without a difference. These are preflight observations, not proof of enrollment or provider execution.
