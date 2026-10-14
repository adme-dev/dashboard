# Big Garage enquiry intake and tracking repair

Email intake successfully parsed and staged an ADF enquiry but could not create its
canonical lead. The conversion event written in the same transaction included
`utm_source`, `utm_medium`, `provider`, `email_endpoint_id`, `parser`,
`confidence_band`, and `transport`. The application contract allowed these fields;
the database attribution whitelist did not. PostgreSQL rejected the conversion
event and rolled back the lead.

Migration 451 extends that whitelist, preserving existing browser/advertising keys
and the separate object-shape and contact-data restrictions. Apply it atomically,
for example with `psql --single-transaction --set ON_ERROR_STOP=1 --file ...`.
No application build or dealer-platform source change is needed for this repair.

## Verification

- A temporary PostgreSQL table reproduced SQLSTATE `23514` for email metadata
  before the migration. It passed after the migration, including a second apply.
- The regression test also preserves existing advertising attribution and rejects
  email addresses, phone numbers, full names, unknown keys, and non-object values.
- The PostgreSQL, existing email-ingestion, and conversion-outbox suites passed:
  53 tests across three files.
- Production constraints were updated and validated at
  `2026-10-14T08:46:18.897Z`. The separate privacy restrictions were unchanged.
- The retained Subaru enquiry had exhausted its retries at
  `2026-10-14T08:45:48.389Z`, before the repair. An operator-authorized, audited
  recovery allowance restored one attempt. The existing recovery worker accepted
  the retained delivery at `2026-10-14T10:01:44.079Z` and created one non-test lead
  visible through the client's enabled portal rule. No second email was sent.

## Client configuration repaired

The Big Garage client now maps its main, LDV and Volkswagen Google Ads accounts,
its Meta account, and six existing GA4 properties including Subaru. GA4 daily
channel data was refreshed from 1 September 2026. Reporting timezone was corrected
to Australia/Melbourne.

The migrated dealer sites retained their legacy GTM identifiers in onboarding
metadata, but their active GTM settings were empty and disabled. The recorded
containers were restored for Subaru (`GTM-PNC9DTV`), Nissan (`GTM-PRTQM7R`),
LDV (`GTM-K7SB7HFZ`), and Volkswagen (`GTM-PRWC9FW`). Other analytics, consent,
and dealer settings were preserved. Restored configuration is not proof of new
browser event ingestion; that requires a live browser check or fresh events.

Six client-scoped ADF intake addresses and portal rules connect the platform's
Subaru, Nissan, LDV, Volkswagen, Foton and Suzuki enquiry routes to The Big Garage.
In total, 96 existing active non-careers routing rules gained the intake
destination. Existing staff destinations were preserved. The existing Subaru
enquiry provided the delivery verification; historical enquiries were not bulk
imported. Intake address tokens and customer data are excluded from this record.

## Remaining verification and access

The Google Analytics connection can read reports but cannot create enquiry key
events: Google returned `403 ACCESS_TOKEN_SCOPE_INSUFFICIENT`. This requires a
fresh Analytics authorization with edit permission. No key-event change succeeded.

Browser automation was blocked by the browser surface's security-policy check;
live UI and browser-script execution could not be verified in this session.
Client users and invitations remain deferred at the owner's request. No client
login, password, or access assignment was created.
