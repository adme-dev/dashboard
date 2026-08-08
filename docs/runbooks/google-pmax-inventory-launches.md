# Google PMax Inventory Launch Release Runbook

This runbook releases the governed Google Vehicle Ads workflow from an approved
XeroFlow brief through paused creation and separately approved activation.

## Safety model

- `GOOGLE_PMAX_PROVIDER_WRITES_ENABLED` defaults off. When true, an administrator
  can create an approved campaign and asset group in `PAUSED` state only.
- `GOOGLE_PMAX_ACTIVATION_ENABLED` defaults off and has no effect unless provider
  writes are also enabled. When both are true, an administrator can activate only
  after a separate, exact-version activation approval.
- The Cloudflare AI Gateway advisory is optional and cannot approve, unblock, mutate,
  or activate a campaign.
- Never enable activation for the first production verification. Paused creation and
  Google readback must pass first.
- Concrete Google mutations and readback run in the route-less
  `google-pmax-provider` Worker. Pages can reach it only through the
  `GOOGLE_PMAX_PROVIDER` service binding; there is no public URL fallback.
- Canonical evidence persistence, whole-platform Neon evidence queries, onboarding
  policy, and remediation-task sync also run in that Worker through `HYPERDRIVE`.
  Keep `[placement] mode = "smart"` enabled and keep transactions database-only.

## Required Google control plane

Confirm the production Google Cloud project has:

- Google Ads API enabled, an approved developer token, and OAuth scope
  `https://www.googleapis.com/auth/adwords`;
- Merchant API enabled and OAuth scope
  `https://www.googleapis.com/auth/content`;
- Business Profile APIs and delegated scope where XeroFlow will read or administer
  dealership locations;
- a Google Ads customer with active billing, a linked Merchant Center account, and
  enabled conversion actions;
- Vehicle Ads add-on, dealership licence review, website review, and an eligible AU
  vehicle feed;
- a verified Business Profile location or governed Merchant store data source, with
  store codes reconciled exactly to the feed when store codes are used.

The Business Profile location ID and Merchant store code are different identifiers.
Do not substitute one for the other. Do not create a duplicate Business Profile
location merely to obtain an ID; search and verify the existing location first.

## 1. Pre-deploy verification

From the isolated release checkout:

```bash
pnpm deploy:check
pnpm --dir workers/google-pmax-provider run typecheck
pnpm deploy:google-pmax-provider:dry-run
pnpm vitest run test/server/utils/googlePmax*.test.ts test/server/api/googlePmaxLaunchRoutes.test.ts test/config/googlePmax*.test.ts
pnpm typecheck
```

Confirm migrations 350 through 360 are present in the target Neon database. They are
additive and were designed to be safely re-run.

## 2. Deploy the private provider Worker

Deploy the service-binding target before deploying Pages:

```bash
pnpm deploy:google-pmax-provider:dry-run
pnpm deploy:google-pmax-provider
```

Confirm `workers_dev = false` remains set in
`workers/google-pmax-provider/wrangler.toml`. Do not add a route or URL fallback.
Confirm its `HYPERDRIVE` binding and Smart Placement configuration are present before
the Pages deployment.
The Pages `wrangler.toml` binding must remain exactly
`GOOGLE_PMAX_PROVIDER -> google-pmax-provider`.

## 3. Preview deployment

Use only the guarded deployment scripts:

```bash
pnpm deploy:check
pnpm deploy:preview
```

Keep both write gates absent or false. Sign in with `MEDIA_BUYING`, select the intended
organisation, and open `/agency/social/google/pmax-launches`.

## 4. Read-only evidence verification

For one approved test launch:

1. Choose **Prepare approved brief**. The request contains only the brief ID; confirm
   the resulting plan contains the server-resolved account, currency, timezone, active
   feed link, exact conversion resources, and one unambiguous AU geo criterion per
   approved PMA location. Preparation performs no Google writes.
2. Record the onboarding attestation against the exact launch version.
3. Run preflight.
4. Compare the account, Merchant, feed, location, conversion, destination, and asset
   facts against Google and the XeroFlow client record.
5. Confirm blockers create or update stable rollout tasks instead of duplicate tasks.
6. Confirm the evidence snapshot contains no access token, refresh token, developer
   token, client secret, or other credential.
7. Confirm the Cloudflare advisory being unavailable does not change deterministic
   readiness.

## 5. Paused creation verification

In preview or a controlled production window, set only:

```text
GOOGLE_PMAX_PROVIDER_WRITES_ENABLED=true
GOOGLE_PMAX_ACTIVATION_ENABLED=false
```

Redeploy through `pnpm deploy:preview` or `pnpm deploy:production`. Approve paused
creation and choose **Create paused in Google**.

Compare Google readback with the approved configuration:

- campaign and asset group are `PAUSED`;
- campaign type is `PERFORMANCE_MAX` and listing type is `VEHICLES`;
- Merchant Center ID is exact;
- budget period is `CUSTOM_PERIOD`, only `totalAmountMicros` is populated, and start
  and end timestamps match the approved flight;
- geo and language constants are exact;
- NEW and USED condition units match the approved filter, and the unclassified
  remainder is excluded;
- final and mobile URLs are exact;
- the custom conversion goal contains exactly the selected conversion actions;
- campaign, budget, asset group, and Google request identifiers are recorded without
  credentials.

If Google returns any unsafe state, disable provider writes immediately. The executor
attempts an emergency pause and marks the launch `RECOVERY_REQUIRED` instead of
continuing.

## 6. Production activation approval

Only after paused readback, conversion tests, Vehicle Ads reviews, budget, targeting,
client authority, and launch timing are all rechecked:

1. Record the separate activation approval in XeroFlow.
2. Set `GOOGLE_PMAX_ACTIVATION_ENABLED=true` in the Cloudflare Pages production
   environment.
3. Redeploy with `pnpm deploy:production`.
4. Choose **Activate campaign** once.
5. Confirm Google readback shows both campaign and asset group `ENABLED` and the exact
   configuration still matches.
6. Set `GOOGLE_PMAX_ACTIVATION_ENABLED=false` again and redeploy if ongoing activation
   access is not operationally required.

## 7. First 72 hours

- Verify spend pacing against the fixed total, not a derived daily cap.
- Confirm Engagr/server-side conversions remain singular; do not install duplicate GTM
  or Google tag snippets.
- Review search terms, lead quality, disapprovals, feed freshness, destination health,
  and store-code reconciliation.
- Compare pooled audience, persona, knowledge, board, and spend signals with actual
  lead outcomes; advisory recommendations remain review-only.
- Resolve tasks through the seeded PMax launch project so the operational record and
  campaign record remain linked.

## Rollback

1. Set `GOOGLE_PMAX_ACTIVATION_ENABLED=false` and
   `GOOGLE_PMAX_PROVIDER_WRITES_ENABLED=false`; redeploy through the guarded production
   script.
2. Pause the campaign and asset group in Google Ads if either is enabled.
3. Preserve launch events, approvals, evidence, and provider IDs for investigation.
4. Do not delete or recreate the campaign while identity or partial-mutation state is
   uncertain. The deterministic provider names make a safe retry discoverable.
