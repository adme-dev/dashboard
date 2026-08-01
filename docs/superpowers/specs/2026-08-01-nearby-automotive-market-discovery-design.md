# Nearby Automotive Market Discovery — Design and PRD

**Date:** 2026-08-01

**Status:** Approved design, awaiting written-spec review

**Parent capability:** [Automotive Site Intelligence](./2026-08-01-automotive-site-intelligence-design.md)

**Primary surface:** `/agency/analytics/audiences/intelligence`

## Purpose

Add a visual, location-aware discovery layer to Automotive Site Intelligence so
media buyers can see which automotive brands and dealerships trade near a
client, review their public websites, and promote relevant candidates into the
existing governed competitor-indexing workflow.

Google Maps and Places provide discovery context. They do not decide which sites
XeroFlow indexes. A human remains responsible for approving every competitor
domain and its first crawl boundary.

## Product decision

Build a split Google Map and distance-ranked dealership list centred on a
user-confirmed client trading location.

The first release will:

1. discover car dealerships within selectable 10, 25, or 50 kilometre radii,
   showing franchise/new-car and unclassified candidates by default;
2. support brand and monitoring-status filters;
3. distinguish the client location, unreviewed candidates, saved candidates,
   and monitored competitors;
4. retrieve a candidate's public website only after the user selects it;
5. validate the website through the existing site-intelligence URL and SSRF
   policy;
6. require an explicit human decision before creating a monitored competitor;
7. offer `Approve & index`, `Save for later`, and `Dismiss` decisions;
8. start only the bounded crawl shown in the approval preview; and
9. let permitted client-portal users nominate competing businesses while
   keeping website validation and indexing approval with agency staff.

Used-car superstores and independent dealers are hidden by default and available
through an explicit `Include used and independent dealers` filter. Places does
not expose a reliable new-versus-used dealer type, so uncertain classifications
remain visible as `Unclassified` rather than being silently excluded.

## Users and jobs

### Media buyer

- Understand the competitive automotive market around a client's location.
- Compare nearby dealerships by distance, brand, and monitoring status.
- Review a relevant public website and start a bounded first index without
  copying URLs between systems.

### Account manager

- Confirm the client's correct trading location.
- Maintain a client-specific candidate and approved-competitor set.
- Explain why a competitor was added, saved, or dismissed.

### Platform administrator

- Control Google Maps and Places credentials, quotas, and billing alerts.
- Audit approvals, dismissals, domain validation, and crawl creation.
- Diagnose mapping, Places, domain-policy, and crawl failures independently.

### Client contact

- See the nearby dealership market in the client portal.
- Tell the agency which businesses compete for the client's customers.
- Explain why a business is relevant and follow its review status.
- Never configure or start a crawler directly.

## Chosen interaction

The approved layout is a split map and ranked list.

### Header and controls

The panel begins with:

- client selector;
- confirmed primary trading address and `Change location` action;
- 10, 25, and 50 kilometre radius controls, with 25 kilometres as the default;
- dealer-category control, defaulting to franchise/new-car and unclassified
  dealerships and offering used and independent categories;
- brand filter; and
- monitoring-status filter.

The interface uses Nuxt UI v4 controls. Location confirmation is a governed form
flow using `UFormField`, `UInput` or `USelectMenu`, and `UModal` or `USlideover`.
It never uses browser-native dialogs or form elements.

### Map

The Google Map displays:

- a clearly labelled client marker;
- a visible radius overlay;
- candidate markers;
- saved-candidate markers;
- approved or already-monitored markers; and
- Google Maps and any required third-party attribution without obstruction.

Selecting a marker selects the equivalent ranked-list row. Map markers are not
the only way to access a candidate.

### Ranked list

The list remains visible beside the map on wide screens and becomes the primary
interaction above the map on narrow screens. Each row contains current,
transient discovery information:

- dealership name;
- normalized brand labels when available;
- distance from the confirmed client location;
- dealer category;
- monitoring or decision status; and
- `Review website` or `View monitored domain` action.

The list is keyboard accessible and preserves selected-marker focus.

### Candidate review

`Review website` opens a panel that shows:

- candidate and client context;
- the public website returned for the selected candidate;
- canonical HTTPS origin and validation result;
- duplicate-domain or existing-monitoring status;
- the first crawl boundary;
- retention and AI-input state; and
- the approval decision actions.

The pilot crawl preview defaults to 25 pages, depth 1, automatic rendering,
30-day raw snapshot retention, `search` purpose, and AI input disabled.

Actions:

- `Approve & index` creates the approved competitor registry record and starts
  the displayed first crawl;
- `Save for later` stores a client-specific Place ID decision without crawling;
- `Dismiss` stores a client-specific Place ID decision and hides the candidate
  from the default view; and
- `Enter website manually` is available when Google does not provide a website.

### Client portal nomination

Permitted client users receive a simplified `Nearby market` view under portal
analytics. It reuses the confirmed client market location, Google Map, radius,
and ranked results but hides crawl limits, retention, AI, provider diagnostics,
and domain controls.

The client sees four plain-language states:

- `Suggested` — no decision has been recorded;
- `Under review` — a client nomination awaits agency review;
- `Monitored` — the agency approved the domain; and
- `Not selected` — the nomination was dismissed or rejected for this client.

`Nominate competitor` opens a small governed form requiring a reason. Its
confirmation states that the nomination does not start indexing. Submission
records the client user and reason, notifies the agency review queue, and changes
the portal state to `Under review`. Client users cannot request `websiteUri`,
enter a manual domain, approve a crawl boundary, or trigger a crawl.

### Agency nomination queue

Agency staff see client nominations in the Audience Intelligence market panel,
including client, candidate, nominator, reason, age, and review state. `Review`
opens the same agency candidate-review panel used for staff-discovered
candidates. Agency staff may:

- approve and index after current website lookup and domain validation;
- save the candidate for later agency review; or
- dismiss the nomination with an internal audit reason.

The portal reflects the resulting state but does not expose internal rejection
notes, crawler configuration, provider errors, or operational diagnostics.

## Architecture

```text
Agency Intelligence UI ─────────┐
                                ├──► Google Maps JavaScript API
Client Portal market UI ────────┘          └── map, radius, attribution
        │
        ├──► authenticated, role-scoped nearby-market APIs
        │          └── Places API (New), minimal discovery fields
        │
        └──► candidate decision records
                   │
                   └── agency-only candidate review
                              ├── selected-candidate website lookup
                              ├── existing URL/SSRF validation
                              ├── approval audit transaction
                              └── existing site-intelligence crawl workflow
```

The browser key is restricted to the approved XeroFlow application origins and
only the client-side Google Maps APIs it needs. A separate server credential is
restricted to the required Places APIs. Server-side requests enforce field
masks, per-user and per-client rate limits, timeouts, and quotas.

Google Maps failures do not affect the existing domain registry, crawl history,
changes, gaps, or insight surfaces.

## Google Places request policy

Nearby Search uses Places API (New) with a circular location restriction and the
official `car_dealer` type. Google does not provide a separate
`used_car_dealer` request type. XeroFlow therefore classifies franchise/new-car,
used, independent, or unclassified candidates conservatively from transient
display evidence and later public-site evidence. The initial response requests
only fields needed to render and classify the candidate list, such as Place ID,
display name, location, formatted address, business status, and place types.

The public `websiteUri` field moves a Nearby Search or Place Details request into
a higher pricing category. XeroFlow therefore requests it only after a user
selects `Review website` for one candidate. Wildcard field masks are prohibited.

XeroFlow will:

- display Places results on the Google Map with required attribution;
- keep Google-supplied names, addresses, coordinates, distances, types, and
  website values transient;
- persist Google Place IDs under Google's documented caching exception;
- refresh transient candidate display data when the market view reopens;
- keep raw Places responses out of Neon, R2, Vectorize, logs, analytics events,
  and AI input; and
- retain an independently validated public domain only after a human confirms
  the candidate and XeroFlow's URL policy accepts it.

The application Terms of Use and Privacy Policy must reference the applicable
Google Maps Platform terms and privacy disclosures before production activation.

## Data model

### `client_market_locations`

One or more user-confirmed trading locations per client. The first release uses
one primary location but keeps the boundary compatible with multi-location
dealer groups.

Required fields:

- `id`;
- `client_id`;
- `label`;
- user-confirmed address text;
- `google_place_id`;
- `is_primary`;
- `confirmed_at` and `confirmed_by`;
- `created_at` and `updated_at`.

The primary-location constraint is enforced per client. Latitude and longitude
returned by Google are resolved transiently rather than persisted as Google
Places content.

### `site_intelligence_candidates`

Client-specific discovery decisions without stored Google Places payloads.

Required fields:

- `id`;
- `client_id`;
- `market_location_id`;
- `google_place_id`;
- `state`: `saved`, `nominated`, `approved`, or `dismissed`;
- `source`: `agency` or `client_portal`;
- `approved_domain_id`, nullable;
- `radius_km_at_decision`;
- `nomination_reason`, nullable outside client nomination;
- `nominated_at` and `nominated_by_client_user_id`, nullable;
- `agency_review_reason`, nullable before agency review;
- `reviewed_at` and `reviewed_by_user_id`, nullable before agency review;
- `created_at` and `updated_at`.

The tuple of `client_id`, `market_location_id`, and `google_place_id` is unique.
An approval transaction links the candidate to the existing
`site_intelligence_domains` record. The domain registry remains the source of
truth for crawl settings and operational state. Every nomination, review, and
state transition also writes an append-only `site_intelligence_audit_events`
entry so repeated nominations retain their actors without duplicating the
candidate row.

## API boundaries

The feature exposes these route contracts:

- `GET /api/agency/site-intelligence/market-locations`
- `PUT /api/agency/site-intelligence/market-locations/[id]`
- `POST /api/agency/site-intelligence/nearby-market/search`
- `GET /api/agency/site-intelligence/nearby-market/candidates/[placeId]`
- `POST /api/agency/site-intelligence/nearby-market/candidates/[placeId]/decision`
- `GET /api/agency/site-intelligence/nearby-market/nominations`
- `GET /api/client-portal/site-intelligence/nearby-market`
- `POST /api/client-portal/site-intelligence/candidates/[placeId]/nominate`

All routes require authentication. Location changes, candidate decisions, and
domain creation require the existing site-intelligence management permission.
Read-only users may view the map and current decisions but cannot retrieve a new
website or approve, save, dismiss, or crawl a candidate.

Client-portal routes derive `client_id` exclusively from the authenticated
portal session. A new opt-in `canNominateCompetitors` portal permission is
required to submit a nomination; `canViewAnalytics` is required to view the
market. Portal request bodies never accept a client ID, website URL, crawl
configuration, or decision actor. The server derives those boundaries.

Candidate review re-fetches current Place data, validates the selected domain,
and checks existing monitored domains. `Approve & index` uses a transaction or
idempotency key so concurrent requests cannot create duplicate candidate,
domain, or crawl records.

## Domain approval boundary

A Google result never enters the crawler automatically. Approval requires:

1. an authenticated user with management permission;
2. a confirmed client market location;
3. a selected Google Place ID;
4. a current public website lookup or user-entered website;
5. successful canonical-origin and URL-policy validation;
6. duplicate-domain resolution;
7. a reviewer justification;
8. a visible crawl-boundary preview; and
9. an explicit `Approve & index` action.

A client nomination satisfies none of steps 4 through 9. It only records a
client-scoped Place ID, nomination reason, portal actor, and `nominated` state.
Agency staff must complete the full approval boundary before indexing.

The crawl continues to respect robots.txt, Content Signals, public access
controls, exact-origin scope, page/depth limits, retention, and existing global
or per-domain pause controls.

## Error handling

### Missing or uncertain client location

Show `Confirm market location` instead of an empty map. Website-derived or
existing client-address suggestions are never silently accepted; a user must
confirm the trading location before discovery.

### Google API or quota failure

Show a retryable `UAlert` with an operational category such as unavailable,
misconfigured, rate-limited, or quota-exceeded. Preserve the existing monitored
domain table and crawl diagnostics. Do not fall back to ungoverned scraping of
Google Search or Maps.

### No candidates

Explain that no matching dealers were found under the current filters and offer
radius expansion or the off-by-default used/independent filter. Do not imply the
market contains no competitors.

### Missing or invalid website

Allow `Save for later`, `Open in Google Maps`, or manual domain entry. Manual
domains pass the same canonical-origin, public-network, duplicate, and approval
policy as Google-provided domains.

### Duplicate candidate or domain

Display `Already monitored` and link to the current domain and crawl history.
Database uniqueness and an idempotent approval transaction prevent races.

If multiple portal users nominate the same Place ID, XeroFlow preserves one
client-scoped candidate and appends the later actor to the audit history rather
than creating another review item.

### Crawl failure

The competitor remains approved. Existing run diagnostics show the terminal
failure, page counts, categories, and retry action. Approval is not repeated and
the system does not conceal a failed first index.

## Cost and security controls

- Separate, least-privilege Google browser and server credentials.
- Application and API restrictions on both credentials.
- Exact production and approved-preview origin restrictions for the browser key.
- Minimal field masks; no production wildcard masks.
- On-demand website lookup only after candidate selection.
- Per-user, per-client, and organization request throttles.
- Separate rate limits for agency discovery and client-portal discovery.
- Google Cloud budgets, quota ceilings, and billing alerts before activation.
- Redacted provider errors; no credentials or raw provider payloads in logs.
- Server-side request timeouts and bounded retries for transient failures.
- Feature flag and global kill switch independent of the existing crawler flag.
- Client users cannot invoke website lookup, manual-domain validation, domain
  mutation, or crawl routes.

## Accessibility and responsive behaviour

- Every marker has an equivalent list item and accessible name.
- Keyboard selection keeps marker and list focus synchronized.
- Status never relies on colour alone.
- The radius has a textual value and button controls; dragging a circle is not
  required.
- On small screens the ranked list appears before a height-bounded map.
- The review panel uses a responsive Nuxt UI modal or slideover with one-column
  form fields in constrained widths.
- The portal nomination reason uses `UFormField` and `UTextarea`, with a clear
  explanation of the agency-review boundary.
- Loading and provider failures are announced without trapping focus.

## Testing

### Unit

- radius validation and default selection;
- dealer-category and monitoring-status filters;
- exact Google field masks by discovery and review stage;
- candidate decision transitions;
- agency and client-portal state-label mapping;
- duplicate-domain matching; and
- Place payload redaction and non-persistence helpers.

### API and integration

- authentication and management-permission enforcement;
- portal session client scoping and `canNominateCompetitors` enforcement;
- primary market-location uniqueness;
- provider timeout, quota, malformed response, and no-result handling;
- manual and Google-provided URL validation through the existing SSRF policy;
- transactional candidate approval and idempotent crawl creation;
- duplicate portal nomination coalescing and audit preservation;
- duplicate approval races; and
- proof that raw Places responses do not enter Neon, R2, Vectorize, queue jobs,
  logs, or AI requests.

### UI and browser

- location confirmation and missing-location state;
- synchronized marker and ranked-row selection;
- 10, 25, and 50 kilometre controls;
- brand, dealer-category, and monitoring filters;
- saved, dismissed, candidate, and already-monitored states;
- review panel, manual website fallback, approval preview, and crawl trigger;
- client nomination reason, `Under review`, `Monitored`, and `Not selected`
  states;
- proof that the client portal cannot retrieve a candidate website or start a
  crawl;
- keyboard-only operation and narrow viewport order; and
- provider and crawl failure recovery.

## Pilot and rollout

1. Keep the nearby-market feature flag disabled by default.
2. Provision restricted Google Maps and Places credentials, quotas, budgets, and
   billing alerts.
3. Confirm the Knox GWM Haval primary trading location.
4. Verify Lilydale GWM Haval appears correctly and is marked already monitored.
5. Review one unmonitored nearby dealership without approving it and verify the
   website lookup cost boundary.
6. Approve one public competitor with a 25-page, depth-1, AI-off crawl preview.
7. Verify one and only one competitor domain and crawl run are created.
8. Validate R2 retention, terminal run diagnostics, and absence of raw Google
   payloads.
9. Enable portal nominations for one Knox client user and verify the nomination
   appears once in the agency queue without a website lookup or crawl.
10. Complete agency review and verify the portal state changes to `Monitored`.
11. Update the public feature catalogue, feature-detail content, and relevant
   marketing navigation to describe nearby market discovery and governed client
   nominations without claiming competitor traffic measurement.
12. Observe API cost, quota, errors, and crawl health before enabling another
   client.

Rollback is independent at three levels: disable nearby discovery, revoke the
Google credentials, or pause site-intelligence crawling. Existing approved
domains and evidence remain available according to their retention rules.

## Success criteria

- A media buyer can confirm a client location and see nearby dealerships grouped
  by conservative dealer classification within a selected radius.
- The split map and ranked list communicate geography, brand, distance, and
  monitoring status without requiring marker-only interaction.
- A selected candidate can be reviewed, validated, approved, and indexed without
  copying a URL between systems.
- No candidate is crawled without an explicit human approval.
- Client users can nominate competitors without receiving crawler or provider
  controls, and agency approval remains mandatory.
- A portal nomination appears once in the agency queue and its status is visible
  to the nominating client.
- Google Places data handling and attribution follow Google's current published
  policies.
- Higher-priced website lookup occurs only after explicit candidate selection.
- Duplicate candidate, domain, and crawl creation are prevented.
- The existing domain registry and diagnostics remain usable when Google APIs
  are unavailable.

## Primary references

- [Google Places API Nearby Search (New)](https://developers.google.com/maps/documentation/places/web-service/nearby-search)
- [Google Maps JavaScript Nearby Search](https://developers.google.com/maps/documentation/javascript/nearby-search)
- [Google Places API supported place types](https://developers.google.com/maps/documentation/places/web-service/place-types)
- [Google Places API policies and attribution](https://developers.google.com/maps/documentation/places/web-service/policies)
- [Google Place ID storage guidance](https://developers.google.com/maps/documentation/places/web-service/place-id)
- [Google Maps Platform API usage details](https://developers.google.com/maps/billing-and-pricing/sku-details)
- [Automotive Site Intelligence design](./2026-08-01-automotive-site-intelligence-design.md)
