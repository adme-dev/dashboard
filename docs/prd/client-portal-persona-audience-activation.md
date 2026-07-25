# Client Portal Persona & Audience Activation

## Purpose

Expose accurate, tenant-scoped persona and audience intelligence to client portal users while preserving the agency approval plane and person-level privacy controls.

## Evidence layers

1. Client-controller authorization records the client's intended advertising use, data ownership attestation, privacy notice and provider terms.
2. Person-level consent records the latest marketing choice for each resolved identity profile.
3. Suppression records exclude deleted, do-not-contact and do-not-email CRM people.
4. Agency approval requires the existing privacy and live approvals from distinct agency users.
5. Provider readiness requires a mapped active credential and, for Google, the Data Manager OAuth scope.

Client authorization never changes or manufactures person-level consent.

## Portal surface

`/portal/analytics/audiences` displays:

- identity linkage, matchability, consent coverage and export eligibility;
- canonical signal volume, freshness and source mix;
- active versioned persona definitions and targeting permissions;
- Google Ads and Meta connection and authorization readiness;
- activation request, approval, emergency-stop and latest export state;
- aggregate warnings without raw customer identifiers.

Primary contacts and portal users with approval permission can accept or withdraw client authorization for each provider.

## Dispatch safety

Migration 297 installs a database trigger on `crm_persona_audience_exports`.

- `sync` exports require current accepted client authorization.
- `remove` exports remain permitted after withdrawal so consent and authorization revocations can propagate.
- authorization events are append-only.

## Operating sequence

1. Confirm the client website or CRM records the applicable person-level marketing choice.
2. Connect and map the client's Google Ads and/or Meta account.
3. Have an authorized client contact accept provider authorization in the client portal.
4. Define a targeting-allowed persona cohort in the agency analytics workspace.
5. Complete privacy and live approvals using distinct agency users.
6. Queue synchronization and monitor additions, removals and provider errors in both portal and agency views.
7. Use withdrawal or the agency emergency stop to block future additions. Removal propagation remains available.
