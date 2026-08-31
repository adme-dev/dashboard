# Google Ads MCP Control Plane Runbook

## What XeroFlow Provides

XeroFlow exposes its own governed Google Ads MCP surface and calls the Google Ads
REST API v25 through the OAuth connections already mapped to each client. It does
not install or proxy Google's official MCP server. Google credentials, developer
tokens, and unrestricted GAQL or mutate requests remain server-side.

The control plane currently covers typed QA inventories plus governed Search and
Performance Max operations for budgets, campaigns, ad groups, responsive search
ads, keywords, negative keywords, targeting, audiences, assets and asset groups,
listing groups, conversion actions and goals, and recommendations. Offline
conversion uploads are outside this release because they contain customer event
data rather than campaign configuration.

## Default-Off Feature Flags

All four flags default to `false`:

```dotenv
GOOGLE_ADS_MCP_READ_ENABLED=false
GOOGLE_ADS_MCP_WRITE_ENABLED=false
GOOGLE_ADS_MCP_AUTOMATION_ENABLED=false
GOOGLE_ADS_MCP_DESTRUCTIVE_ENABLED=false
```

- `READ` projects bounded inventory, recommendation, validation, and status tools.
- `WRITE` projects planning and proposal tools.
- `AUTOMATION` permits only policy-approved automatic action classes.
- `DESTRUCTIVE` permits explicit provider-removal tools. Keep it disabled unless
  permanent removal is operationally required.

An authenticated MCP grant must also carry `mcp:read` or `mcp:write`. Google Ads
control requires the tenant's `MEDIA_BUYING` permission. Money, activation,
conversion, and destructive actions retain their elevated role requirements even
when a feature flag is enabled.

## QA and Inspection Tools

Use these bounded tools instead of raw GAQL:

- `google_ads_list_campaigns`
- `google_ads_list_ad_groups`
- `google_ads_list_ads`
- `google_ads_list_keywords`
- `google_ads_list_targeting`
- `google_ads_list_assets`
- `google_ads_list_conversion_actions`
- `google_ads_list_recommendations`
- `google_ads_validate_action_plan`
- `google_ads_get_action_status`

Each inventory accepts typed filters and a maximum result count. Customer and
resource names are checked against the selected tenant, client, connection, and
Google customer before a provider request is made. Cross-customer response rows are
discarded as a provider-boundary failure rather than returned to the caller.

## Mutation Workflow

Mutation tools deliberately create immutable plans; they do not expose raw Google
Ads operations. A normal human-approved change follows this sequence:

1. Call the relevant `google_ads_plan_*` tool with the desired state.
2. Review the normalized diff, risk tier, policy decision, and expiry.
3. Call `propose_google_ads_action` with the plan ID. XeroFlow sends the exact
   provider operations through Google Ads `validateOnly` before saving a proposal.
4. Confirm the pending action through the standard MCP confirmation tool. Rich or
   destructive confirmations require `acknowledged: true`; permanent removal also
   requires a typed reason.
5. XeroFlow atomically claims the plan, checks policy and provider state again,
   validates again, writes once, and performs a typed provider read-back.
6. Poll `google_ads_get_action_status` until it reaches a terminal state.

Terminal success is `verified` or, where explicitly allowed, `partially_verified`.
`provider_rejected`, `verification_failed`, `recovery_required`, and `cancelled`
need operator review. An ambiguous provider timeout is not retried blindly; the
saved request identity and provider state must be reconciled first.

## Safe Archive and Removal Semantics

The default delete behavior is reversible:

- pause a campaign, ad group, ad, or keyword;
- archive it in XeroFlow where an archive operation exists; or
- hide a conversion action when Google supports `HIDDEN`.

Only tools whose names explicitly say `remove` may issue Google's irreversible
provider removal. Destructive execution requires the destructive feature flag,
owner/admin authorization, acknowledgement of the exact resource, and a reason of
10–1000 characters. Provider removal is never eligible for automation.

## Policy-Limited Automation

Automation remains disabled until an enabled, versioned
`google_ads_automation_policies` row matches the tenant, actor, client, connection,
customer, action class, and requested resource. The only automatic classes are:

- protected-term-aware negative-keyword additions;
- deterministic guarded pauses;
- allowlisted recommendation dismissals; and
- asset detachment when the planned safety checks pass.

Policy JSON supplies the allowed scope, protected terms, thresholds, cooldowns,
per-run limits, and maximum daily actions. Quota is claimed atomically in
`google_ads_automation_quota_reservations` using a UTC day. An execution attempt
consumes its reservation even if Google rejects the request, which prevents rapid
failure retries from bypassing the cap. A model can propose a policy change but
cannot edit or activate its own authority.

## Staged Rollout

1. Confirm migrations `338_google_ads_mcp_action_control.sql` and
   `339_google_ads_automation_quota_reservations.sql` are applied.
2. Enable `GOOGLE_ADS_MCP_READ_ENABLED` and run QA inventories against an internal
   test customer. Verify tenant mappings and expected truncation behavior.
3. Enable `GOOGLE_ADS_MCP_WRITE_ENABLED`. Create a paused test campaign structure,
   confirm it, and verify provider read-back and append-only action events.
4. Seed a narrow, versioned automation policy for one test account, then enable
   `GOOGLE_ADS_MCP_AUTOMATION_ENABLED`. Exercise one allowlisted action and confirm
   quota, cooldown, and protected-term behavior.
5. Leave `GOOGLE_ADS_MCP_DESTRUCTIVE_ENABLED=false` for normal operations. If a
   removal test is required, enable it only for the test window and disable it
   immediately afterward.
6. Expand account policies and campaign-family adapters only after their contract
   and provider smoke tests pass.

## Verification Commands

Run from the repository root with the supported Node version:

```bash
pnpm exec vitest run test/config/googleAdsApiVersion.test.ts test/config/googleAdsMcpActionControlMigration.test.ts test/config/googleAdsMcpFlags.test.ts test/server/utils/googleAds*.test.ts test/ai/mcpGoogleAds*.test.ts
pnpm exec eslint server/utils/googleAds server/utils/ai/mcp/googleAdsServer.ts server/utils/ai/mcp/googleAdsTools.ts server/utils/ai/mcp/googleAdsSearchTools.ts
pnpm run typecheck
```

The repository has known pre-existing TypeScript diagnostics. Compare the complete
typecheck output with the baseline and reject any new diagnostic in changed files.

## Provider References

- [Google Ads API release notes](https://developers.google.com/google-ads/api/docs/release-notes)
- [Google Ads API sunset dates](https://developers.google.com/google-ads/api/docs/sunset-dates)
- [REST mutate requests](https://developers.google.com/google-ads/api/rest/common/mutate)
- [Conversion goals overview](https://developers.google.com/google-ads/api/docs/conversions/goals/overview)
