# Generated contact form lead fields — 12 September 2026

The verified hosted AI proposal uses `field_full_name`, `field_email` and
`field_message`. Page Studio retained these submitted values, but its canonical
lead mapping omitted the first and last keys. The lead inbox reads `full_name`,
and routing templates use canonical fields, so a generated form could create a
lead without its name or message available through those standard keys.

The mapping now recognizes both keys while preserving every submitted field,
explicit canonical values and existing alias precedence. Release authority,
idempotency, synthetic capture-only handling and production-only submissions
are unchanged. This is a compatibility correction, not general semantic mapping
for arbitrary customer field identifiers.

The regression uses the actual hosted proposal's field identifiers. It failed
before the two alias additions and passes afterward. Related coverage also checks
canonical/legacy precedence, suppression of synthetic routing and assignment,
and rejection before writes when release authority is absent.

This branch starts at current main `9d6b1c9a1`, with no historical preview merge.
Authenticated agency approval, build, release and live test-lead readback remain
pending. The browser's staging agency session is signed out; a sign-in has been
requested while independent fixes continue. Staging delivery deliberately rejects
form POSTs, so do not weaken that boundary merely to obtain a test result.

The saved synthetic site `5ddc69f4-bd4f-4179-ba6f-e23412133cb0` currently has empty
integrations. Before any release test that creates a lead, explicitly establish
its synthetic marker and verify notification suppression. Its AI version is
`271ff127-e0af-49e5-8ae6-dbfac6f81abd` (`in_review`), checkpoint
`checkpoint_ai_proposal_cf0de51f-a414-47cc-801f-f1d9add0a673`, digest
`1589977fc3bf142217c8e391b68ddcc7ee60deada8d8e73cb10077ea8f2987d8`.
