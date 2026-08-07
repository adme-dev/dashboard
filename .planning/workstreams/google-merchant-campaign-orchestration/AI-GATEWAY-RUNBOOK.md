# Campaign Jobs AI Gateway Production Gate

**Status:** Gate defined; external configuration and model evaluation not yet approved
**Scope:** Google campaign-job proposals only
**Control plane:** Cloudflare Pages/Workers AI binding and Cloudflare AI Gateway
**Default:** Disabled and fail closed

## Production architecture

Campaign-job inference must execute through the existing Cloudflare `AI` binding. In a
Pages/Nitro request, the transport obtains `event.context.cloudflare.env.AI` and calls
the selected dynamic route through `AI.gateway(gatewayId).run(...)` using the `compat`
provider and `chat/completions` endpoint. The model value is
`dynamic/<approved-route-name>`.

This binding-first path is mandatory because Cloudflare pre-authenticates binding
requests. The application must not carry an AI Gateway API token, and it must never
fall back to `CF_API_TOKEN`, `CLOUDFLARE_API_TOKEN`, a provider SDK or a provider-native
endpoint. Cloudflare documents AI Gateway Run tokens as account-scoped rather than
gateway-scoped; using one in Pages would grant avoidable access to every gateway in the
account.

Local tests inject a fake binding. Production or preview execution without the `AI`
binding returns a typed `gateway_unavailable` result and leaves the deterministic
proposal incomplete.

## Environment isolation

Use separate gateways so preview traffic, logs, spend rules and route changes cannot
pollute production operations:

| Environment | Environment-scoped bindings | Required route names |
|---|---|---|
| Preview | `CAMPAIGN_AI_DEPLOY_ENV=preview`; `CAMPAIGN_AI_GATEWAY_ID` -> preview gateway | `campaign-job-extract`, `campaign-job-standard`, `campaign-job-complex` |
| Production | `CAMPAIGN_AI_DEPLOY_ENV=production`; `CAMPAIGN_AI_GATEWAY_ID` -> production gateway | Same names, independently deployed versions |

The gateway ID and deployed route-version identifiers are non-secret configuration.
BYOK provider credentials remain in Cloudflare Secrets Store. The production gateway
must never reuse the shared `default` gateway.

This repository uses Nitro `cloudflare.deployConfig = true`, so the generated Wrangler
configuration is the Pages configuration source of truth and its common plaintext
`[vars]` replace dashboard plaintext variables. Store the same binding names separately
for the Pages Preview and Production environments as encrypted values:

- `CAMPAIGN_AI_DEPLOY_ENV`;
- `CAMPAIGN_AI_GATEWAY_ID`;
- `CAMPAIGN_AI_ROUTE_RELEASE`;
- `GOOGLE_CAMPAIGN_JOB_AI_ENABLED`;
- `CAMPAIGN_AI_METADATA_HMAC_KEY`.

The gateway ID, route release and feature flag are not inherently confidential; they
are encrypted here to preserve environment-specific values across this repository's
Direct Upload/deploy-config flow. Do not add them to common `[vars]`, and do not infer a
runtime environment from `CF_PAGES_BRANCH`: Cloudflare documents that variable for the
Pages build environment. The runtime must accept only `preview` or `production`, reject
missing/mismatched configuration, and keep the production flag `false` until promotion.
A post-deploy, secret-name-only check must confirm all five bindings in each Pages
environment without reading their values.

`CAMPAIGN_AI_ROUTE_RELEASE` records the reviewed route-manifest checksum/release in
XeroFlow audit data. The deployed dynamic route remains the sole model-routing
authority. Generic XeroFlow model-assignment overrides may display the actual model but
must not bypass or replace the route for this feature.

Route JSON is version-controlled after removing generated timestamps and any provider
credential identifiers that are not safe to commit. Promotion is preview route version
to production route version, not a live edit to the production graph.

## Provider and model policy

| Route | Initial candidate | Purpose | Runtime fallback |
|---|---|---|---|
| `campaign-job-extract` | Workers AI `@cf/meta/llama-3.1-8b-instruct-fast` | Bounded extraction or short classification requiring JSON mode | Deterministic unknown/manual input |
| `campaign-job-standard` | Groq `openai/gpt-oss-20b` through Gateway BYOK | Normal structured campaign-job proposal | Same-model schema repair once, then incomplete/manual review |
| `campaign-job-complex` | Groq `openai/gpt-oss-120b` through Gateway BYOK | Explicitly qualified complex proposal | Incomplete/manual review |

`@cf/qwen/qwen3-30b-a3b-fp8` is a required Cloudflare-native bake-off challenger for
the standard route. It is not the initial structured-output default because JSON schema
adherence must be proven on the project reference set.

No route may expose tools. Job/task creation remains a separate confirmed deterministic
operation. The model receives bounded evidence and returns one Zod-validated proposal.
Invalid output may receive one same-model repair request; it must not trigger an
automatic 120B upgrade.

## Initial cost envelope

These are safe pilot defaults and require owner confirmation before route promotion:

- maximum input: 16,000 tokens;
- maximum output: 2,000 tokens;
- maximum calls per proposal: two, including the optional schema repair;
- application-side estimated ceiling: USD $0.01 per proposal;
- tenant spend rule: USD $1 per rolling day;
- production pilot gateway spend rule: USD $25 per rolling month;
- tenant rate rule: 10 requests per five minutes;
- gateway rate rule: 60 requests per minute.

At August 2026 Groq list rates, one fully capped 20B call is approximately $0.0018 and
one capped 120B call is approximately $0.0036. Two capped 120B calls remain below the
$0.01 proposal ceiling. Refresh both prices and arithmetic in AIG-302. The existing
`server/utils/ai/invocationLedger.ts` still uses an older GPT-OSS 20B price, so route
promotion also requires updating its price table and passing cost-estimation tests.

BYOK is the initial third-party billing choice because current dynamic-route guidance
requires stored upstream keys and it avoids Unified Billing's current 5% credit fee.
Groq bills the model usage directly; Workers AI remains billed at Workers AI rates.
This choice may change only through a reviewed route/data-handling decision.

Gateway spend limits are defense in depth, not the only hard control: Cloudflare notes
they are eventually consistent and bursts can temporarily exceed a limit. The app must
enforce call count, context length and output tokens before inference. A `429`, timeout
or exhausted budget produces a retryable incomplete state; the route must not silently
select a more expensive model.

## Privacy and data handling

Every campaign request must set:

- payload logging disabled with `cf-aig-collect-log-payload: false`;
- cache bypass with `cf-aig-skip-cache: true`;
- bounded timeout and at most one Gateway retry;
- exactly five or fewer flat non-PII metadata values.

Approved metadata keys are:

1. `feature` — fixed value `campaign_job`;
2. `tenant_ref` — environment-specific HMAC pseudonym, never a database ID or name;
3. `environment` — `preview` or `production`;
4. `proposal_type` — allowlisted enum;
5. `request_ref` — random correlation value with no user/client encoding.

Generate `tenant_ref` with a dedicated `CAMPAIGN_AI_METADATA_HMAC_KEY` secret that is
different in preview and production. Do not reuse JWT/session/OAuth encryption keys.
Rotate it through a controlled metadata-correlation change; historical Gateway logs do
not need to remain linkable across rotations.

Metadata-only logging prevents Cloudflare AI Gateway from storing the prompt and
completion, but it does not change the upstream provider's retention terms. Dynamic
routes currently require provider credentials stored with BYOK. Cloudflare Zero Data
Retention applies only to supported Unified Billing providers, not BYOK, and Groq is
not currently listed as a ZDR provider. Security/privacy ownership must therefore
approve Groq's current retention/DPA terms before production. If zero retention becomes
mandatory, the model/provider decision must be reopened rather than claiming the
Gateway log setting solves upstream retention.

Enable DLP in flag-only mode during preview. Promote blocking rules only after the
reference set proves budgets, campaign identifiers and normal automotive content do not
cause unacceptable false positives. DLP findings must not persist raw prompt text in
XeroFlow audit records.

## Production promotion gate

All boxes must be complete before `GOOGLE_CAMPAIGN_JOB_AI_ENABLED=true` is permitted in
production:

- [ ] Phase 0 and Phase 2 dependencies are complete.
- [ ] Security owner accepts BYOK provider retention/DPA terms or approves a different
      provider architecture.
- [ ] Preview and production gateways exist separately and authentication is enabled.
- [ ] Preview and production each expose the five same-named encrypted bindings; the
      runtime rejects an absent/invalid `CAMPAIGN_AI_DEPLOY_ENV`, and no campaign
      environment selector is committed to common `[vars]` or inferred from
      `CF_PAGES_BRANCH` at runtime.
- [ ] Groq BYOK key is stored in Cloudflare Secrets Store and absent from campaign-job
      application runtime configuration.
- [ ] Dynamic-route JSON and deployed versions are recorded and reviewed.
- [ ] `CAMPAIGN_AI_ROUTE_RELEASE` matches the reviewed route manifest and the feature is
      not editable through a raw-model assignment override.
- [ ] AIG-302 quality/cost bake-off passes with exact route/model versions.
- [ ] Binding-only transport tests prove no token/provider-native fallback.
- [ ] Prompt injection, schema failure, timeout, 401/403, 429, DLP, spend-limit and
      binding-missing cases fail safely.
- [ ] Gateway logs show metadata and cost but no request/response payload.
- [ ] XeroFlow invocation ledger reconciles provider/model, tokens, cost and latency.
- [ ] Invocation-ledger/model-catalog pricing matches the approved dated price evidence,
      including GPT-OSS 20B; capped-cost tests reconcile with the Gateway dashboard.
- [ ] Actual provider/model response metadata is captured; no configured model value is
      falsely recorded as the executed model.
- [ ] Per-proposal, tenant and gateway limits are visible and exercised in preview.
- [ ] Feature flag is false in production before deployment and enabled only for the
      approved staff/tenant allowlist after sign-off.
- [ ] Rollback drill succeeds.
- [ ] Graphify Wiki/graph is refreshed or queried after the final rebase; cited source
      is checked directly and every staleness warning is recorded.

## Rollback

1. Set the Production environment's encrypted
   `GOOGLE_CAMPAIGN_JOB_AI_ENABLED=false` binding and redeploy through the guarded Pages
   production command.
2. Undeploy or roll back the production dynamic-route version.
3. Revoke/rotate the Gateway BYOK key if credential exposure is suspected.
4. Preserve metadata-only invocation records and incomplete proposals for diagnosis.
5. Do not switch to the shared gateway, a broad Cloudflare token or direct Groq.

Rollback affects AI assistance only. Deterministic campaign readiness, manual job
creation and all Google provider write gates remain independently available.

## Official references

- Cloudflare dynamic-route binding usage:
  <https://developers.cloudflare.com/ai-gateway/features/dynamic-routing/usage/>
- Pages Wrangler configuration, environment overrides and source-of-truth behavior:
  <https://developers.cloudflare.com/pages/functions/wrangler-configuration/>
- Pages build-only system variables:
  <https://developers.cloudflare.com/pages/configuration/build-configuration/>
- Authenticated Gateway and account-scoped token warning:
  <https://developers.cloudflare.com/ai-gateway/configuration/authentication/>
- BYOK and Secrets Store:
  <https://developers.cloudflare.com/ai-gateway/configuration/bring-your-own-keys/>
- Spend-limit behavior:
  <https://developers.cloudflare.com/ai-gateway/features/spend-limits/>
- Logging controls:
  <https://developers.cloudflare.com/ai-gateway/observability/logging/>
- Unified Billing and ZDR limits:
  <https://developers.cloudflare.com/ai-gateway/features/unified-billing/>
- Workers AI Qwen3 30B model:
  <https://developers.cloudflare.com/workers-ai/models/qwen3-30b-a3b-fp8/>
- Groq pricing: <https://groq.com/pricing>
