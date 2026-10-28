# Marketing management MCP configuration

Task 3 source configuration, 28 October 2026. This runbook describes the source configuration contract and the proposed production values; it is not evidence of deployment, staff enrollment, provider readiness or customer-event delivery. Root owns final activation after integrated review.

## Resolution contract

`server/utils/ai/mcp/runtimeConfig.ts` is shared by MCP discovery (`tools/list`), connector preview (`my-tools`) and execution (`tools/call`). `MCP_SUITE_CONFIG` is optional JSON text containing a partial object of the exact suite field names below, with JSON boolean values. Missing fields default to false. It does not introduce another suite namespace or change `McpSuiteFlags`.

For each suite field:

1. Resolve its individual legacy variable: an own property on `event.context.cloudflare.env` wins; only an absent property falls back to `process.env`.
2. If that legacy variable is present in either source, only the exact string `true` enables it. `false`, empty text, malformed text, boolean values, null and present undefined disable it. Do not use an empty legacy variable to mean absent.
3. Only if the legacy variable is absent from both sources, use the corresponding field in `MCP_SUITE_CONFIG`. The compact variable itself follows request-binding-first, process-second precedence. A present request compact value never falls back to process compact JSON, including when empty, malformed, null or undefined.
4. Invalid JSON, a non-object/array value, any unknown field or any non-boolean field rejects the entire compact source. Independent valid legacy flags still work. Exact case matters; aliases, master-switch keys and prototype names are invalid.

A process legacy override therefore also takes precedence over a request compact field. A request legacy override takes precedence over both. The compact source cannot enable the independent `MCP_SERVER_ENABLED` master switch, change `MCP_WORKER_ORIGIN`, change the write-scope setting or grant staff permissions.

## Proposed production values

The following table is the effective suite configuration from `[env.production.vars]` with no additional legacy overrides in the request or process environment:

| Field | Legacy variable | Before | Proposed |
| --- | --- | --- | --- |
| `generation` | `MCP_GEN_TOOLS_ENABLED` | true | true |
| `writes` | `MCP_WRITE_TOOLS_ENABLED` | false | true |
| `financial` | `MCP_FINANCIAL_TOOLS_ENABLED` | false | false |
| `video` | `MCP_VIDEO_TOOLS_ENABLED` | true | true |
| `videoGeneration` | `MCP_VIDEO_GEN_ENABLED` | false | false |
| `banners` | `MCP_BANNER_TOOLS_ENABLED` | true | true |
| `feeds` | `MCP_FEED_TOOLS_ENABLED` | false | true |
| `googleAdsRead` | `GOOGLE_ADS_MCP_READ_ENABLED` | false | true |
| `googleAdsWrite` | `GOOGLE_ADS_MCP_WRITE_ENABLED` | false | true |
| `googleAdsAutomation` | `GOOGLE_ADS_MCP_AUTOMATION_ENABLED` | false | false |
| `googleAdsDestructive` | `GOOGLE_ADS_MCP_DESTRUCTIVE_ENABLED` | false | false |

```toml
MCP_SUITE_CONFIG = '{"generation":true,"writes":true,"financial":false,"video":true,"videoGeneration":false,"banners":true,"feeds":true,"googleAdsRead":true,"googleAdsWrite":true,"googleAdsAutomation":false,"googleAdsDestructive":false}'
```

`MCP_SERVER_ENABLED = "true"` and `MCP_WORKER_ORIGIN = "https://mcp-server.adme-dev.workers.dev"` remain unchanged in production. Without additional overrides, `legacyRequireWriteScope` remains false; ordinary staff still require signed `mcp:write` consent for write tools regardless of that legacy setting. Existing fresh role/grant checks, resource scope, independent review and execution safeguards remain required. Suite activation alone is not authorization or provider readiness.

Only `[env.production.vars]` changes. The root `[vars]` block remains unchanged. The complete preview environment remains unchanged, with `MCP_SERVER_ENABLED = "false"`, an empty worker origin and no compact activation binding.

## Capacity and activation handoff

The source change removes `MCP_GEN_TOOLS_ENABLED`, `MCP_VIDEO_TOOLS_ENABLED` and `MCP_BANNER_TOOLS_ENABLED` from production and adds one `MCP_SUITE_CONFIG` variable. The suite compaction alone decreases production plaintext variables from **43 to 41**, saving **two binding slots**. The reviewed provider switches below add one compact binding, for **42 final production plaintext variables** (one net slot saved versus baseline). MCP-prefixed production plaintext variables decrease from five to three. These are parsed repository counts, not the live Pages total; secrets and resource bindings were not inventoried or changed. Root must freshly check total deployed capacity and any surviving legacy overrides before activation.

Before root releases:

1. Integrate and independently review the supported marketing scope, permission/grant enrollment and configuration tests on current main.
2. Inspect the effective target production bindings without logging secrets. Check for old individual suite overrides, including secret-backed legacy variables, that would supersede compact JSON. Confirm the exact effective table above or record any intentional difference.
3. Keep preview disabled. Run the repository deployment checks and only its guarded production deployment command targeting `agency-dashboard`.
4. Record source/main commits and deployment identity, then verify discovery, preview and safe read-only calls with genuine authorized identities. Keep provider validation, transport receipt and provider reporting separate from configuration evidence. Do not manufacture customer events or provider writes for acceptance.

To withdraw new suite activation while retaining the two-slot saving, set `writes`, `feeds`, `googleAdsRead` and `googleAdsWrite` to false inside the compact JSON; keep generation/video/banners true and all other fields false. A present individual legacy true override must also be accounted for. For complete MCP exposure shutdown use the existing master switch. Restoring the original three legacy variables and removing compact JSON costs two slots and requires a fresh capacity check.

## Local verification

```sh
pnpm exec vitest run test/ai/mcpRuntimeConfig.test.ts test/server/api/mcpStaffCatalog.test.ts test/config/marketingManagementMcpConfig.test.ts test/config/googleAdsMcpFlags.test.ts test/ai/mcpCapabilitiesProjection.test.ts test/server/api/internalMcpAuthorityEndpoints.test.ts
```

These fixtures exercise strict compact parsing, every known field, present-invalid/false legacy precedence, request/process fallback, master-switch independence, production/preview configuration, and discovery/preview/call parity through the existing mocked storage/tool fixture. They do not establish hosted or provider acceptance.

## Reviewed provider execution switches

`server/utils/marketingProviderConfig.ts` reads `MARKETING_PROVIDER_CONFIG` from the caller’s request-first merged runtime environment. Its only keys are boolean `pmaxProviderWrites`, `pmaxActivation`, `metaAdPublish` and `emailSending`. Missing settings are disabled. An invalid object, unknown key or non-boolean value rejects the complete compact source. The existing individual `GOOGLE_PMAX_PROVIDER_WRITES_ENABLED`, `GOOGLE_PMAX_ACTIVATION_ENABLED`, `META_AD_PUBLISH_ENABLED` and `EMAIL_SENDING_ENABLED` values override their compact counterpart whenever present; only the exact string `true` enables a legacy switch. PMax activation additionally requires provider writes.

The proposed production binding enables these four workflows in one slot. Preview has no activation binding. These switches grant no staff role, client, consent or review authority; provider credentials, account mapping, exact approved revision and durable execution receipt remain mandatory. Meta creation remains PAUSED. PMax activation retains its separate independent activation approval.

```toml
MARKETING_PROVIDER_CONFIG = '{"pmaxProviderWrites":true,"pmaxActivation":true,"metaAdPublish":true,"emailSending":true}'
```

Read-only Wrangler secret-name inventory on 28 October found 103 encrypted bindings and no legacy suite/provider overrides. Together with 42 source variables and the previously measured four generated variables, the candidate estimate is **149/150 text bindings**. This is configuration capacity evidence, not deployment or provider acceptance. Final release must recheck generated bindings and current production state; no secret value was logged or changed during the inventory.

To disable these provider paths while preserving capacity, set their compact values to false, or set the corresponding explicit legacy kill switch to `false` if a slot is available. Never remove an explicit false legacy value assuming compact true will remain disabled.

Email sending uses the compact `emailSending` switch with explicit `EMAIL_SENDING_ENABLED` legacy precedence. A Resend key, allowed verified sender domain, consent/suppression checks and the reviewed MCP recipient freeze remain required. This does not activate a campaign-dispatch cron or send any existing campaign. Browser manual sends retain their explicit human action semantics; MCP audience sends and replies require independent review.
