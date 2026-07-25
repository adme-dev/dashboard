# CRM 360 Persona Provider Activation Runbook

Status: implemented activation phase  
Date: 2026-07-25

## Scope

This phase connects approved XeroFlow 360 persona cohorts to Meta Custom
Audiences and Google Ads Customer Match through Google Data Manager API v1.
It does not replace tracking, CRM, campaign analytics or persona intelligence.

## Activation gates

Every provider write requires:

1. Global and provider-specific audience-write switches.
2. An active provider connection mapped to the client.
3. The configured privacy minimum.
4. Current `marketing = granted` consent.
5. A normalized, matchable email or phone.
6. CRM do-not-contact and do-not-email controls to be clear.
7. Privacy and live approvals by different staff members.
8. Explicit provider Customer Match terms acceptance.
9. The client/provider emergency stop to be off.

No raw PII is written to activation tables. Email and phone are normalized and
SHA-256 hashed in the application immediately before export.

## Runtime flow

1. Live approval creates a durable export and queues `persona.audience.sync`.
2. The worker re-evaluates consent and matchability at execution time.
3. Eligible members are diffed against provider membership state.
4. Withdrawn or suppressed members are removed before additions.
5. Meta responses are reconciled synchronously.
6. Google request IDs are persisted and queue retries poll
   `requestStatus:retrieve`.
7. Every transition is recorded in an append-only provider audit table.

## Operational controls

- Global: `PERSONA_AUDIENCE_PROVIDER_WRITES_ENABLED`.
- Meta: `PERSONA_META_AUDIENCE_WRITES_ENABLED`.
- Google: `PERSONA_GOOGLE_AUDIENCE_WRITES_ENABLED`.
- Per client/provider: `emergency_stop`.
- Manual reconciliation: `Sync now`.
- Full removal: `Remove from provider`.

Turning a global switch off stops new work without deleting evidence. Turning
it back on requires an explicit retry of failed exports.

## Provider prerequisites

Meta requires an active client-mapped connection with `ads_management` access.

Google requires an active client-mapped connection whose OAuth grant includes
`https://www.googleapis.com/auth/datamanager`, Customer Match eligibility,
accepted terms and manager access when the client account is under an MCC.
Older Google connections without the Data Manager scope must reconnect.

## Production activation sequence

1. Apply migration `296_persona_audience_provider_activation.sql`.
2. Deploy the Pages application and queue routing.
3. Confirm provider connections are client-mapped.
4. Create a cohort request.
5. Complete privacy approval.
6. Complete live approval with a different staff account.
7. Confirm the export reaches `succeeded`.
8. Confirm provider audience diagnostics and match rate.
9. Test provider removal before activating additional clients.

Clients that fail a gate remain blocked with a specific reason and are never
silently uploaded.
