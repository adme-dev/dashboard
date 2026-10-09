# XeroFlow sign-in sender correction — 9 October 2026

User requires `notification@xeroflow.io` for magic-link email. The observed staging
agency email still used the global ADME/Resend sender. Cloudflare Email Sending
readback confirms xeroflow.io is verified and enabled in account
`a5b299b3ad15c1b5b895dc66f9357b17`.

Agency sign-ins and server-derived invited Page Studio sign-ins now use the private
`AGENCY_AUTH_EMAIL` binding with the fixed XeroFlow sender. Invited Studio links
keep their existing account/site scope, hashed credential and fragment-based
verification URL; their message says Continue to Page Studio. Native customer
sign-in remains on its existing dedicated service. General client portal and
non-auth mail keep their existing transport and sender.

Only an explicit Cloudflare accepted receipt succeeds. Missing bindings, failures
and malformed receipts throw controlled errors without fallback or retry. Public
agency sign-in responses remain identical for eligible, unknown, inactive and
failed-delivery cases after the global availability preflight. Logs contain no
recipient, credential, callback URL or provider error detail. Privileged invitations
continue to report delivery failure, and the admin diagnostic identifies the new
provider/sender without changing its role gate.

Private targets are `xeroflow-agency-auth-email-staging` and
`xeroflow-agency-auth-email`. Both have no public routes, workers.dev or preview
URLs, and their native Email binding permits only notification@xeroflow.io.
Deploy each private target before the corresponding guarded Pages caller.

Local evidence: old agency/ADME and invited-Studio paths reproduced with failing
regressions; corrected sender and failure checks pass. Independent review passed
48 tests across nine relevant suites. Final focused run passes 44 tests. Worker
staging/production dry runs pass. Production build passed the unchanged size guard
at raw 25,459,467/25,468,928 and gzip 7,042,726/9,750,000. A subsequent nullable-name
type refinement is included in the final guarded rebuild. Targeted lint retains
exactly 16 pre-existing diagnostics, with zero added identities. Scoped server
typechecking retains existing graph errors; no new changed-path diagnostics remain
beyond the unchanged logoMonogram indexing warnings. Repository types/lint are not
claimed clean. Hosted accepted delivery and mailbox appearance remain to verify.

The first production build failed on ENOSPC. Docker and the owned local CMS were
stopped; only reinstallable dependencies in three inactive, clean, ancestry-merged
DriveAgent release copies and exact owned private Docker cache records were removed.
Source, customer data, databases, image receipts and the uploaded immutable editor
artifact remain preserved. Local image removal initially failed with Docker metadata
I/O errors and is not recorded as successful. Free host space recovered to about
12 GiB; Docker remains stopped. Restore the selected local CMS after heavy gates.

## Completed production release

PR649 merged as `c752cefc18c828b8c20b8cef4726f11fd7a582f9` after CI passed
15,765 tests (1,961 skipped), CRM 54, social 785 and deployment guards 21.
Guarded production deployment `92a95ff6-2edc-4424-9c5f-4e1203e109f4` completed
07:46:59 UTC on 9 October. Cloudflare confirms current main, exact clean source,
canonical production, and `AGENCY_AUTH_EMAIL=xeroflow-agency-auth-email`;
preview separately points to `xeroflow-agency-auth-email-staging`.

Private staging Worker version `23e4a1be-efa2-4985-9104-07bec8f53c9d` and
production version `f8d23f26-af67-44d8-9fcb-9019223fa805` were deployed before
the Pages callers. Both have no public targets. Production raw/gzip guards passed
at 25,459,103 and 7,042,448 bytes. Exact source, deployment and hashes remain in
`.verification/resume-20261008/production-release-receipt-20261009.json`.

One fresh normal staging agency request was made for `paul@adme.net.au`, the
actual recipient in the user's screenshot. Public request acceptance does not
prove delivery; received From address remains pending mailbox verification.
The existing invited Fantasy account's independent sign-in also remains pending.
No repeated email request, credential extraction or fabricated session was used.

A single fresh normal production Page Studio request for `pgiurin@gmail.com` was
made after the sender deployment. The latest frontend shows Check your inbox and
15-minute expiry. A screenshot is preserved privately as
`studio-fresh-production-link-20261009.png`. This proves request acceptance only;
received From address and independent Fantasy dashboard access await the user.

## 10 October provider verification

Canonical Pages deployment remains `92a95ff6-2edc-4424-9c5f-4e1203e109f4` from
clean main `c752cefc18c828b8c20b8cef4726f11fd7a582f9`. Readback confirms the separate
production and staging auth-service bindings. Production Worker version
`f8d23f26-af67-44d8-9fcb-9019223fa805` still serves 100% and permits only
`notification@xeroflow.io` through its Email binding. An exact account suppression
lookup for `pgiurin@gmail.com` returned no entry.

A dry, read-only Worker telemetry query covering 9 October 11:33–11:36 UTC found one
matching sender invocation at 11:34:37.013 UTC, outcome `ok`, response 202 and the
expected version. The sign-in request screenshot was saved at 11:35:11.169 UTC.
This correlation establishes a successful gateway invocation in the request window;
no recipient or credential payload was read from logs. It does not establish
Gmail delivery, the received From header or independent CMS login. Yesterday's link
is expired; the normal site route still shows sign-in, and the mailbox result is
pending at that earlier checkpoint. The subsequent normal request is recorded below.

## 10 October profile-selection diagnosis

The user's later normal login reached an older South Morang profile with no
websites. Read-only PostgreSQL inspection confirmed that the same mailbox also
has its existing Fantasy Limo profile and editor membership on the original site.
General Studio login selected both active profiles; only exact site redirects
previously required membership. Fix `744bfbf54` applies exact active/draft website
membership and active-client filtering to general Studio redirects as well.
Existing sender services, token/session handling, roles and public response privacy
remain unchanged. Full local tests and the production build exited 0; release
checks and correct-profile browser acceptance are tracked in the customer CMS ledger.

After signing out the unrelated context through normal UI, one fresh normal
site-scoped Fantasy link was requested. This is request acceptance evidence;
correct-profile CMS → Open Studio acceptance and received From inspection remain
pending. No additional mail, synthetic session or membership change was performed
by the CLI release workflow.
