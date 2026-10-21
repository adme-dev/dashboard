# DriveAgent Becky creative-service connector

Decision and source review: 21 October 2026. Connectors first; subscription billing and commercial governance later.

## Product outcome

An authenticated dealer employee asks Becky to prepare campaign graphics or a video. Becky uses the connected XeroFlow creative service, returns the actual job state and preview/editor links, and keeps the result attached to the initiating dealer and employee. Existing DriveAgent campaign/content records remain the workspace. XeroFlow remains an external service; its rendering and generation engines are reused.

Facebook/Meta and Google account connections are separate connectors. A generated creative is not an active ad, a social-content campaign is not a paid-ad campaign, and Meta ad sets differ from Google ad groups. An external website does not prevent CRM intake or these connections.

## Verified source, not live acceptance

Reviewed DriveAgent main `7d2a99bf67c215b02794cba6eb58574e0e3c07d6` and XeroFlow main `e37b94b87d76c043fbfbf2c90f10a5b77c4dab04`. The usual dashboard checkout was on an older release branch; use fetched main, preserve that checkout, and do not restore its older files.

| Capability | Current source evidence | Connector implication |
| --- | --- | --- |
| XeroFlow external MCP transport | `workers/mcp-server/src/index.ts`; OAuth, per-grant session identity, signed one-use exact-request claims and logical idempotency | Extend this transport, preserve request claims and replay behavior |
| Creative image generation | `server/utils/ai/mcp/generationTools.ts` and `generationRunner.ts`; model discovery, image generation/upscale, compliance inspection, assets | Bind supplied client/asset IDs to the verified connection; existing generated-banner schema restricts subject type to non-vehicle |
| Banner projects and renders | `server/utils/ai/mcp/bannerTools.ts`, `bannerRunner.ts` | Existing ordinary list/propose/status tools; direct project creation is currently owner-only. Do not grant owner authority to dealers to expose it |
| Video | `server/utils/ai/mcp/videoTools.ts`, `videoRunner.ts` | Reuse project/model/source discovery, generation proposal/confirmation and job status; preserve existing tenant policies and confirmations |
| Google Ads actions | `server/utils/ai/mcp/googleAdsTools.ts`, `googleAdsServer.ts`, `googleAdsSearchTools.ts` | Existing source supports account/action planning paths. Dealer-specific discovery and actual creation still need connector acceptance |
| Meta ad-set creation | Not proven in this source review | Do not claim available from banner rendering or social posting; separately map the actual API/tool and test it |
| Becky's current external MCP settings | DriveAgent `server/utils/external-copilot-mcp.ts`, `pages/admin/settings/ai-connections.vue` | This is an inbound read-only connection for external copilots. Preserve it; add a distinct outbound service connection |
| Becky's content workflows | DriveAgent `workers/voice-platform-agent/src/tools/platform-social-content.ts` and role registry | Reuse draft, review and follow-up surfaces rather than creating another campaign workflow |

The source has agency-wide banner list/project/status queries. Its optional `ToolContext.clientScope` must narrow all operations before dealer activation. Video owner/admin permissions and model-supplied generation `clientId` likewise do not establish a dealer-bound grant. No production leak is asserted here; this is a requirement before introducing the new dealer-facing connector.

## Connection contract

- One connection maps a DriveAgent dealer to an explicitly authorized XeroFlow client. An NMG group membership never implicitly grants another dealership's projects, brand assets or ad accounts.
- Authenticated server context supplies the dealer and employee. XeroFlow verifies and binds the external client at authorization. Tool arguments, browser state and model suggestions cannot broaden either scope.
- Use the existing OAuth MCP transport. Bind authorization state and PKCE to the initiating employee/dealer; validate provider/issuer/redirect/resource, persist tokens server-side, handle expiry/reconnect/revocation, and never pass DriveAgent session tokens to XeroFlow. See the [MCP authorization specification](https://modelcontextprotocol.io/specification/2026-07-28/basic/authorization).
- Extend signed grant/session/request claims to carry the approved client binding. A creative connector without that binding must fail closed. Preserve ordinary agency staff sessions separately; absence of a client scope in a new creative connector is not permission for agency-wide discovery.
- Discover only an allowlisted creative tool subset intersected with live provider availability, employee permissions and the connection grant. Do not import owner bypass, finance, arbitrary MCP tools or live ad-budget control into Becky.
- Every submitted request keeps dealer, actor, connection, intent, stable idempotency key and external job/result references. Retrying a timeout must first reconcile its outcome; never automatically create another paid render.
- Return `not_connected`, `needs_reconnect`, `unavailable`, `awaiting_confirmation`, `queued`, `running`, `succeeded`, `failed` or `outcome_unknown` accurately. Only a verified result supplies a preview/download link. An agency-only download route is not automatically usable by a dealer; use an authenticated, client-scoped asset delivery path rather than exposing storage keys or assuming a browser session. Maintain existing provider caps; do not introduce subscription prices, plan entitlements or charging.
- Reuse existing DriveAgent employee tool/visual-confirmation paths and automation permissions. Public customer chat does not acquire employee creative tools. Jobs continue independently of an open chat window; status updates must be bounded and resumable.

## Ordered implementation tasks

1. **Provider client boundaries — in progress.** Apply server-resolved client scope to banner discovery, project resolution, project creation, job lookup and confirmation-time layer reads. Preserve unscoped agency workflows. Add real SQL regressions for two dealers, null-client assets, owner-role narrowing, guessed IDs/names and invalid scope. The first local implementation now passes 78 tests across eight focused suites (28 client-scope cases; initial 22 failures and 6 passes). This is provider-side preparation only. Then apply equivalent boundaries to video and image-generation sources/results.
2. **Client-bound authorization.** Extend the existing XeroFlow grant, signed assertion, session props and one-use request claim; validate allowed client selection from current authority. Test altered client claims, expired/revoked grants, stale employee access and a scope disappearing between proposal and confirmation. Bind stored proposals and replayed results to the same client and grant: existing executeWriteConfirm/proposalReplay may return a stored result without entering dispatchBannerConfirm. Test a changed client after proposal execution as well as before first execution. Reuse the client-and-actor narrowing already demonstrated by `server/utils/ai/portalConfirm.ts` where suitable; do not replace completed portal or agency confirmation paths. No new owner-level grant.
3. **DriveAgent connection lifecycle.** Add outbound creative service connect/status/disconnect endpoints and a settings card beside (not replacing) current inbound copilot connections. Store encrypted token material through existing server-side credential facilities; return only safe connection metadata. Test dealer switch during OAuth, refresh rotation, revocation, denied selection and cross-dealer reads.
4. **Becky tool adapter.** Register permitted creative discovery/proposal/status/result tools in existing employee roles/catalogue/dispatch. Recheck connection and employee permissions for each invocation. Attach actual generated assets to existing draft/content records and preserve generation idempotency. Image generation, video generation and banner rendering stay distinct operations.
5. **Meta and Google handoff.** Reuse native dealer account connectors. Resolve the chosen account and asset for the same dealer. Expose supported draft campaign/ad-set/ad-group creation only after its real tool/API is mapped and tested; publishing and live spend remain explicit actions with existing confirmations.
6. **Hosted pilot.** Two synthetic NMG dealers, a salesperson/marketing employee and manager. Prove permitted creation → real job receipt → preview → existing draft, reconnect/revocation, retries, permission downgrade and denied foreign assets. Use an approved synthetic render; no live ad launch or real customer communication as a test. Record exact app/worker deployment and provider receipts independently.

## Deferred commercial phase

Subscription tiers, usage credits, per-plan limits, reseller pricing, charging/reconciliation, subscription lifecycle and new commercial approval policies. Existing authentication, dealer isolation, employee permissions, provider budget limits, audit and confirmation behavior remain required in the connector phase.

## Evidence ledger

At creation of this plan: source discovery completed; client-bound connector, dealer OAuth, Becky execution, hosted render acceptance and production activation are not complete. The first implementation increment addresses banner client isolation only. Add exact tests/commits/deployments as each increment completes; do not label the entire connector live from local runner tests.


### First increment verification and preservation

- Code: `server/utils/ai/creativeClientScope.ts`, `server/utils/ai/mcp/bannerRunner.ts`, `server/utils/audio/bannerOverlay.ts`.
- Real PGlite fixture tests execute the actual list, resolution, status, draft INSERT and layer SELECT queries. They cover foreign and null-client projects, filtering before caps, role-independent narrowing, invalid supplied scope and preserved unscoped agency workflows.
- PGlite 0.5.4 is a development-only test dependency; the lockfile also resolves existing optional peers against it. No provider API calls, migrations, environment flags, customer communications, billing changes or ad activation occur in this increment.
- The connector is not activated. `clientScope` must be supplied by verified server authority. A future dealer connector must never treat a missing binding as an unscoped agency session.
- Existing draft rendering, agency list limits, one-use MCP request claims, generation confirmations, dispatch markers and stable logical idempotency remain intact. No removed features.

- Independent review approved the scoped banner increment. New helper and test pass ESLint; the two existing source files retain the same 36 pre-existing lint findings as main (rule/count comparison recorded locally). Full typecheck and hosted acceptance are recorded separately.
