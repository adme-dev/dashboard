# Website Audience Intelligence — Design

**Date:** 2026-08-01

**Status:** Approved for implementation planning

**Surface:** XeroFlow Agency internal analytics

**Route:** `/agency/analytics/audiences`

## Purpose

Give the marketing team one agency-wide view of every first-party website tracking
endpoint so they can verify collection health, understand audience trends, compare
clients, identify conversion opportunities, and ask evidence-backed questions about
the data.

This is a read-only intelligence layer over XeroFlow's existing tracking and lead
reconciliation data. It does not create provider audiences, change campaigns, or
activate destinations.

## Product decision

The MVP is an agency-wide **Website Audiences** overview with client drill-down.
It sits inside the existing Analytics area as a route-backed tab rather than loading
cross-client website queries on the existing campaign analytics route.

The first release prioritises:

1. collection coverage and freshness across all provisioned domains;
2. audience and engagement movement over time;
3. lead intent and confirmed-outcome visibility;
4. acquisition and content-quality breakdowns;
5. comparison between accessible clients; and
6. grounded AI interpretation of the same deterministic facts.

Provider audience activation is a later phase. It requires separate consent,
minimum-size, destination-readiness, and approval controls.

## Existing foundations

The implementation builds on:

- `tracking_sites` for client/site configuration and allowed origins;
- `tracking_events` for first-party behavioural events;
- `lead_submission_intents` for the short-lived, PII-minimised bridge between a
  browser form action and a confirmed lead;
- `leads` and existing lead-health services for confirmed outcomes and attribution;
- existing per-client tracking analytics under `/agency/tracking/[clientId]`;
- existing portal tracking analytics and lead-health calculations;
- existing agency analytics AI routing and grounded-answer conventions; and
- `requireClientTrackingAccess` and client-team assignments for per-client scope.

No database migration is planned for the MVP. If real production query latency
shows that raw-event aggregation is no longer suitable, daily rollups will be
designed as a separate optimisation.

## Information architecture

### Route and navigation

Add `/agency/analytics/audiences` as the canonical route for Website Audiences.
The Analytics navigation presents route-backed tabs for the existing analytics
surface and Website Audiences. The route must be directly linkable and preserve
its filter state in query parameters where practical.

### Page hierarchy

The page renders these sections in order:

1. shared date/client controls;
2. AI Audience Briefing and follow-up question input;
3. tracking coverage;
4. audience KPI cards;
5. audience trend chart;
6. deterministic opportunity cards;
7. acquisition and behaviour breakdowns; and
8. sortable client comparison table.

Selecting a client row opens that client's existing website analytics drill-down.

## Filters and reporting window

- Default window: trailing 30 complete/in-progress local calendar days.
- Presets: 7, 30, and 90 days.
- Custom agency-wide ranges are capped at 90 days.
- The comparison window is the immediately preceding window of equal length.
- Optional client filter narrows every panel and the AI grounding to one accessible
  client.
- Dates are interpreted using each client's reporting timezone for per-client
  aggregation. Agency daily totals are returned as ISO day keys with the response
  documenting its bucketing convention.

The UI uses the project-standard `UPopover` plus `UCalendar` pattern for custom
dates. All filters use Nuxt UI v4 controls and preserve dark-mode styling.

## Tracking coverage

Coverage is calculated from active and inactive `tracking_sites` plus the latest
non-noise event per site.

Statuses are deliberately phrased as observations, not installation claims:

| Status | Definition |
|---|---|
| Receiving data | Latest qualifying event is no more than 24 hours old |
| Stale | Latest qualifying event is more than 24 hours but no more than 7 days old |
| No recent data | Latest event is older than 7 days |
| Never received | No qualifying event exists for the site |
| Inactive | `tracking_sites.is_active = false` |

The coverage panel shows site/domain name, client, status, latest event time, event
volume for the selected window, and links to the existing install/diagnostic flow.
Low-traffic sites may legitimately be stale, so the UI must not call a site
"broken" solely from event recency.

## Metrics

### Primary audience metrics

| Metric | Definition |
|---|---|
| Unique visitors | Distinct `anon_id` values in the selected window |
| Sessions | Distinct non-null `session_id` values |
| Page views | `page_view` event count |
| Engaged sessions | Sessions containing an `engagement` event |
| Engagement rate | Engaged sessions divided by sessions |
| Repeat visitors | Anonymous visitors with more than one distinct session in the selected window |
| Lead actions | Sessions containing `form_submit`, `phone_click`, `generate_lead`, or test-drive intent |
| Confirmed leads | Distinct matched leads reconciled from eligible website submission intents |
| Visitor-to-lead rate | Confirmed leads divided by unique visitors |
| Attribution coverage | Confirmed leads with usable first- or last-touch campaign attribution divided by confirmed leads |

Every KPI includes its value, prior-period value where available, and percent or
absolute change with safe zero-denominator behaviour.

### Trend series

The daily chart supports:

- unique visitors;
- sessions;
- engaged sessions;
- lead actions; and
- confirmed leads.

The selected series is compared with the equivalent preceding period. Missing days
are zero-filled server-side so the chart does not imply gaps in rendering.

### Breakdowns

Ranked breakdowns cover:

- source;
- campaign;
- landing/page URL;
- paid, organic, and direct traffic;
- device category; and
- content or vehicle interest where the event taxonomy supplies it.

Rows include enough quality context to avoid ranking by volume alone: visitors,
sessions, engagement rate, lead actions, confirmed leads, and confirmed-lead rate
where applicable.

## Deterministic audience opportunities

Opportunity rules are calculated in SQL or pure TypeScript before any AI call. The
MVP returns aggregate counts and supporting metrics only; it does not expose or
export visitor identifiers.

Initial rules:

1. **High-intent non-converters** — sessions with strong engagement, deep scroll,
   or multiple relevant content/vehicle views and no lead action.
2. **Repeat non-converters** — anonymous visitors with multiple sessions and no
   recorded lead action in the selected window.
3. **Multi-interest visitors** — visitors who viewed multiple distinct vehicle or
   product references.
4. **Weak paid engagement** — paid-attributed sessions whose engagement rate is
   materially below the accessible agency or client baseline.
5. **Strong organic landing pages** — organic landing pages with meaningful volume
   and above-baseline engagement or confirmed-lead rate.
6. **Intent/outcome divergence** — clients whose lead intent rises while confirmed
   leads fall relative to the comparison window.

Rules must publish their thresholds and input metrics in the response so the UI and
AI can explain why an opportunity appeared. Thresholds with insufficient sample
size return `insufficient_data` rather than a recommendation.

## Client comparison

The sortable client table contains:

- client name;
- site count and worst current collection status;
- visitors;
- engagement rate;
- lead actions;
- confirmed leads;
- visitor-to-lead rate;
- attribution coverage;
- period-over-period direction; and
- latest event time.

Rows are limited to clients the current user may access. Management roles can see
all clients allowed by existing policy; scoped roles see assigned clients only.
Counts and agency totals must be computed from that same accessible client set.

## API design

Create these internal Nitro boundaries:

### `GET /api/agency/tracking/audiences/overview`

Query: `from`, `to`, optional `clientId`.

Returns:

- validated window and comparison window;
- tracking coverage summary and site rows;
- current and previous KPI totals;
- deterministic opportunity cards; and
- accessible client comparison rows.

### `GET /api/agency/tracking/audiences/timeseries`

Query: `from`, `to`, optional `clientId`, optional allowlisted metric.

Returns current and previous zero-filled daily series plus timezone/bucketing
metadata.

### `GET /api/agency/tracking/audiences/breakdowns`

Query: `from`, `to`, optional `clientId`, and an allowlisted dimension. Limits are
bounded server-side. Dimension names map to fixed SQL expressions and are never
interpolated from arbitrary user input.

### `POST /api/agency/tracking/audiences/ask`

Body: question, range, and optional client scope.

The handler obtains the caller's accessible aggregate facts through the same shared
service used by the dashboard. It sends a compact redacted payload to the configured
Groq model and returns:

- concise answer or briefing;
- structured grounding facts;
- reporting window;
- accessible scope; and
- generation timestamp.

The endpoint rejects empty questions, invalid ranges, and inaccessible clients. It
uses the existing AI model registry, audit metadata, low temperature, and stable
feature key conventions.

## Shared server services

Extract shared calculations rather than copying portal SQL into agency routes.
Suggested boundaries:

- audience range parsing and comparison-window calculation;
- accessible-client scope resolution;
- site health derivation;
- KPI and per-client aggregation;
- trend zero-filling;
- dimension aggregation;
- deterministic opportunity evaluation; and
- compact AI grounding construction.

Portal response contracts must not be changed accidentally. Shared services may be
introduced underneath current portal handlers only when tests prove equivalent
behaviour.

## AI Audience Analyst

The AI layer has two read-only experiences:

1. an audience briefing summarising meaningful movements, tracking concerns,
   conversion gaps, and recommended next actions; and
2. an Ask Audience Analyst input for follow-up questions.

The model may use only supplied aggregates and must cite concrete supporting
numbers. If the facts do not answer a question, it says so. Recommendations are
labelled as recommendations and cannot mutate tracking, campaigns, leads, or
provider audiences.

The model input must exclude:

- `anon_id` and `session_id`;
- click identifiers;
- lead fingerprints;
- email, phone, or other contact fields;
- raw event payloads; and
- clients outside the caller's resolved scope.

If generation fails, deterministic metrics and opportunity cards remain available.
AI is initiated on demand in the MVP to avoid repeated model cost on normal page
loads. The briefing can be requested with a provided prompt preset.

## Permissions and privacy

- Every endpoint requires an agency role already authorised for client or media
  analytics.
- Client scope is enforced server-side before aggregation, not by filtering a
  broader response in the browser.
- A supplied `clientId` outside the caller's scope returns the established
  not-found/forbidden behaviour without leaking tenant existence.
- API responses contain aggregate marketing data only.
- The AI boundary receives the same or less data than the browser response.
- Existing retention and consent policy remains authoritative; this feature does
  not extend retention.

## UI behaviour

- Each section has its own loading, empty, and error state.
- A partial request failure does not blank the whole page.
- Empty states distinguish no events in the selected window from a site that has
  never sent an event.
- The last generated/received timestamp remains visible alongside insights.
- Tables remain usable on small screens through responsive column reduction or
  controlled horizontal overflow.
- All interactive controls use Nuxt UI v4, keyboard-accessible labels, semantic
  colours, and light/dark variants.
- Client and date selections are shareable through the URL where practical.

## Performance boundaries

- Agency-wide range is capped at 90 days.
- Queries operate only on the resolved accessible client IDs.
- Breakdown result counts and AI grounding rows are bounded.
- Independent endpoint calls allow the page to render progressively.
- SQL uses existing client/time and session indexes and avoids returning raw event
  rows to the application layer.
- Query duration should be instrumented. A sustained production p95 above 1.5
  seconds for an aggregation endpoint triggers evaluation of a daily rollup table
  and supporting indexes.

## Error handling

- Invalid dates or `from > to`: `400` with a stable validation message.
- Range beyond 90 days: `400` with the supported maximum.
- Unknown dimension or metric: `400`.
- Inaccessible client: established `403`/`404` access behaviour.
- No data: successful zero/empty response.
- AI provider failure: AI endpoint returns a controlled unavailable response; the
  page retains deterministic insights.
- Database/provider implementation details, SQL, stack traces, and secrets are
  never returned.

## Testing strategy

Implementation follows TDD.

### Unit tests

- range parsing and equal-length comparison windows;
- health status thresholds;
- percentage and zero-denominator calculations;
- repeat/high-intent opportunity rules and minimum sample gates;
- paid/organic/direct and device classification reuse;
- zero-filled trend series; and
- AI grounding redaction.

### API and access tests

- management visibility across clients;
- assignment-scoped visibility;
- explicit inaccessible-client rejection;
- agency totals built only from accessible clients;
- empty and partially instrumented clients;
- current/previous window aggregation;
- confirmed lead reconciliation and attribution coverage;
- allowlisted dimensions and limits;
- AI input uses only redacted grounding; and
- AI failure does not affect deterministic endpoints.

### Component tests

- route-backed navigation;
- filters update requests and shareable state;
- independent loading, empty, and error states;
- trend metric switching;
- opportunity explanation rendering;
- client sorting and drill-down links; and
- AI grounding disclosure.

### Verification

- focused Vitest suites;
- lint/type checks applicable to modified files, with pre-existing repository
  errors reported separately;
- production build;
- desktop and mobile browser validation;
- light and dark mode inspection; and
- final review of every modified file against project pre-commit rules.

## Public feature-page sync

Update the relevant analytics feature entries in:

- `app/pages/features/index.vue`;
- `app/pages/features/[slug].vue`; and
- `app/components/MarketingNav.vue` only if the existing analytics navigation copy
  requires a new top-level entry.

The public copy must describe aggregate audience intelligence and grounded AI
analysis without claiming that provider audience activation exists in the MVP.

## Out of scope

- visitor-level profile or identity browser;
- raw PII exposure;
- audience export or provider sync;
- automatic campaign or budget changes;
- AI-initiated mutations;
- new consent collection;
- changes to event retention;
- production deployment; and
- daily aggregate tables unless measured latency justifies a later design.

## Success criteria

The MVP is successful when an authorised marketer can:

1. see which accessible tracking endpoints are receiving or missing data;
2. compare audience and lead-quality movement across the selected period;
3. identify clients, sources, pages, and audience patterns that merit action;
4. drill into an existing client website analytics view;
5. receive an AI explanation grounded in visible, reproducible metrics; and
6. use the page without exposing visitor identities or permitting automated
   campaign changes.
