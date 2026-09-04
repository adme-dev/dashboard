# Werribee Toyota TikTok measurement activation

## Purpose and scope

This runbook controls the first TikTok Pixel plus Events API pilot for Werribee
Toyota on `https://rebtyota.com.au`, with the first-party tag served by XeroFlow.
It covers test evidence, approval, a seven-day live soak, pause, and rollback. It
does not authorise a production deployment or a live destination by itself.

TikTok recommends using Pixel and Events API together for website measurement.
When the same conversion is sent by both paths, both copies must use the same
`event_id` so TikTok can deduplicate them. Matching context can include TikTok
click/cookie identifiers and, where the client has approved it, normalised and
hashed contact data. XeroFlow must still apply its own consent and purpose rules
before any event is eligible for a destination.

Provider references:

- [TikTok API for Business developer portal](https://business-api.tiktok.com/portal/docs)
- [TikTok website data connection setup methods](https://ads.tiktok.com/help/article/website-data-connection-setup-methods?lang=en)
- [TikTok Events Manager and Test Events](https://ads.tiktok.com/help/article/about-tiktok-events-manager/)
- [TikTok matching guidance for Events API](https://ads.tiktok.com/help/article/how-to-set-up-matching-events-with-events-api?lang=en)
- [TikTok event deduplication](https://ads.tiktok.com/help/article/event-deduplication?lang=en)
- [TikTok Events API request reference](https://ads.tiktok.com/gateway/docs/index?doc_id=1771100984456193)

## Roles and evidence record

Assign four named roles before starting. A person may hold more than one
operational role, but the privacy approver and live approver must be different
XeroFlow team members.

| Role | Responsibility |
|---|---|
| Measurement operator | Configures the dormant destination and runs tests |
| Privacy approver | Confirms notice, consent categories, purposes, and data fields |
| Live approver | Reviews technical evidence and grants live approval |
| Media buyer | Confirms the correct TikTok advertiser, Pixel/Data Source, event names, and diagnostics |

Create one change record containing the client ID, profile/config version,
destination ID, TikTok Pixel/Data Source ID, owners, timestamps, provider request
IDs, screenshots, reconciliation results, and decisions. Never copy an access
token, cookie, click identifier, email, phone number, user agent, or raw request
body into the record.

## Preconditions

- The hostname allowlist contains only the approved Werribee web origins,
  including the exact production and test origins required by the site.
- The current privacy notice and consent manager expose a marketing decision to
  `xf.setConsent()` before marketing events are released.
- The XeroFlow tag captures TikTok `ttclid` and `_ttp` only after the applicable
  consent decision and carries the browser-owned event ID through the confirmed
  lead path.
- A TikTok destination exists in XeroFlow with `tiktok_pixel` and
  `tiktok_events_api` capabilities, the correct Pixel/Data Source ID, an active
  canonical-to-provider event mapping, and a purpose-scoped credential reference.
- The profile and destination are disabled and in `test` mode. The token itself
  exists only in the approved Cloudflare secret binding and is never pasted into
  XeroFlow logs, screenshots, tickets, or this runbook.
- The delivery worker and queue bindings are available in the environment under
  test. No unrelated client destination is changed for this pilot.

## 1. Establish the baseline

1. Open Agency → Clients → Werribee Toyota → Measurement → Signal Centre.
2. Record the current config version and confirm the profile reports `test` and
   disabled. Confirm the TikTok destination also reports `test` and disabled.
3. Select the last seven days. Record captured, consent-skipped, queued,
   accepted/delivered, rejected, and dead-letter counts before generating tests.
4. Open the client portal measurement view using a Werribee portal account.
   Confirm it shows aggregate health only and does not expose event identifiers,
   provider receipts, attribution values, contact data, or credentials.
5. In TikTok Events Manager, select the agreed Werribee Pixel/Data Source and
   capture its existing Overview, Test Events, Diagnostics, and Settings state.

Stop if the client, hostname, advertiser, or Pixel/Data Source cannot be
unambiguously matched. Do not infer a destination from its display name alone.

## 2. Exact browser and server test

1. In TikTok Events Manager → Test Events, start a fresh web test and copy the
   short-lived test event code into the XeroFlow provider-test form. Do not save
   it in source control or a ticket.
2. Open a clean test browser on the approved Werribee origin with developer tools
   recording Network and Console. Start with marketing consent denied.
3. Load a vehicle or campaign landing page. Verify XeroFlow records the consent
   decision but does not dispatch TikTok marketing signals. The Signal Centre
   should increase the consent-skipped count, not the TikTok delivered count.
4. Grant marketing consent through the real consent manager. Reload the same
   approved page and confirm the browser pixel becomes eligible.
5. Begin one enquiry and abandon it before confirmation. Confirm any mapped
   intent event is labelled as intent; it must not create `lead_created`.
6. Submit one clearly labelled synthetic enquiry through the authoritative form
   success path. Use test-safe contact data approved for this exercise.
7. In XeroFlow, run the TikTok provider test for the same canonical event using:
   `tiktok_test_events`, the current config version, a fresh UUID idempotency key,
   the browser-owned event ID, the approved page URL without query or fragment,
   the captured browser user agent, and at least one consent-eligible `ttclid` or
   `_ttp` value. Keep transient values out of the operator reason.
8. Confirm the result is `accepted`, has a provider request ID, and leaves a
   current ready evidence record. A network response alone is insufficient.
9. In TikTok Test Events, locate the browser and Events API copies. Confirm the
   event name and timestamp are plausible and that the same `event_id` is used
   for the same conversion. Follow TikTok’s Test Events/Payload Helper guidance
   for any provider warning.

Expected result: one confirmed conversion in XeroFlow, browser and server copies
that TikTok can deduplicate, no extra `lead_created` for the abandoned enquiry,
and no marketing delivery while consent was denied.

## 3. Diagnostics and failure checks

Inspect both XeroFlow destination health and TikTok Events Manager diagnostics.
Resolve every blocker before approval. In particular:

- `tiktok_test_evidence_pending` — run a fresh accepted provider test.
- `tiktok_test_evidence_stale` — repeat the test; evidence older than 24 hours
  is not activation evidence.
- `tiktok_events_api_credential_unavailable` — correct the purpose-scoped secret
  binding without exposing its value.
- `tiktok_pixel_id_missing` — verify the exact Werribee Pixel/Data Source ID.
- `missing_tiktok_event_id` — repair browser-to-server event ID propagation.
- `tiktok_browser_context_unavailable` — verify consent-eligible browser context
  reached the confirmed conversion.
- provider `4xx` or invalid-response classes — inspect the redacted diagnostic
  and TikTok Payload Helper, correct the mapping/payload, then create fresh test
  evidence.
- retryable/network failure — confirm queue/worker health and retry only after
  the underlying transport issue is understood.

Do not mark a destination healthy by editing its status directly. Health must be
derived from fresh accepted evidence and the absence of unresolved blockers.

## 4. Reconciliation gate

Use one recorded UTC window that starts before the first test and ends after all
deliveries settle. Compare:

| Evidence | Required result |
|---|---|
| Authoritative form/lead record | Exactly one confirmed synthetic lead |
| XeroFlow canonical events | Exactly one `lead_created` for that lead and event ID |
| XeroFlow provider test | Exactly one accepted TikTok test run with a provider request ID and fresh ready evidence |
| XeroFlow delivery lineage | One canonical row for the confirmed event and no normal live delivery while the destination remains dormant |
| TikTok Test Events | Browser/server copies visible with matching event name and shared `event_id` |
| Consent-denied test | No TikTok marketing delivery |
| Abandoned enquiry | No confirmed `lead_created` |
| Redaction review | No raw contact data, `ttclid`, `_ttp`, token, or request body in UI/log evidence |

Count differences must be explained event by event. Expected provider-side
deduplication is not an unexplained duplicate; a second XeroFlow canonical event
or delivery for the same idempotency key is. Repeat the test after any config
change because changes invalidate the prior version’s evidence and approvals.

### Automated readiness check

Place one currently authorised agency session in a temporary owner-readable JSON
file containing exactly one field: `cookie` or `authorization`. Set its file mode
to `600`; do not put the file inside the repository. Then run:

```bash
MEASUREMENT_BASE_URL=http://localhost:3000 \
MEASUREMENT_CLIENT_ID=<werribee-client-uuid> \
MEASUREMENT_AUTH_FILE=/secure/temporary/werribee-measurement-auth.json \
node scripts/verify-werribee-measurement.mjs
```

Use the deployed XeroFlow origin only when that environment is explicitly in
scope. The checker performs authenticated GET requests only, limits event lineage
to 100 confirmed events, and prints aggregate PASS/FAIL lines rather than API
response bodies. It exits non-zero when consented TikTok context, confirmed
conversions, delivery uniqueness, fresh test-mode destination evidence, or
redaction checks fail. Delete the temporary auth file after the evidence is
recorded.

## 5. Two-person approval and activation

1. The privacy approver reviews the exact purposes, consent behaviour, fields,
   retention, client notice, and data-processing arrangements. They record the
   `privacy` approval against the current config version with a concise reason.
2. A different team member reviews the accepted provider test, reconciliation,
   TikTok diagnostics, redaction evidence, queue health, and rollback owner. They
   record the `live` approval against that same config version.
3. Re-read readiness. It must report live eligible with no blockers and both
   approval kinds present. If the config version moved, stop and repeat the test
   and approvals.
4. The authorised operator activates the Werribee profile with a reason that
   references the change record, then verifies that the intended TikTok
   destination is live. Do not activate Meta, Google, GA4, or another client as
   an incidental part of this action.

## 6. Seven-day soak

For seven consecutive local calendar days after activation:

- Review Signal Centre delivery health at least each business morning.
- Review TikTok Events Manager Overview and Diagnostics daily.
- Reconcile confirmed Werribee leads to canonical `lead_created` events and
  TikTok delivery outcomes for the prior complete day.
- Record collection/delivery freshness, accepted/rejected/dead-letter counts,
  deduplication warnings, match-quality warnings, consent-skipped volume, and
  any operator action.
- Confirm the client portal remains aggregate and tenant-scoped.

The pilot passes only when all seven days are recorded, there are no unexplained
duplicates or missing confirmed leads, no unresolved critical diagnostic, no
identifier leakage, and retry/dead-letter volume has an accepted explanation.
Provider reporting and attribution totals may differ from XeroFlow because the
systems apply different processing and attribution rules; those differences must
be documented, not represented as guaranteed attribution.

## 7. Pause conditions

Pause the TikTok destination or the whole Werribee measurement profile
immediately if any of the following occurs:

- marketing events are sent without the required consent;
- data is sent to the wrong client, advertiser, Pixel/Data Source, or hostname;
- raw PII, credentials, `ttclid`, or `_ttp` appear in an operator/client surface;
- canonical or provider deliveries duplicate confirmed leads unexpectedly;
- confirmed leads are missing from the canonical ledger or delivery queue;
- a critical TikTok diagnostic persists after one controlled retry;
- error or dead-letter volume rises without an understood bounded cause.

Record the pause actor, time, scope, reason, last known good event, and incident
owner. Pausing is a safety control and does not erase evidence.

## 8. Rollback

1. Set the affected TikTok destination to `paused`. If consent, tenant routing,
   or collection is suspect, pause the entire Werribee measurement profile.
2. Confirm no new TikTok delivery claims are being produced. Allow any in-flight
   claim to settle; do not replay it blindly.
3. If the browser tag is implicated, disable the TikTok browser capability in
   the XeroFlow-owned tag configuration and publish through the normal approved
   deployment path. Do not remove the core consent or canonical event bridge.
4. Revoke or rotate the purpose-scoped TikTok secret if exposure is suspected.
   Update only the secret binding; never place the replacement value in the DB.
5. Reconcile the incident window, preserve provider request IDs and redacted
   diagnostics, and notify the privacy approver, live approver, media buyer, and
   client owner.
6. Fix in test mode, generate fresh provider evidence, and repeat reconciliation
   and both approvals before reactivation.

## Completion record

The activation is complete only when the seven-day soak passes and the change
record links the approved config version, two distinct approvers, accepted test
run, provider request ID, reconciliation table, diagnostics screenshots, daily
soak entries, and named rollback owner. Credentials and raw identifiers must not
be attached.
