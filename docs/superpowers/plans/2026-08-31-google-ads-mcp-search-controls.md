# Google Ads MCP Search Controls Implementation Plan

**Goal:** Expose typed, tenant-bound Search campaign reads and governed mutations through XeroFlow's Google Ads MCP control plane, including budgets, campaigns, ad groups, responsive search ads, keywords, negative keywords, location/language/schedule targeting, and safe pause/archive defaults.

**Source contract:** Google Ads API v25 REST resources and mutate services. New campaigns are always created `PAUSED`; enabling is a separate rich-confirm action. Provider `remove` operations are not used by default and remain behind the independent destructive gate.

**Safety contract:** No arbitrary GAQL or raw mutate inputs cross the MCP boundary. Every write produces an immutable action plan, revalidates policy and provider state, performs validate-only, claims once, mutates once, reads back, and writes append-only audit evidence.

## Ordered task list

- [ ] Define strict Zod contracts and MCP descriptors for bounded Search reads and typed action-plan creation.
- [ ] Implement tenant-bound Google connection and credential resolution, including token refresh and manager-customer headers.
- [ ] Implement bounded state loaders and verification projections for campaigns, budgets, ad groups, ads, criteria, locations, languages, and schedules.
- [ ] Implement campaign/ad-group/ad/keyword status mutations, with pause/archive as the default removal behavior and enable as rich-confirm.
- [ ] Implement negative-keyword creation and removal, including policy-limited automatic additions and duplicate/conflict checks.
- [ ] Implement positive keyword creation and updates with exact/phrase/broad match validation.
- [ ] Implement budget creation and amount updates; treat spend-affecting changes as rich-confirm.
- [ ] Implement paused Search campaign creation and safe campaign updates.
- [ ] Implement ad-group creation/updates and responsive-search-ad creation/replacement.
- [ ] Implement location presence targeting, languages, and ad schedules using typed criterion builders.
- [ ] Register typed planners and execution adapters with MCP proposal, confirmation, automatic-policy, status, and validate flows.
- [ ] Add provider-boundary tests, authorization/idempotency/readback tests, operator docs, marketing-page updates, and a baseline comparison.

## Delivery checkpoints

1. **Safe optimization slice:** reads, pause/archive, and negative keywords.
2. **Search construction slice:** budgets, paused campaigns, ad groups, responsive search ads, and positive keywords.
3. **Targeting slice:** locations with presence-only mode, languages, and schedules.
4. **Activation slice:** rich-confirm enable operations and staged rollout flags.

## Verification commands

```bash
pnpm exec vitest run test/server/utils/googleAds*.test.ts test/ai/mcpGoogleAds*.test.ts
pnpm exec eslint server/utils/googleAds server/utils/ai/mcp/googleAds*.ts test/server/utils/googleAds*.test.ts test/ai/mcpGoogleAds*.test.ts
pnpm run typecheck
```

The repository typecheck currently has unrelated baseline failures. Completion requires no diagnostics in files changed by this plan and no new full-suite failures relative to the recorded baseline.
