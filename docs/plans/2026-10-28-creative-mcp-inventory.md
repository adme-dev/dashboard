# XeroFlow creative MCP inventory — 28 October 2026

Read-only source inspection in `/Users/paulgiurin/orca/workspaces/dashboard/craft-hosted-rollout-20261028`. No deployments, credentials, DB changes, authenticated client calls or production acceptance performed by this investigation.

## Existing connector and authority

- `workers/mcp-server/src/index.ts`: existing thin OAuth + MCP transport, `McpAgent`, Streamable HTTP endpoint `/mcp`, authorize `/authorize`, token `/token`, registration `/register`; forwards only to canonical `APP_BASE_URL` with service secret plus fresh exact-request signed one-time claim. `workers/mcp-server/wrangler.toml`: Worker name `mcp-server`, APP_BASE_URL `https://app.xeroflow.io`, DO `MCP_OBJECT`, OAuth KV. No need for a second external connector or arbitrary server-side URL forwarding.
- `server/api/internal/mcp/{tools,call}.post.ts`: master MCP switch, internal secret and consumed exact-request assertion. Call needs actor userId, tool, logical `mcp:<sha256>` idempotency key. Routes resolve present authority independently from OAuth props. Ordinary call audit records argument keys, not values.
- `server/utils/ai/mcp/staffAuthority.ts`: every ordinary list/call uses uncached `queryOneFresh` / `queryRowsFresh`; current active identity, editable custom/system groups and readonly status, current active client assignments; failure closes. ADMIN/MANAGEMENT -> `all_active`; others -> `assigned`, max100 current client IDs, zero means none. Trusted context has `mcpStaffAuthority:'fresh'`, `source:'mcp'`, `assistantScope` and signed scopes.
- `runtimeConfig.ts`: Cloudflare request binding wins over local env even if malformed/empty. Master `MCP_SERVER_ENABLED`; suite flags `MCP_GEN_TOOLS_ENABLED`, `MCP_WRITE_TOOLS_ENABLED`, `MCP_FINANCIAL_TOOLS_ENABLED`, `MCP_VIDEO_TOOLS_ENABLED`, `MCP_VIDEO_GEN_ENABLED`, `MCP_BANNER_TOOLS_ENABLED`, `MCP_FEED_TOOLS_ENABLED`; `MCP_WORKER_ORIGIN` is UI connector origin. Ordinary writes always require signed `mcp:write`.
- `registry.ts`: sole suite registry; base `catalog` projects the injected `AiTool` registry. New regular `AiTool` appears for eligible management/owner without duplicate MCP transport changes. Supplemental suite must register project+execution once here.
- `marketingPolicy.ts`: non-management users see/call ONLY reviewed names in `MCP_STAFF_TOOL_POLICY`; unknown tools fail at discovery and invocation. Existing creative suites are not admitted ordinary-staff tools. Do not change that blanket gate merely because CREATIVE permission is present.
- `workers/mcp-server/DEPLOYMENT.md` records a historical August5 live OAuth/read proof and versions. It is source documentation, not fresh verification of current deployment. Current runtime flags/tool availability and external Claude/Codex connection remain to verify.

## Existing source capability matrix

### Banner Studio

`mcp/bannerTools.ts`, `bannerRunner.ts`: CREATIVE + banner suite flag. Read tools `list_banner_projects`, `get_banner_render_status`; proposal `propose_banner_render` -> `confirm_action`; owner supplemental mutation `create_banner_project` creates editable MREC draft. Runner calls existing canonical banner HTML/render queue and source-dissection guards.

**Scope limit:** `bannerRunner.ts::defaultLoaders` reads staff-wide latest50 projects, not creator/client scoped; project resolver explicitly leaves ctx unused. Thus existing management/owner ceiling must remain. Do not expose broad runner to newly admitted ordinary staff. New shared project discovery needs its own explicit authorization contract, not UI-filtering after global pagination.

### Video / existing XeroFlow media timeline

`mcp/videoTools.ts`, `videoRunner.ts`: CREATIVE + video suite; generation mutations additionally depend videoGeneration. Reads `list_av_projects`, `list_video_models`, `list_video_generations`, `list_video_source_assets`, `get_video_generation_status`, `get_timeline_context`. Proposals `propose_video_generation`, `create_video_project`, `propose_timeline_edit`, `propose_promote_creative_asset`; reuse existing governance, cost/budget, source approval, provenance and timeline services.

`canUseAvProject`: actor-created projects, or legacy admin/owner AND (for fresh staff) current ADMIN group. `filterUsableAvProjects` filters mediaType `av`. `authorizedProject` checks that gate before data delivery; underlying `getProjectWithCurrentTimeline` is ordinary cached DB query. `list_av_projects` calls all `listProjects()` then filters. This is creator visibility, not fresh client-assignment authorization. Preserve existing behavior; do not assert it already satisfies a new tenant-scoped shared library.

### Sound / audio

`mcp/generationTools.ts`: CREATIVE + generation suite. `generate_voiceover`, `start_music_generation`, `get_generation_status`, plus image model/generation/upscale/compliance operations. `generationRunner.ts` dispatches existing services; no new AI provider integration needed.

`server/utils/audio/assets.ts` is canonical audio-assets/R2 gateway. `getAsset(id)` is unscoped DB getter, `streamUrlFor` emits stable same-origin `/api/agency/audio/assets/<id>/stream`; raw row includes prompt/lyrics/R2 keys/provider errors. Shared discovery must project safe metadata and authorize before exposing an ID/stream link. `audio/projects.ts` is canonical media_projects/media_timelines gateway (audio + av), revision/version/render services; `getProjectFresh` available but `listProjects` unscoped. No dedicated broad audio-library MCP search tool found.

### EDM builder / email

`ai/tools/emailCampaigns.ts`: existing registered `get_email_campaign_performance`, MANAGEMENT; reads sent campaign engagement only, explicitly not draft templates. It currently uses relative `aiInternalFetch` routes and not a direct scoped read adapter.

Canonical builder services: `server/utils/email-marketing/templates.ts` handles `edm_templates`, `listTemplates(clientIds)`, `getTemplate`, create/update/delete. Source is structured Flyhub EmailLayout; HTML rendered via private rendering service on writes. `server/api/email/templates/*` applies auth and email client scope before returning full document. No MCP builder edit/create tool found. Do not advertise existing performance tool as builder control.

`email-marketing/access.ts` allows agency management or ADMIN/MANAGEMENT all templates; others current assigned clients via `getAssignedClientIds` cache. `listTemplates(scope)` accepts `'all'` or UUID[] and applies `client_id=ANY(...)`, but returns full body_source/body_html, all rows and no search cap. For MCP derive scope from fresh ToolContext instead of converting it into a legacy User or reusing cached scope resolver. Add a direct bounded metadata read query/service; defer editing until renderer + revision contract + draft-only mutation registration established. Sending emails is a separate governed publishing boundary.

### Shared creative assets

`ai/tools/creativeAssetsTool.ts`: regular registered `get_creative_assets`, MEDIA_BUYING. Aggregates Banner published assets, ad-platform creative links, governed local/live Monday mappings with provenance, pagination and coverage hints. This is campaign-provenance discovery, not a universal images/audio/video/fonts library.

**Scope limit:** `creativeAssets.ts` defaultDeps.fetch ignores ctx and uses optional requested campaign/client filters over a broad DB/Monday source. `findCreativeAssetById` uses same broad aggregation. It may make bounded live Monday requests. Do not admit it to ordinary staff as the new shared library; arbitrary clientName is not authority. Add fresh scope before provider calls, SQL, aggregation and pagination. Existing management/owner policy prevents ordinary-staff exposure today.

`ai/marketing/creativeReads.ts` demonstrates reusable direct fresh-query pattern: `clientScopeSql(scope,'ms.client_id',values)` before SQL DISTINCT/ORDER/LIMIT. `ai/marketing/readScope.ts` contains trusted scope and permission helpers. `shared creative/versionGraph.ts` already provides provenance/version relationships for media render outputs.

### Six Flow browser apps / Motorstack

Existing hosted shell only has app-tab presence BroadcastChannel, file drop import and private Motorstack API. No live edit command channel currently exposed by hosted Worker. Native source MCP support is not a browser bridge. Parent's separate FigFlow investigation covers bridge details.

Motorstack provider is fixed read-only external adapter scoped by organization key, with private same-origin file URLs. XeroFlow per-client permissions must be evaluated before projecting brand/provider data into external MCP; the shared org key alone is not user/client authorization. Do not return browser-bound file paths to Claude as remotely downloadable resources without an explicit authorized media resource transport.

## Smallest safe implementation path

1. Add a regular read-only CREATIVE `get_creative_workspace_capabilities` tool to the AiTool registry, reporting fixed app/module capabilities plus exact caller-available registered tool names. No data fetch. Avoid claiming live browser connected: static `hostedAvailable` separate from `automationReady` / `connectedSession`.
2. Add new read-only metadata discovery for scoped EDM drafts/templates and audio/video library records, direct bounded fresh DB queries, using already fresh assistantScope and current permission groups. Include source kind, stable ID, clientId, creator, status, updatedAt/revision, supported import/export MIME; omit raw bucket keys, internal URLs, prompts, provider credentials/errors and recipient lists. Null-client assets explicitly actor-private unless current management/ADMIN all authority.
3. Existing Banner/video tool names remain; discovery can link users to existing suites but must not broaden admission. For ordinary staff explicitly review/register new scoped handlers in MCP_STAFF_TOOL_POLICY; keep minimum CREATIVE group and narrow by current client assignment before all queries/pagination.
4. Register shared read handlers once as AiTool for XeroFlow AI and external MCP; no bespoke loopback HTTP fetch, no second MCP server, no copied secret/auth flow. Existing `aiInternalFetch` is owner-only delegation for MCP and unsuitable for ordinary staff search.
5. FigFlow first browser bridge should have actor/project/session binding, exact expected document revision, named allowlisted commands, no arbitrary JS/CLI, bounded result schema and content-free audit. Keep mutable project edits separate from static catalog and read-only shared asset discovery.
6. Follow mutations with existing coordinator/proposal/confirm contracts rather than raw CRUD wrappers; preserve owner immediate execution where canonical policy authorizes. EDM sends and ad publishing must remain separate from draft edits/export.

## Suggested proof before claims

- New tools list/call parity for current groups/flags and non-management admission.
- Zero-assignment, inactive user, narrowed custom-role and revoked assignment denial before queries/provider calls.
- Explicit source namespace IDs; cross-project/tenant reads denied even when ID exists.
- LIMIT+1 with safe truncation, search wildcard escaping and permission scope before pagination.
- Missing runtime bindings fail closed; no ambient fallback for deployed binding presence.
- Browser bridge disconnected/expired/stale-revision behavior tested; exact native command and undo unit prove result.
- Local fixture/provider checks are not hosted acceptance. Fresh safe live OAuth tool read after guarded production release, and actual Claude/Codex client list/call verification, remain separate gates.
