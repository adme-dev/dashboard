# Measurement Destination-Version Validation Design

## Goal

Allow every measurement destination to be tested or attested against its own
current configuration after another destination advances the parent
measurement profile version.

Today validation accepts one `expectedConfigVersion`, but compares it with both
`client_measurement_profiles.config_version` and
`conversion_destinations.config_version`. Those values legitimately diverge:
creating or updating destination B advances the profile and B, while destination
A retains the version of its own last configuration. A can then never be
validated, even when the operator submits A's current version.

## Concurrency Model

Configuration versions have two distinct owners:

- Profile mutations, approvals, and activation remain guarded by
  `client_measurement_profiles.config_version`.
- Provider tests, operator attestations, and recorded health evidence are
  guarded by the target `conversion_destinations.config_version`.

Validation must reject evidence when the target destination changed after the
operator loaded it. It must not reject evidence merely because an unrelated
destination advanced the profile.

The existing `expectedConfigVersion` request field remains unchanged. Its
meaning in provider-test and attestation flows is the destination version. No
database migration or public response-shape change is required.

## Backend Changes

### Provider-test reservation

`providerTestRepository.reserve` will select
`d.config_version AS destination_config_version` and compare the supplied
version with that value. It will no longer use the profile version for this
check. The reserved run's `config_version` will therefore identify the exact
destination configuration that the provider call exercised.

### Health evidence recording

`healthRepository.recordValidation` will continue locking the profile before
the destination. Retaining the lock order avoids introducing a deadlock
inversion with destination mutation transactions and provides the profile ID
needed for the audit row.

The repository will not compare the supplied version with the profile version.
After locking the destination, it will compare against the destination version.
The destination version becomes the version returned in evidence and written to
the validation audit row. A conflict reports the current destination version.

## Frontend Changes

`ClientMeasurementProviderTest` will receive and submit the target
destination's `configVersion`. The prop will be named for destination ownership
instead of profile ownership so a future caller cannot accidentally restore the
old behavior.

Operator attestation already submits `target.destination.configVersion`, so its
frontend request shape does not change.

This is an internal concurrency correction. It adds no fields, controls, or
other visible UI.

## Error Handling

The existing `MEASUREMENT_VERSION_CONFLICT` behavior remains:

- Provider-test reservation refuses a stale destination.
- Health evidence recording refuses a stale destination.
- The UI continues instructing the operator to reload and retry.

An unrelated profile change no longer produces a false conflict.

## Verification

Unit tests will prove:

- provider-test reservation compares the request with the destination version,
  including a profile-newer/destination-current case;
- health recording accepts a destination-current version when the profile is
  newer;
- health recording still rejects genuinely stale destination evidence and
  reports the destination's current version;
- the provider-test component submits the destination version.

The rollback-only PostgreSQL smoke test will create two destinations with
divergent versions, validate the older first destination through the real
health service and repository, and assert:

- the destination reaches `ready`;
- evidence and audit use that destination's version;
- the actor type satisfies the live database CHECK constraint;
- the transaction rollback leaves no scratch client or audit residue.

The focused measurement suite, full repository suite, production build, worker
size guard, and independent review run before shipping.

## Out of Scope

- Running provider tests against enabled live destinations.
- Evidence expiry or scheduled revalidation.
- Changing profile-level activation and approval concurrency.
- Cascading profile versions to every destination.
- Renaming `expectedConfigVersion` across unrelated profile APIs.
