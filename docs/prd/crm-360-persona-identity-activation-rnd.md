# CRM 360 Persona Identity and Activation R&D

## Purpose

Define how linked applications contribute first-party identity evidence, customer behavior, automotive product interest, social engagement, CRM lifecycle, and advertising outcomes to a governed 360 Persona system.

This system must improve customer service, lead reconciliation, attribution, social engagement, audience activation, AI personalization, and reporting without becoming covert cross-site fingerprinting or an uncontrolled global customer database.

## Reference applications and existing foundations

### Dashboard platform

Existing foundations include:

- Tracking events with `anon_id`, `session_id`, `event_id`, client scope, attribution, and consent snapshots.
- Canonical measurement profiles, destination mappings, activation approvals, outbox events, and delivery records.
- CRM people, opportunities, activities, merge suggestions, transactional merge handling, and merge logs.
- Destination-specific PII normalization and hashing.
- Social conversations linked to organic and paid campaign identities.

### Automotive dealer platform

The automotive reference includes:

- First-party `identify()` support in its tracking script.
- Anonymous-to-known resolution.
- Identity profiles and identifier confidence.
- Suggested merges and linked profile edges.
- Anonymous sibling consolidation after strong identity evidence.
- Tenant-aware identity resolution and mobile merge review.
- Audience membership and activation concepts.

### Vehicle marketplace

The marketplace contributes:

- Explicit and inferred vehicle-interest signals.
- Source-event provenance and confidence.
- Anonymous marketplace behavior.
- Buyer preferences, comparison behavior, saved vehicles, searches, and recommendations.
- Marketplace audience, event, advertising, and conversion infrastructure.

## Terminology

The 360 Persona ID is a customer identity concept. It is not an AI prompt persona, role, synthetic customer archetype, audience name, cookie, advertising platform ID, or CRM record ID.

Recommended terminology:

- `PlatformSubjectId`: private platform reconciliation root; never sent to browsers or advertising destinations.
- `PersonaId`: opaque tenant-scoped identity exposed to authorized linked applications.
- `GroupPersonaId`: optional motor-group or related-entity identity, enabled only by explicit governance.
- `AnonymousId`: first-party application or site identifier before a person is known.
- `LocalSubjectId`: application-owned customer, user, lead, contact, or profile identifier.
- `Identifier`: email, phone, login, provider subject, social subject, device, session, or other identity evidence.
- `IdentityLink`: evidence-backed relationship between a Persona and an identifier or local subject.
- `Trait`: an explicit or inferred fact with source, purpose, confidence, and expiry.
- `Segment`: a versioned rule selecting eligible Personas for a defined purpose.
- `ActivationId`: destination-scoped identifier or audience membership exported under policy.

## Core architectural decision

Use tenant-scoped Persona IDs as the operational identity contract.

A private platform subject may reconcile authorized tenant or group namespaces internally, but linked applications receive only their permitted `PersonaId`. Cross-client identity access, segment reuse, social data reuse, and advertising activation are prohibited by default.

A motor group may opt into a `GroupPersonaId` namespace only when all participating entities have:

- A defined organizational and data-controller relationship.
- Approved collection notices and privacy policy language.
- An explicit purpose and permitted-use matrix.
- Consent and suppression behavior.
- Data-access roles.
- Retention, export, deletion, and correction procedures.
- A signed technical activation and rollback approval.

## Identity namespaces

Every Persona belongs to an `identity_namespace`:

- Client namespace: default and required.
- Motor-group namespace: optional.
- Marketplace namespace: application-local only unless linked through approved evidence.
- Platform operations namespace: non-customer operational identities only.

Namespace must be included in:

- Persona IDs and lookups.
- Identifier tokens and uniqueness constraints.
- Events and idempotency keys.
- Cache keys and realtime channels.
- Segment definitions and membership.
- Activation exports and suppressions.
- Merge, split, export, correction, and deletion operations.
- AI and MCP execution context.

## Identity levels

### Level 1: Anonymous interaction

A first-party `AnonymousId` represents activity within an approved site or application and consent state. It must not be created through covert fingerprinting.

Allowed evidence can include:

- First-party cookie or local application identifier.
- Session ID.
- Browser event and form submission ID.
- Marketplace anonymous profile.
- App installation ID where platform policy and consent permit.

IP address, user agent, screen characteristics, or behavioral similarity may support fraud prevention or low-confidence diagnostics but must never auto-merge people.

### Level 2: Known tenant Persona

A `PersonaId` is created or resolved when reliable first-party evidence is available, such as:

- Authenticated account ID.
- Verified email or phone.
- Confirmed CRM person link.
- Provider lead ID linked to customer details.
- Confirmed form submission ID and provider webhook.
- Explicit identity-link action by an authorized user or customer.

### Level 3: Group Persona

A `GroupPersonaId` links tenant Personas without replacing them. Tenant-specific consent, suppression, history, ownership, and visibility remain separate.

### Level 4: Advertising or social activation

Advertising and social destinations receive destination-specific hashes, event IDs, click IDs, platform-scoped user IDs, or audience memberships. They never receive the internal Persona ID unless a platform explicitly supports an advertiser-generated external ID and policy authorizes a destination-specific derived value.

## Identity evidence and resolution policy

### Evidence classes

- `verified`: authenticated account, verified channel, signed provider identity, explicit customer confirmation.
- `deterministic`: exact first-party provider ID, form-to-webhook ID, CRM mapping, or destination-scoped social subject.
- `corroborating`: normalized email, normalized phone, first-party durable ID, authenticated cross-application transition.
- `probabilistic`: device similarity, IP, user agent, behavior, location, or household inference.

### Resolution rules

- Auto-link only with approved verified or deterministic evidence.
- Exact email or phone may create a candidate link but must detect shared, recycled, mistyped, or conflicting identifiers.
- Device and session evidence alone never merge known people.
- Probabilistic evidence creates `suspected_same_subject` edges only.
- Conflicting verified identifiers block automatic resolution and enter review.
- Every decision records rule version, evidence, confidence, actor, source, and time.
- A merge must be reversible through retained aliases, edge history, and split tooling.
- Downstream projections must process merge and split events idempotently.

## Recommended data model

### `identity_namespaces`

Defines tenant, group, purpose, owners, sharing policy, retention, and activation eligibility.

### `persona_profiles`

Contains opaque Persona ID, namespace, lifecycle state, first and last seen, canonical CRM link, resolution state, and redirect/survivor information. It should not become a wide trait table.

### `persona_identifiers`

Stores identifier type, source application, encrypted normalized value where required, keyed HMAC token for internal matching, verification state, confidence, valid period, purpose, consent reference, and revocation state.

Destination SHA-256 hashes are generated only at activation time. They are not the internal identity key.

### `persona_local_mappings`

Maps application and local subject IDs to Persona IDs. Examples include CRM person, marketplace user, mobile user, website anonymous profile, provider lead, and social-platform subject.

### `persona_identity_edges`

Stores links between Personas, identifiers, local subjects, households, organizations, or group profiles with evidence class, confidence, status, rule version, and expiry.

### `persona_resolution_decisions`

Records candidate sets, selected result, alternatives, evidence, conflicts, policy, automated or human actor, and reason.

### `persona_merge_history`

Stores survivor, absorbed profile, snapshot, child projections, actor, reason, rollback data, and split status.

### `persona_traits`

Stores explicit or inferred trait, value, source event, source application, confidence, purpose, consent, occurred time, effective time, expiry, model or rule version, and correction state.

### `persona_segment_definitions`

Stores versioned rule, namespace, purpose, owner, prohibited inputs, minimum cohort size, lookback, expiry, destination eligibility, and approval.

### `persona_segment_memberships`

Stores definition version, Persona, qualification evidence, joined, refreshed, exited, and suppression state.

### `persona_activation_runs`

Stores destination, connection, audience, segment snapshot, policy decision, consent snapshot, input count, suppressed count, exported count, provider result, match metrics, removal status, expiry, and audit artifact.

### `persona_suppressions`

Stores person-, identifier-, namespace-, channel-, purpose-, and destination-level suppression with source and effective time.

## Linked application contract

Applications must not read or write identity tables directly. They use the Persona service.

### Identify request

```json
{
  "schemaVersion": "persona.identify/v1",
  "eventId": "evt_...",
  "applicationId": "vehicle-marketplace",
  "namespaceId": "ns_...",
  "localSubjectId": "local_...",
  "anonymousId": "anon_...",
  "browserEventId": "browser_...",
  "identifiers": [],
  "evidence": [],
  "consentSnapshotId": "consent_...",
  "occurredAt": "2026-07-24T00:00:00.000Z"
}
```

### Identify response

Return only:

- Tenant-scoped `PersonaId`.
- Resolution state: `anonymous`, `known`, `candidate`, `conflict`, or `suppressed`.
- Allowed local mapping.
- Policy-safe next action.

Do not return raw identifiers, cross-client matches, group membership, hidden confidence evidence, or activation mappings to browser callers.

### Persona APIs

- `POST /v1/personas:identify`
- `GET /v1/personas/{personaId}`
- `POST /v1/personas/{personaId}/identifiers`
- `POST /v1/personas/{personaId}/traits`
- `GET /v1/personas/{personaId}/timeline`
- `GET /v1/personas/{personaId}/consent`
- `POST /v1/personas:merge-suggestions`
- `POST /v1/personas:merge`
- `POST /v1/personas:split`
- `POST /v1/personas/{personaId}:export`
- `POST /v1/personas/{personaId}:correct`
- `POST /v1/personas/{personaId}:delete`

All routes require trusted execution context, namespace authorization, purpose, audit reason, and idempotency.

## Canonical identity events

- `persona.anonymous_created`
- `persona.identifier_observed`
- `persona.identifier_verified`
- `persona.local_subject_linked`
- `persona.resolved`
- `persona.candidate_detected`
- `persona.conflict_detected`
- `persona.merged`
- `persona.split`
- `persona.trait_recorded`
- `persona.trait_expired`
- `persona.consent_changed`
- `persona.suppressed`
- `persona.segment_entered`
- `persona.segment_exited`
- `persona.activation_requested`
- `persona.activation_completed`
- `persona.activation_removed`
- `persona.exported`
- `persona.corrected`
- `persona.deleted`

Every event carries namespace, schema version, correlation, causation, idempotency, actor, purpose, consent reference, and provenance.

## End-to-end identity flows

### Website form to provider webhook and CRM

1. Tracking creates anonymous and session IDs under the consent policy.
2. Form intent receives a shared `browserEventId`.
3. Confirmed provider webhook supplies provider lead ID and customer details.
4. Persona service links the browser event and provider lead deterministically.
5. CRM creates or links the canonical person and keeps the provider lead as a separate source record.
6. Product interest, attribution, campaign, landing page, and social/ad click identifiers attach to the Persona timeline.
7. CRM promotion creates an opportunity without merging distinct enquiries.

### Marketplace behavior to CRM

1. Marketplace sends explicit and inferred vehicle-interest signals with local subject or anonymous ID.
2. Persona service resolves only within the authorized namespace.
3. Explicit preferences override weaker inferred values in the CRM projection.
4. CRM displays provenance, confidence, and expiry.
5. Marketplace receives only purpose-limited lifecycle feedback, not the unrestricted CRM profile.

### Social engagement

1. Social webhook records platform, connection, page/account, platform-scoped subject, message/comment/lead ID, campaign identity, and event ID.
2. Platform-scoped subjects remain separate identity identifiers.
3. A deterministic link may be created through a lead form, authenticated social login, verified communication, or authorized CRM match.
4. Likes, comments, views, sentiment, and follows become engagement signals, not automatic person merges.
5. Direct message and comment content follow channel-specific retention and access rules.
6. Social responses, lead capture, and audience activation check purpose and channel consent independently.

### Advertising conversion measurement

1. Browser and server conversion copies share the same canonical event ID.
2. Persona service supplies only eligible destination matching identifiers.
3. Activation service applies destination-specific normalization and hashing.
4. Destination delivery records event, consent, policy, payload fingerprint, and provider response.
5. Provider match or audience size metrics remain activation diagnostics, not identity evidence.

## Social engagement integration

Persona 360 can improve social operations through:

- A unified timeline of permitted comments, DMs, lead ads, campaign interactions, and CRM outcomes.
- Recognition of repeat social enquiries after deterministic linking.
- Social response priority based on customer lifecycle and unresolved handoffs.
- Campaign feedback and sentiment by audience and vehicle cohort.
- Exclusion of converted, opted-out, unavailable-product, complaint, or vulnerable-customer cohorts.
- Attribution from social campaign and creative through lead, appointment, opportunity, and sale.
- Frequency and fatigue monitoring across paid and owned channels.

It must not:

- Infer a real person solely from a public social profile or engagement.
- Scrape or combine platform data outside platform terms and approved APIs.
- Treat sentiment, political views, health, ethnicity, religion, sexuality, or other sensitive inference as advertising traits.
- Allow staff to search cross-client identities.
- Make private social content broadly visible in AI or MCP tools.

## Audience and advertising activation

### Segment governance

Each segment requires:

- Namespace and client owner.
- Business purpose.
- Rule version and lookback window.
- Eligible source applications and traits.
- Consent requirements.
- Sensitive-trait prohibition.
- Minimum audience threshold.
- Destination allowlist.
- Membership and export expiry.
- Human approval for first activation and material rule changes.
- Suppression and deletion propagation.

### Activation pipeline

1. Freeze an immutable segment-membership snapshot.
2. Evaluate consent, purpose, destination policy, client authorization, age/sensitivity restrictions, and suppressions.
3. Apply minimum cohort thresholds.
4. Normalize and hash identifiers in an isolated activation worker.
5. Upload through approved provider APIs.
6. Store only necessary provider audience IDs and operation results.
7. Reconcile accepted, rejected, expired, and removed memberships.
8. Propagate opt-outs and deletion requests.
9. Expire the export and remove stale memberships automatically.

### Destination separation

- Google Customer Match activation uses first-party data and the provider's approved interfaces and consent fields where required.
- Meta customer-list activation requires the client to have the necessary rights, permissions, authority, and lawful basis.
- TikTok Pixel and Events API copies use the same `event_id` for deduplication; matching identifiers remain destination-specific.
- Platform match rates do not prove that two internal profiles are the same person.

## Consent and purpose model

Do not use a single marketing boolean for Persona 360.

Model separate purposes:

- Essential account and security identity.
- CRM service delivery.
- Analytics and measurement.
- Cross-application personalization.
- Direct email marketing.
- SMS marketing.
- Telephone marketing.
- Social engagement and response.
- Advertising measurement.
- Advertising personalization and audience activation.
- Group-wide identity sharing.
- AI personalization.
- MCP exposure.

Consent records need subject, namespace, purpose, status, collection point, notice version, source, market, effective time, expiry, withdrawal, and evidence.

A withdrawal must stop future processing and enqueue suppression/removal operations without deleting audit evidence required to prove compliance.

## Privacy and legal design constraints

For the Australian launch:

- Conduct a privacy impact assessment before cross-application identity or audience activation.
- Provide clear notices about collection, linked applications, profiling, third-party platforms, purposes, and opt-out controls.
- Apply APP 6 purpose limitations and APP 7 direct-marketing controls.
- Provide a simple opt-out and honor it across CRM marketing and audience activation.
- Support access, source disclosure, correction, deletion/retention decisions, and pseudonymous interaction where appropriate.
- Review Spam Act and Do Not Call obligations separately from APP 7.
- Review cross-border disclosures and provider terms for each destination.

Official references reviewed:

- OAIC tracking pixels and privacy obligations: https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/organisations/tracking-pixels-and-privacy-obligations
- OAIC direct marketing guidance: https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/organisations/direct-marketing
- OAIC Australian Privacy Principles: https://www.oaic.gov.au/privacy/australian-privacy-principles/read-the-australian-privacy-principles
- Google Customer Match policy: https://support.google.com/google-ads/answer/6299717
- Google Customer Match consent: https://support.google.com/google-ads/answer/14546648
- Meta Customer List Custom Audiences Terms: https://www.facebook.com/legal/terms/customaudience
- TikTok event deduplication: https://ads.tiktok.com/help/article/event-deduplication
- TikTok Events API matching: https://ads.tiktok.com/help/article/how-to-set-up-matching-events-with-events-api

This section is an engineering control specification, not legal advice. Launch requires jurisdiction-specific legal review.

## Security design

- Keep directly identifying values in a separately encrypted identity vault.
- Use versioned keyed HMAC tokens for internal exact matching, not unsalted SHA-256.
- Generate destination hashes just in time in an isolated activation worker.
- Restrict raw identifier access by role, purpose, and break-glass audit.
- Never log raw PII, identifier tokens, audience payloads, or provider credentials.
- Use envelope encryption and rotation-aware key versions.
- Separate keys and activation connections by client and environment.
- Protect identify endpoints against enumeration, replay, poisoning, and mass linkage.
- Rate-limit merge suggestions and require step-up approval for bulk merge or activation.
- Add canary identities and cross-tenant leakage detection.
- Ensure AI and MCP tools receive a redacted Persona projection rather than identity-vault access.

## Corrections to existing patterns

### Avoid a global durable cookie

The reference automotive migration uses a two-year durable cross-site ID. Our platform should use first-party, namespace-aware identifiers with notice, consent, configurable retention, and no covert browser fingerprinting. Cross-domain linking should use explicit signed transitions, authenticated identity, or confirmed submission/provider evidence.

### Do not auto-merge at low confidence

The reference resolver allows resolution above a relatively low combined threshold. For CRM records, false merges are more damaging than missed links. Automatic merge should require verified or deterministic evidence; all weaker evidence remains a candidate edge.

### Do not rewrite provider-normalized email as canonical identity

Provider-specific normalization, such as removing aliases, may improve matching but can conflate distinct addresses. Preserve the raw verified address and use conservative internal normalization. Generate provider-specific normalized hashes only for that destination.

### Replace salted concatenated hashes with HMAC

The dashboard's per-tenant salted SHA-256 audit hash is useful as an audit hint, but a keyed HMAC with key versioning is safer for internal identifier tokens and rotation.

### Make CRM merges reversible

The existing CRM merge transaction safely reassigns children and logs the merge, but deletion of the losing record complicates split. Persona architecture should retain aliases and pre-merge snapshots so mistaken merges can be reversed and propagated.

### Separate segment membership from profile state

Do not store an array of audience names on the identity record. Use versioned segment definitions and membership rows with evidence, entry, refresh, exit, suppression, and export history.

## Observability and quality

Monitor:

- Anonymous-to-known resolution rate.
- Deterministic, candidate, conflict, merge, and split counts.
- False-merge reports and rollback success.
- Identifier collision and shared-identifier rates.
- Events missing namespace, consent, Persona ID, source, or correlation ID.
- Cross-application mapping latency.
- Trait provenance, confidence, and expiry coverage.
- Segment qualification, suppression, expiry, and minimum-size failures.
- Activation accepted, rejected, matched, removed, and stale membership counts.
- Opt-out propagation latency.
- Cross-tenant access denials and leakage canary alerts.
- Provider-specific event deduplication and match-quality diagnostics.

## Recommended rollout

### Phase 0: Governance

- Complete data inventory, system-of-record matrix, PIA, purposes, notices, retention, and client/group agreements.
- Approve identity namespaces and prohibit default cross-client resolution.

### Phase 1: Tenant Persona foundation

- Add namespace, profile, identifier, local mapping, evidence, decision, consent, and merge-history contracts.
- Resolve CRM people and confirmed provider leads only.
- Keep existing anonymous tracking unchanged until the service is proven.

### Phase 2: Website identity continuity

- Add first-party `identify()` and shared browser submission IDs.
- Link anonymous website activity to confirmed leads deterministically.
- Add Persona timeline and resolution diagnostics.

### Phase 3: Marketplace and automotive signals

- Link marketplace local subjects under approved namespace mappings.
- Import explicit vehicle preferences first, then reviewed inferred traits.
- Attach product interests, searches, watches, and recommendations with provenance and expiry.

### Phase 4: Social identity and engagement

- Add platform-scoped social subject mappings, comments, DMs, and lead-ad evidence.
- Link only through deterministic provider or CRM evidence.
- Add social timeline, campaign feedback, response priority, and suppression.

### Phase 5: Manual audience activation pilot

- Build versioned segments, immutable snapshots, minimum thresholds, suppressions, and isolated destination exporters.
- Require manual approval and use exclusions or measurement pilots before automated targeting.

### Phase 6: Closed-loop advertising

- Add provider-specific audience synchronization, conversion feedback, lifecycle suppression, and expiry.
- Reconcile provider operations without treating platform matches as identity truth.

### Phase 7: AI, mobile, and MCP

- Expose redacted, purpose-filtered Persona projections.
- Add AI next-best-action and receptionist context only after consent, provenance, and evaluation controls pass.
- Expose MCP identity capabilities as read-limited tools initially; merge, activation, export, and deletion remain approval-gated actions.

## Definition of success

Persona 360 is ready when:

- Every linked application uses a tenant-scoped Persona contract rather than shared tables.
- Anonymous activity can be deterministically linked to confirmed leads without double counting.
- Marketplace and social signals retain source, purpose, confidence, and expiry.
- Cross-client access is impossible without an approved group namespace.
- Merge and split are reversible and reconciled across projections.
- Consent withdrawal removes future activation and communication eligibility promptly.
- Advertising exports are destination-scoped, approved, minimum-size checked, and auditable.
- AI, mobile, and MCP receive only policy-filtered Persona views.
- Identity quality improves attribution and engagement without relying on covert fingerprinting.

## 360 pool and lakehouse separation

The linked automotive applications already maintain local Persona IDs, tracking, and audiences. These should participate in a federated 360 pool rather than being replaced by one application's identity table.

The central platform separates:

- A transactional identity control plane for namespace mappings, evidence, resolution, merge, split, consent, and suppression.
- A low-latency operational Persona projection for CRM, receptionist, mobile, AI, and MCP.
- An immutable analytical lake for cross-application events, historical resolution versions, traits, cohorts, attribution, and activation evidence.

The lake stores opaque Persona and namespace references and remains pseudonymous by default. PII and raw private content remain in governed vaults. Identity decisions are made by the control plane and published into the lake as versioned mappings; the lake never independently merges people.

Detailed lake zones, application ownership, Cloudflare storage options, contracts, and rollout are maintained in `docs/prd/crm-360-persona-lakehouse-architecture.md`.
