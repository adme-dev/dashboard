# Phase 0 Evidence

## Planning isolation and tracker

**Date:** 2026-08-07

- Source baseline: pushed `main` commit `71b56065665b3dc5a71d619c8527344d26263dd8`.
- Isolated branch: `docs/google-merchant-orchestration`.
- Isolated worktree: `.worktrees/google-merchant-orchestration`.
- Root dirty worktree was not modified.
- Active GSD workstream: `google-merchant-campaign-orchestration`.
- GSD inventory: seven phases, Phase 0 in progress, Phases 1-6 pending.
- Executable register: 57 stable tasks after adding three explicit AI Gateway/model/
  data-handling gates.
- Canonical planning commit: `9cd0efdd`.
- Draft tracking PR: `#379`.

## Documentation verification

- `git diff --check`: passed.
- Task heading count: 57 (54-task baseline plus AIG-301, AIG-302 and AIG-303).
- Secret-pattern scan across workstream Markdown: no credential values detected.
- API boundaries and Cloudflare deployment assumptions reviewed against `AGENTS.md`.
- Concurrent PMax migrations/utilities are declared as a blocked dependency and were
  not modified.

## OAuth project observation

- Local `.env` contains a `GOOGLE_CLIENT_ID` in the expected Google OAuth client format.
- Sanitized numeric project prefix: `14351276985`.
- Candidate project ID from the supplied Console URL:
  `gen-lang-client-0818792107`.
- Candidate numeric project number: `14351276985`.
- Mapping verdict: **confirmed**; it matches the production OAuth client prefix.
- Read-only Console inspection found one web OAuth client named Agency Dashboard with
  XeroFlow production, Cloudflare Pages and local origins/callbacks.
- Google Auth audience is Internal and Console reports verification is not required.
  Public app home/privacy/terms fields appear incomplete and must be addressed before
  any future external-audience change.
- The project contains unrelated Gemini/API-key workloads and at least one API key row
  is flagged unrestricted. No key value was opened. Security-owner remediation or
  explicit acceptance is required before Merchant registration.
- Secret exposure: none.

## Enabled Google services and Ads token

**Checked:** 2026-08-07
**Method:** Read-only Cloud Console and Google Ads API Center inspection; identifiers
other than the approved project ID/number were not retained.

- Google Ads API: enabled, with recent traffic.
- Data Manager API: enabled.
- Merchant API: not enabled; Console showed the Enable action and it was not used.
- Content API for Shopping: not present in the enabled-service inventory.
- Ads developer token: agency-owned, masked, Basic Access.
- No API, scope, credential or token setting was changed.

## Merchant topology observation

**Checked:** 2026-08-07
**Method:** Read-only Merchant Center inspection with standalone and agency logins.

- A standalone dealer account is incomplete, has an unverified website and no Ads
  service link; it is not a registration target.
- The agency login exposes an advanced-account hierarchy and subaccount export with 50
  subaccounts.
- The advanced account's claimed website is client-owned rather than agency-owned.
  This fails the current agency-domain registration gate.
- The people/access UI suggests account-administration capability, but the exact actor
  role and monitored API Developer email are not proven.
- Registration state remains unknown because Merchant API is deliberately disabled.
- No Merchant registration, link, website claim or account setting was changed.

## Cloudflare AI Gateway policy evidence

**Checked:** 2026-08-07
**Method:** Repository inspection plus current official Cloudflare and Groq docs; no
Cloudflare/Groq configuration mutation or inference request.

- `wrangler.toml` configures the shared Cloudflare AI Gateway `default` endpoint and the
  app has a Workers AI binding.
- `server/utils/groqClient.ts` supports Gateway authentication but currently retries
  directly against Groq after a Gateway failure. Campaign-job work must not reuse that
  bypass behavior.
- Cloudflare dynamic routes support versioned model selection and per-key rate/cost
  limits. Authenticated Gateway is required for the rollout.
- Gateway payload logging is enabled by default; the rollout must set
  `cf-aig-collect-log-payload: false` while retaining metadata-only cost/token/latency
  evidence. Custom metadata is limited to five flat values.
- Current Groq list rates are $0.075/M input and $0.30/M output for GPT-OSS 20B and
  $0.15/M input and $0.60/M output for GPT-OSS 120B. These are planning inputs and must
  be refreshed during AIG-302.
- Selected baseline: deterministic/no-model first; GPT-OSS 20B for ordinary structured
  proposals; GPT-OSS 120B only after measured escalation; evaluate a JSON-capable
  Workers AI model for bounded low-risk work.
- No secret values were read or recorded.

### Production-gate nuance review

- The Pages configuration already provides an `AI` binding. Current Cloudflare docs
  support calling dynamic routes with `env.AI.gateway(gatewayId).run(...)`; binding
  requests are pre-authenticated.
- Cloudflare AI Gateway Run tokens are account-scoped rather than gateway-scoped.
  Campaign jobs will not put such a token, `CF_API_TOKEN` or `CLOUDFLARE_API_TOKEN` in
  their runtime path.
- Preview and production require separate dedicated gateway IDs. The shared `default`
  gateway is prohibited for campaign jobs.
- Dynamic routes use BYOK provider credentials stored by Cloudflare Secrets Store.
  Cloudflare ZDR does not apply to BYOK requests, and Groq is not currently listed as a
  ZDR-supported provider. Provider retention/DPA approval remains a production blocker.
- Cloudflare spend-limit enforcement is eventually consistent. Application-side token,
  call and estimated-cost bounds remain mandatory.
- Direct source shows `server/utils/ai/invocationLedger.ts` still estimates GPT-OSS 20B
  at the older $0.10/M input and $0.40/M output rates. The current planning source is
  $0.075/M and $0.30/M; AIG-302 now requires a dated refresh plus cost-estimation tests
  before ledger/dashboard cost evidence is accepted.
- `@cf/qwen/qwen3-30b-a3b-fp8` was added as a required Cloudflare-native evaluation
  challenger to Llama 8B and Groq GPT-OSS 20B/120B.
- No Cloudflare gateway, route, BYOK secret, spend rule, DLP policy or feature flag was
  created or changed during this review.

### Graphify Wiki confirmation

**Method:** Read-only queries against the existing project `graphify-out/graph.json`
and wiki in the root worktree; the graph itself was not rebuilt or modified because
another session owns the dirty root.

- Graphify confirmed `getDirectGroqClient()` in `server/utils/groqClient.ts` is called
  by `generateGroqInsight()`, corroborating the direct-provider bypass risk.
- Graphify confirmed `recordAiInvocation()` connects to token/cost estimation and that
  `resolveAiModelAssignment()` connects to runtime provider/model policy.
- Graphify confirmed `estimateAiInvocationCostUsd()` is called by
  `recordAiInvocation()`, corroborating that a stale model-price entry flows into
  persisted invocation cost.
- Graphify confirmed `gatewayBase()` is shared by Groq and Anthropic provider helpers.
- The query reported graphify skill/package versions `0.9.32`/`0.9.34` and an older
  pre-#1504 node-ID scheme. These warnings are recorded; direct source reviewed in this
  branch remains authoritative when the graph is stale.
- Graphify could locate Nitro's `deployConfig` surface but did not reliably connect the
  deployment script or Pages environment semantics in the stale graph. Direct source
  confirms `scripts/deploy-pages.mjs` deploys only `main` or `preview`, and current
  Cloudflare documentation defines `CF_PAGES_BRANCH` as a build variable. The governed
  runtime contract now requires same-named encrypted Preview/Production bindings plus
  an explicit fail-closed `CAMPAIGN_AI_DEPLOY_ENV`; no environment inference is based
  on that build variable.

## Dependency and test baseline

- Runtime: Node `24.18.0`.
- `pnpm install --frozen-lockfile`: passed; lockfile unchanged; Nuxt preparation passed.
- Focused baseline command covered Google Ads client, Google AI Max classifier/scanner/
  endpoint and inventory-feed audit contracts.
- Result: 5 test files passed; 33 tests passed; 0 failures.
- CTL-009 remains in progress only because the baseline must be refreshed after the
  concurrent PMax session merges and this branch rebases.

## Production Google credential inventory

**Checked:** 2026-08-07
**Method:** Read-only aggregate SQL transaction; no token, account, tenant or user
identifiers selected or emitted.

- Google connections: 108 active of 108 total.
- Shared encrypted credential profiles: one active profile.
- Profile-linked connections: 87; all 87 are manager-linked account mappings.
- Shared-profile grants: `adwords`, `content` and `datamanager` are present on the
  profile and its 87 linked connections.
- Legacy/unprofiled connections: 21.
- Merchant account identifiers in stored connection/profile metadata: zero.
- Merchant discovery implication: existing inventory audit discovers Merchant Center
  IDs dynamically from Google Ads `product_link` rows rather than a persisted Merchant
  topology.
- Metadata key names were inspected, but metadata values were not selected.

## Bounded Google Ads authorization proof

**Checked:** 2026-08-07
**Method:** Existing aggregate-only `scripts/audit-google-ai-max-live.ts`, limited to
one account; provider operation was read-only and emitted no identifiers.

- API version: v23.
- Sample selected the legacy fallback because local
  `REPO_TOKEN_ENCRYPTION_KEY` is not configured.
- Result: failed with Google Ads `USER_PERMISSION_DENIED` after bounded fallback;
  successful accounts: zero.
- The call proves the request reached Google Ads, but does **not** prove usable direct
  or MCC-child authorization and does not establish the developer-token access level.
- This is consistent with the existing five-account validation record in
  `docs/research/2026-08-google-ai-max-api-validation.md`; it is not a new success.
- No provider mutation occurred. Token/credential values were not printed.

## Cloudflare production secret prerequisites

**Checked:** 2026-08-07
**Method:** Read-only `wrangler pages secret list` against the immutable
`agency-dashboard` Pages project; secret names only.

- Production has encrypted entries for `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
  `GOOGLE_DEVELOPER_TOKEN`, `GOOGLE_REDIRECT_URI` and
  `REPO_TOKEN_ENCRYPTION_KEY`.
- This confirms configuration presence only; values, project ownership, validity and
  Ads developer-token access level were not exposed or proven.
- The missing encryption key is local-operator-only, not an observed production
  configuration omission.
- No Cloudflare configuration was changed.

## Outstanding Phase 0 evidence

- Security-owner disposition for shared-project/unrestricted-key findings.
- Owner decision on the Merchant agency-domain failure and registration target.
- A current direct-account grant or an approved retirement decision for the 21 legacy
  connections.
- A live MCC-child read through an authorized production/preview execution path that
  has `REPO_TOKEN_ENCRYPTION_KEY`.
- Merchant advanced-account/subaccount topology and registration approval.
- Merchant registration plus bounded read.
- Direct and manager/subaccount Ads/Merchant read comparison.
- Concurrent PMax merge and contract reconciliation.
- Post-PMax-rebase refresh of the currently passing Node/dependency/test baseline.
