# PRD: Google Merchant and Campaign Orchestration

**Workstream:** `google-merchant-campaign-orchestration`
**Date:** 2026-08-07
**Status:** Approved to plan; implementation gated by Phase 0
**Product:** XeroFlow Agency Dashboard
**Owners:** Platform engineering, media operations, product owner
**Infrastructure:** Cloudflare Pages, Workers and Queues with Neon Postgres and R2
**Related programs:** Google PMax launch orchestration; Google Ads AI Max readiness

## Executive summary

XeroFlow should provide one governed path from an agency brief to a complete Google
campaign job, Merchant Center readiness decision, paused Google Ads campaign and
verified activation. The platform's AI assistant will help staff complete templates,
identify missing inputs and create internal jobs and tasks. It will not be published
to Google and it will not receive authority to make unreviewed provider changes.

The integration has three distinct responsibilities:

1. **XeroFlow orchestration** owns briefs, recommendations, jobs, approvals, audit
   history and rollout state.
2. **Merchant API** owns Merchant Center accounts, data sources, products, inventory,
   issues and account linking initiated from Merchant Center.
3. **Google Ads API** owns budgets, campaigns, assets, asset groups, listing filters,
   conversion goals, provider validation, paused creation and activation.

The first production release is read-only on the Merchant side. It replaces the
legacy Content API inventory audit, produces an evidence-backed commerce-readiness
gate and feeds that evidence into the existing PMax launch plan. Provider writes are
introduced only after read-only observations have been validated against live direct
and manager-linked accounts.

## Why now

- The current inventory audit uses the legacy Content API for Shopping v2.1.
- The Merchant API is Google's successor and the required foundation for current
  Merchant Center account, data-source, product and issue management.
- XeroFlow has Google Ads reads, spend synchronization and limited budget mutations,
  but pushed `main` does not yet provide a complete Merchant-backed campaign launch.
- A separate PMax implementation session is building the campaign launch foundation.
  This workstream must adopt that foundation after merge rather than duplicate it.
- Google Ads AI Max readiness Release 1 is implemented but still has live-account and
  production validation gates. It is adjacent but not a Merchant/PMax substitute.

## Product outcome

An authorized media buyer can select a client and Google account, start from an
approved template, receive deterministic and AI-assisted completion guidance, resolve
Merchant and measurement blockers, request approval, create a campaign paused, verify
the provider state and request a separate activation approval. Every conclusion and
provider operation remains attributable, reproducible and reversible where the
provider permits it.

## Goals

### Release 1: account and catalogue readiness

1. Verify the production Google Cloud project, OAuth client and Ads developer-token
   ownership before enabling new services.
2. Register the correct agency-level Merchant Center topology without binding the
   Cloud project accidentally to one dealer account.
3. Read Merchant accounts, services, data sources, product status and account issues.
4. Replace the legacy Content API inventory-feed audit with Merchant API reads.
5. Persist tenant-isolated observations, scan history, freshness and failures.
6. Produce one blocking/warning readiness result consumable by UI and launch preflight.
7. Keep every Merchant and campaign operation read-only.

### Release 2: AI-assisted job and campaign planning

1. Turn a selected Google campaign template and brief into a structured proposal.
2. Ask only for missing or conflicting information.
3. Generate XeroFlow jobs and task checklists with owners, dependencies and due dates.
4. Attach Merchant, measurement, asset and budget readiness evidence.
5. Require a human to confirm the normalized configuration before launch approval.

### Release 3: paused campaign creation

1. Reuse the merged PMax launch state machine, budget contract and approval records.
2. Bind approval to an immutable configuration hash.
3. Create Google Ads resources idempotently in `PAUSED` state.
4. Read material provider settings back and compare them field by field.
5. Require a separate activation approval.
6. Link the created campaign to spend, pacing, conversion and feed-health monitoring.

### Release 4: controlled Merchant writes

1. Add narrowly scoped, explicitly approved data-source or product operations.
2. Preview before/after state and validate policy-sensitive fields.
3. Reconcile every accepted request with a provider read-back.
4. Keep autonomous catalogue rewriting out of scope until a later policy is approved.

## Non-goals

- Publishing an AI agent to Google.
- Using Merchant API to create Google Ads campaigns.
- Replacing Google Ads or Merchant Center as the detailed provider console.
- Auto-enabling a newly created campaign.
- Allowing an LLM to call provider mutations directly.
- Automatically inventing claims, prices, incentives, legal text or conversion goals.
- Automatically overriding product or policy disapprovals.
- Registering the production Cloud project to an arbitrary client Merchant account.
- Building new functionality on the legacy Content API for Shopping.
- Moving XeroFlow orchestration from Cloudflare to Google Cloud.
- Enabling Vertex AI, Cloud Run, Cloud Functions, Scheduler, Pub/Sub or BigQuery solely
  for this rollout.
- Adding Meta or Microsoft campaign publishing in this workstream.

## Users and jobs to be done

### Account manager

- Start a campaign job from a governed template.
- See missing client inputs in plain language.
- Coordinate approvals without needing provider-level edit permissions.

### Media buyer

- Select the intended Ads and Merchant accounts.
- Inspect feed, product, conversion, asset, landing-page and budget blockers.
- Resolve issues and request launch approval.

### Owner or administrator

- Approve an immutable launch configuration.
- Arm a controlled provider write.
- Separately approve activation after read-back verification.
- Stop Merchant or Ads writes using independent kill switches.

### Platform operator

- Observe scan coverage, failures, quotas, freshness and provider drift.
- Re-run idempotent operations safely.
- Diagnose without exposing tokens or customer-sensitive payloads.

## Current-state baseline

### Available on pushed `main`

- Google OAuth requests `adwords` and `content` scopes.
- Google Ads API account reads, spend sync and verified daily-budget mutation patterns.
- Internal AI tool/executor infrastructure and task creation.
- Legacy Merchant Center data-feed audit through
  `shoppingcontent.googleapis.com/content/v2.1`.
- Inventory-feed and listing-filter audit helpers.
- Google AI Max readiness Release 1 implementation, with production validation pending.
- Cloudflare Pages/Nitro APIs, consolidated scheduled Worker patterns and Neon storage.

### Not yet a production capability

- Merchant API calls to `merchantapi.googleapis.com`.
- Merchant developer registration and multi-client account-topology evidence.
- Product or data-source writes through Merchant API.
- End-to-end PMax creation on pushed `main`.
- Direct HTML5 MediaBundle and AdGroupAd publishing; the current endpoint records an
  intent but leaves provider upload unimplemented.
- Autonomous campaign or catalogue changes.

### External dependency

The concurrent PMax session owns migrations 273-282 and the draft launch foundation,
including budget, configuration hash, state and persistence utilities. Phase 0 must
wait for that session to finish, then rebase this branch and perform a contract
reconciliation. No overlapping PMax schema or state machine may be created here.

## API and service boundary

| Service | Cloud service name | Rollout status | Responsibility |
|---|---|---|---|
| Merchant API | `merchantapi.googleapis.com` | Required | Merchant accounts, services, data sources, products, inventory, issues and Merchant-initiated linking |
| Google Ads API | `googleads.googleapis.com` | Required | Ads account discovery, PMax budgets/campaigns/assets/listing filters, validation, paused creation, read-back and activation |
| Data Manager API | `datamanager.googleapis.com` | Conditional; existing capability | First-party conversion and audience ingestion when measurement delivery is included |
| YouTube Data API v3 | `youtube.googleapis.com` | Optional later | Upload generated campaign video to an authorized YouTube channel |
| Content API for Shopping | legacy service | Temporary compatibility only | Existing read audit until Merchant API migration is proven |

OAuth itself is not an additional business API. The Google Auth Platform consent
screen, OAuth clients, redirect URIs, verified domains and scope verification are
configuration prerequisites.

## Critical Google project constraint

Google currently permits a Cloud project to be registered with only one Merchant
Center account at a time. A third-party platform managing multiple merchants must use
the correct parent/advanced-account structure and must not register separately for
each subaccount.

Therefore:

- `gen-lang-client-0818792107` is the confirmed production OAuth project, but its reuse
  for Merchant registration remains provisional pending security and domain approval.
- Its project ID/number, OAuth client IDs, Ads developer token and current enabled
  services must be inventoried without exposing secrets.
- The agency's controlling Merchant account and subaccount structure must be confirmed.
- The verified website and developer contact must be agency-controlled.
- Registration is blocked until a media/platform owner signs off the topology.

## Target architecture

```text
Campaign template / approved brief
              |
              v
XeroFlow deterministic normalizer + AI completion assistant
              |
              v
Authenticated Cloudflare AI Gateway dynamic route
              |
              +--> XeroFlow job/tasks and missing-input workflow
              |
              v
Read-only readiness orchestrator
   | Merchant API | Google Ads API | Data Manager evidence | asset checks
              |
          blocked / ready
              |
              v
Immutable launch plan + human approval
              |
              v
Cloudflare Queue launch command
              |
              v
Google Ads API creates campaign PAUSED
              |
              v
Provider read-back and field-level comparison
              |
              v
Separate activation approval -> enable -> monitoring
```

### Cloudflare deployment responsibilities

- **Pages/Nitro:** authenticated APIs, readiness UI and user-triggered commands.
- **Queues:** bounded Merchant scans and provider mutations with retry/claim controls.
- **Scheduled Worker:** freshness scans, reconciliation and drift checks.
- **Neon:** tenant-scoped observations, jobs, approvals, provider resource mappings,
  events and idempotency claims.
- **R2:** generated asset bundles and evidence exports where required.
- **Cloudflare AI Gateway:** mandatory, authenticated inference entry point with
  versioned dynamic routes, cost/rate limits, metadata-only logs and no direct-provider
  bypass.
- **Workers AI/Groq:** model execution only after deterministic evidence is assembled;
  never the authority for provider writes.

### AI Gateway and model policy

AI is a bounded proposal service, not a control plane. Validation, readiness,
authorization, idempotency and provider mutations remain deterministic. All campaign-
job inference must traverse an authenticated Cloudflare AI Gateway route through the
existing `env.AI` binding; an outage or budget limit degrades to deterministic
templates or a retryable operator state rather
than calling Groq or another provider directly.

| Work class | Default | Escalation | Rationale |
|---|---|---|---|
| Validation, readiness and missing required fields | No model | None | Rules are cheaper, reproducible and authoritative |
| Bounded extraction/classification or short explanation | Workers AI candidate selected by evaluation; start with `@cf/meta/llama-3.1-8b-instruct-fast` where JSON mode is required | Deterministic unknown/manual input | Keep routine work on Cloudflare; schema validation is mandatory |
| Campaign-job proposal and template completion | Groq `openai/gpt-oss-20b` | GPT-OSS 120B only after an explicit complexity/evaluation gate | 20B supports reasoning and structured JSON at half the 120B token price |
| Complex multi-evidence proposal that fails the 20B quality gate | Groq `openai/gpt-oss-120b` | Human review / deterministic incomplete proposal | Pay for the larger model only when measured quality requires it |

Workers AI `@cf/qwen/qwen3-30b-a3b-fp8` is a mandatory Cloudflare-native challenger
for ordinary proposals because its current token pricing is comparable with GPT-OSS
20B and it supports reasoning and function calling. It is not selected by default until
the project evaluation proves structured-output quality.

The August 2026 public rates used for planning are $0.075/M input and $0.30/M output
tokens for GPT-OSS 20B, versus $0.15/M input and $0.60/M output for GPT-OSS 120B.
Model IDs and prices must be refreshed during the bake-off and before production
rollout; they are not permanent configuration constants. The current invocation ledger
still contains an older GPT-OSS 20B estimate, so AIG-302 must update and test the ledger
pricing table before cost dashboards or application ceilings are treated as accurate.

Use separate preview and production gateways, each with versioned extraction, standard
proposal and complex proposal routes. Pages/Workers invoke the routes with
`env.AI.gateway(gatewayId).run(...)`; campaign code must not hold an account-scoped AI
Gateway token. Routes enforce per-tenant/task rate and budget limits, bounded
timeouts/retries, and explicit model versions. Send at most five flat, non-PII metadata
fields (feature, tenant pseudonym, environment, proposal type and request correlation).
Preserve token,
cost, latency, provider/model, route version and cache status, but set
`cf-aig-collect-log-payload: false` for client campaign context. Skip caching for
tenant/client-specific proposals; enable it only for explicitly classified,
non-sensitive deterministic prompts with a versioned cache key.

Because Nitro deploys Wrangler configuration as the Pages source of truth, campaign
environment selection and its gateway ID, route release, feature flag and HMAC key use
same-named encrypted bindings configured separately for Preview and Production. Runtime
requires `CAMPAIGN_AI_DEPLOY_ENV` to be exactly `preview` or `production` and fails
closed otherwise. These values must not be added to common Wrangler `[vars]`, and
`CF_PAGES_BRANCH` must not be treated as a runtime selector because Cloudflare defines
it for the Pages build environment.

The existing shared `default` gateway and Groq helper are a starting point, not the
finished contract: production campaign jobs must use a dedicated gateway, a binding-
only transport and no provider SDK fallback. The existing helper's fallback to broad
Cloudflare API tokens and direct Groq must not be reused.

The proposal path is a single structured completion with no model tools. One same-model
schema-repair call is permitted; invalid output must not auto-upgrade to 120B. Initial
pilot caps are 16K input tokens, 2K output tokens, two calls and an estimated $0.01 per
proposal. Gateway spend controls are defense in depth because Cloudflare documents
their enforcement as eventually consistent; application call/token limits remain
mandatory. Exact tenant/global pilot limits and rollback steps are in
`AI-GATEWAY-RUNBOOK.md`.

Metadata-only Gateway logging does not govern upstream provider retention. Dynamic
routes use provider credentials stored through Cloudflare BYOK/Secrets Store; the
security owner must approve current provider retention/DPA terms before production.
Cloudflare ZDR must not be claimed for Groq BYOK traffic.

## Functional workflow

### 1. Connection and topology verification

The system verifies the selected tenant, OAuth credential profile, accessible Ads
customers, controlling Merchant account, merchant subaccount, Ads-Merchant link and
required permissions. Unknown, inaccessible and mismatched states fail closed.

### 2. Merchant observation

The scanner reads account/services, data sources, feed processing state, product
counts, item issues and relevant inventory freshness. Raw provider enums and resource
names are preserved. One failed account does not discard successful observations.

### 3. Commerce readiness

Deterministic rules produce blockers, warnings and evidence:

- Merchant account missing or inaccessible
- Ads-Merchant link absent or pending
- no eligible data source
- stale or failed data-source processing
- no eligible products
- product disapproval or issue thresholds exceeded
- landing-page domain mismatch
- selected product filter returns zero products
- missing primary conversion or unproven measurement delivery
- incompatible budget period or currency
- missing PMax assets or explicitly accepted retail feed-only mode

Every outcome includes evidence time, provider resource, rule version and remediation.

### 4. AI-assisted job construction

The assistant receives the normalized template, deterministic evidence and allowed
actions. It may explain, suggest and propose task creation. It must label inferred
values, cite evidence, preserve unknown states and obtain confirmation before creating
or assigning jobs. Provider operations are not exposed as direct LLM tools.

### 5. Launch and activation

The merged PMax orchestration owns state transitions. Creation is explicit,
permissioned, queued, idempotent and paused-first. A successful HTTP response is not
completion: the provider state must be read back and reconciled. Activation is a
separate approval and command.

### 6. Reconciliation and monitoring

Scheduled jobs refresh Merchant health and compare provider campaign settings with the
approved plan. Drift creates an operational finding; it does not silently remediate.

## Proposed data ownership

Final table names must be reconciled after the PMax session merges. The workstream may
add Merchant-specific observations, but must reuse launch tables rather than creating
a second launch model.

| Record | Source of truth | Retention/behavior |
|---|---|---|
| Approved brief and job | XeroFlow | Versioned, tenant-scoped |
| Merchant account/data-source snapshot | Google observation persisted by XeroFlow | Current state plus material events |
| Product issue aggregates | Google observation persisted by XeroFlow | Snapshot/fact retention; no unnecessary full catalogue copy |
| Launch configuration and approval | XeroFlow | Immutable version/hash |
| Campaign/resource IDs and serving state | Google Ads | Mapping and observations in XeroFlow |
| Spend and conversion delivery | Provider plus XeroFlow sync | Existing facts and reconciliation |
| AI recommendation | XeroFlow | Evidence, confidence, gateway route/model/prompt version, token/cost/latency metadata and human decision; no stored hidden reasoning |

## Security and safety requirements

- Require authenticated tenant context for every read and write.
- Use existing permission constants; provider mutations require owner/admin initially.
- Encrypt OAuth tokens and never log access tokens, refresh tokens, client secrets or
  developer tokens.
- Validate all account/resource identifiers before interpolation.
- Use independent Merchant-write, Ads-create and Ads-enable feature flags.
- Use per-tenant/account allowlists during pilot rollout.
- Bind every write to an idempotency key and immutable approved payload hash.
- Store redacted provider request IDs and diagnostics.
- Use `validate_only` where supported before a production mutation.
- Create campaigns paused and prohibit enablement from the creation transaction.
- Pause rather than delete during recovery.
- Apply bounded retries only to retryable failures; policy and validation failures
  require operator action.
- Never render an absent or unsupported provider value as healthy.
- Fail closed when AI Gateway authentication, route, spend limit or provider execution
  fails; never bypass the gateway.
- Store no raw campaign prompt/completion in AI Gateway logs; log metadata only.
- Use the pre-authenticated Workers AI binding for Gateway access; do not give the
  campaign runtime an account-scoped AI Gateway token or reuse a broad Cloudflare token.
- Treat upstream-provider retention separately from Cloudflare Gateway logging and
  require an explicit privacy/security decision.
- Keep the environment-scoped campaign AI feature flags off until the production gate
  in `AI-GATEWAY-RUNBOOK.md` passes.

## Reliability and observability

Track at minimum:

- scan attempts, duration, accounts processed and partial failures;
- data-source/product freshness and issue totals;
- API quota/rate-limit events and retry exhaustion;
- job proposal, approval and rejection counts;
- AI Gateway route/model/version, token usage, estimated cost, duration, fallback and
  budget/rate-limit outcomes;
- launch state transitions and time in state;
- idempotency deduplication and resumed runs;
- provider read-back mismatches;
- activation approvals and actor;
- post-launch Merchant/feed drift;
- queue age and dead-letter/manual-recovery counts.

No metric may contain credentials, PII, full product payloads or unredacted provider
errors.

## Success metrics

### Release 1

- 100% of pilot Ads accounts have a known linked-Merchant result or explicit blocker.
- 100% of readiness conclusions include fresh evidence and remediation.
- Legacy Content API audit has a Merchant API equivalent before retirement.
- No Merchant writes are possible in the read-only release.
- Direct and manager/subaccount observations are validated against provider UI.

### Release 2

- A media buyer can generate a complete, reviewable job from an approved template.
- Required missing inputs are surfaced before approval.
- Every created task is traceable to the proposal and actor confirmation.
- 20B meets the approved structured-proposal quality threshold; 120B escalation rate
  and cost remain inside the owner-approved envelope.
- 100% of campaign-job inference is attributable to an authenticated AI Gateway route;
  direct-provider bypass attempts are zero.

### Release 3

- Every campaign is created paused.
- Every material field is read back and reconciled.
- Duplicate execution produces no duplicate provider resources.
- Activation is impossible without separate approval.
- Created campaigns enter existing spend and pacing monitoring.

### Release 4

- Every Merchant mutation has preview, approval, idempotency and read-back evidence.
- No unapproved autonomous catalogue mutations occur.

## Rollout strategy

1. Plan and reconcile concurrent work.
2. Validate the Google project and agency Merchant topology.
3. Implement read-only Merchant integration behind a tenant/account allowlist.
4. Validate one agency-controlled Merchant account and at least one subaccount.
5. Release readiness UI and preflight integration.
6. Release AI job assistance without provider writes.
7. Pilot paused PMax creation on a test or explicitly approved low-risk account.
8. Verify, activate separately and monitor through a complete reporting cycle.
9. Consider Merchant writes only after a dedicated write-risk review.

## Rollback

- Disable scheduled scans and Merchant notifications independently.
- Disable Merchant writes, Ads creation and Ads enablement independently.
- Preserve observations, events and provider mappings during rollback.
- Stop queue consumers before changing recovery state.
- Never delete a provider campaign as automated rollback; pause and escalate.
- Keep legacy audit capability until Merchant read parity is signed off.

## Open decisions and hard gates

| ID | Decision | Default until resolved | Owner |
|---|---|---|---|
| D-01 | Is the confirmed shared OAuth project acceptable for Merchant registration after key/domain remediation? | Do not register | Platform/security owner |
| D-02 | Which agency/advanced Merchant account owns developer registration? | Do not register | Media/platform owner |
| D-03 | Does the Ads developer token have sufficient production access? | Read-only validation only | Ads administrator |
| D-04 | Are Data Manager API credentials in the same project or intentionally separate? | Preserve existing integration | Measurement owner |
| D-05 | Will Release 3 include YouTube upload or only existing video IDs? | Do not enable YouTube API | Product/media owner |
| D-06 | Which PMax launch contracts survive the concurrent session merge? | Rebase and adopt merged contracts | Platform engineering |
| D-07 | Which pilot tenant/account is authorized for provider writes? | No writes | Product owner |
| D-08 | What quality and monthly/per-proposal cost thresholds approve model routes? | 20B standard, 120B unavailable until bake-off and owner sign-off | Product/platform owner |
| D-09 | Are Groq BYOK retention/DPA terms approved for campaign context? | No production inference | Security/privacy owner |

## References

- Merchant API overview: <https://developers.google.com/merchant/api/overview>
- Merchant developer registration:
  <https://developers.google.com/merchant/api/guides/quickstart/registration>
- Merchant API migration guidance:
  <https://developers.google.com/merchant/api/guides/compatibility/overview>
- Google Ads Cloud project setup:
  <https://developers.google.com/google-ads/api/docs/oauth/cloud-project>
- Google Ads developer token:
  <https://developers.google.com/google-ads/api/docs/api-policy/developer-token>
- Retail Performance Max:
  <https://developers.google.com/google-ads/api/performance-max/retail>
- PMax request structure:
  <https://developers.google.com/google-ads/api/performance-max/structure-requests>
- Data Manager API setup:
  <https://developers.google.com/data-manager/api/devguides/quickstart/set-up-access>
- YouTube Data API overview:
  <https://developers.google.com/youtube/v3/getting-started>
- Cloudflare AI Gateway dynamic routing:
  <https://developers.cloudflare.com/ai-gateway/features/dynamic-routing/>
- Cloudflare AI Gateway logging:
  <https://developers.cloudflare.com/ai-gateway/observability/logging/>
- Cloudflare Workers AI pricing:
  <https://developers.cloudflare.com/workers-ai/platform/pricing/>
- Groq pricing: <https://groq.com/pricing>
- Campaign AI Gateway production gate: `AI-GATEWAY-RUNBOOK.md`
