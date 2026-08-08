# PRD: Governed Google PMax Inventory Launches

## Outcome

XeroFlow converts an approved Google PMax Inventory brief into an exact, auditable
Vehicle Ads rollout. It pools the platform's client knowledge, audiences, personas,
boards, tasks, spend, anomalies, internal feed, and provider evidence for decisions,
creates Google resources paused, and cannot begin spend without a separate approval.

## Users

- media buyers prepare briefs, evidence, targeting, feeds, and conversion selections;
- account managers provide client authority, budget, creative, location, and policy
  decisions;
- administrators attest account setup and approve provider writes;
- agency leadership audits rollout state, ownership, blockers, and spend authority.

## Functional requirements

1. The Google PMax brief records campaign name, fixed-flight total, dates, targeting,
   Merchant Center and feed identity, inventory condition, conversion actions, asset
   mode, final URL, and compliance acknowledgement.
2. An immutable launch configuration binds one approved brief version to one tenant,
   client, OAuth connection, Google customer, Merchant account, and internal feed.
3. The operator prepares that configuration by selecting an approved brief only. The
   server re-reads approved fields and resolves Google account facts, exact conversion
   resources, active feed identity, and unambiguous AU geo target constants. The
   browser cannot submit normalized provider evidence or an idempotency key.
4. A seeded project template creates accountable onboarding, evidence, creation,
   activation, and monitoring tasks.
5. Onboarding distinguishes Google Ads, Merchant Center, Business Profile, Business
   Profile location, Merchant store data source, and feed store-code identities.
6. Preflight reads live Google and Merchant evidence and reconciles all relevant
   XeroFlow evidence sources. Missing or conflicting evidence blocks approval.
7. Advisory AI runs through Cloudflare AI Gateway with a low-cost model, bounded input,
   timeout, disabled payload logging, no mutation tools, and no authority over checks.
8. Create approval is atomic, administrator-only, reasoned, and bound to the exact
   configuration version and hash.
9. Provider execution validates first, creates campaign and asset group paused, uses a
   campaign total budget, and applies exact Vehicle Ads, targeting, inventory, URL, and
   conversion-goal configuration.
10. Provider readback must match before the launch becomes `VERIFIED_PAUSED`.
11. Activation has a new approval, a separate Cloudflare kill switch, an explicit spend
    acknowledgement, an atomic campaign-and-asset-group enable operation, and a second
    readback.
12. All transitions, approvals, evidence snapshots, provider resource names, request
    IDs, failures, and remediation tasks remain tenant-scoped and auditable.
13. Provider credentials and arbitrary provider diagnostics never enter evidence,
    events, API responses, or UI state.
14. Google mutation/readback, canonical evidence construction and persistence,
    platform-evidence queries, onboarding policy, and remediation-task sync run in the
    route-less `google-pmax-provider` Cloudflare Worker. It reaches Neon through
    Hyperdrive with Smart Placement; Pages supplies credentials and request context
    only over the private `GOOGLE_PMAX_PROVIDER` service binding and fails closed when
    that binding or its response is unavailable.

## Non-goals

- AI does not create, approve, or activate campaigns.
- The first executable slice does not guess manual asset roles; provided-asset launches
  remain fail-closed until square, landscape, logo, video, and text roles are explicit.
- XeroFlow does not silently create duplicate Business Profile locations.
- Discussion drafts, Monday brainstorms, and unapproved board content do not become
  executable configuration.

## Success criteria

- zero spend can occur from paused creation;
- every enabled launch has two exact-version approvals and matching Google readback;
- selected conversion actions, feed identity, budget, flight, targeting, Merchant ID,
  and inventory conditions are exact;
- onboarding and preflight blockers have owners and stable tasks;
- repeated requests are safe and discover the same deterministic Google resources;
- Cloudflare or AI advisory failure cannot bypass deterministic policy;
- the public Pages worker does not contain the concrete Google mutation provider;
- operators can complete the lifecycle from one Nuxt UI control room.

## Rollout

Follow `docs/runbooks/google-pmax-inventory-launches.md`. Provider writes and activation
remain independently dormant until their Cloudflare production gates are explicitly
enabled.
