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
