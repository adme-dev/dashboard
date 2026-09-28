# Four-hour Studio editing sessions

The 15-minute native session lifetime stopped ordinary editing, including a Fantasy Limo footer AI request on 28 September 2026. New sessions allow up to four hours, capped by the existing native login expiry. Live session/login revocation, role, entitlement and site isolation checks still run for every operation.

Migration 436 changes the ledger maximum without changing existing session rows. It was applied to production and read back on 28 September at 07:00:07 UTC. Migration 435 is reserved by the independent runtime CMS work. The migration retains positive-duration, nonce, role, capability, scope and revocation constraints.

Release order: deploy Studio's matching token verifier first, then this native issuer. An existing 15-minute session keeps its original expiry; launch a fresh session after release. Avoid rolling a verifier back to a 15-minute maximum while four-hour sessions remain valid.

Local verification covers issuance capped at login expiry, rejection of an expired native login, four-hour token bounds in the companion Studio change, and a disposable PostgreSQL migration test that runs twice and retains old session expiry. The production build passes (raw Worker 25,370,463 / 25,468,928 bytes). The full test suite passes: 2,142 files, 14,840 tests, with the disposable migration test enabled; 50 files/1,432 tests remain skipped by their existing environment gates. Separate PostgreSQL AI acceptance, checkpoint and history authority suites pass 24, 26 and 31 tests respectively. Live session issuance and deployment remain pending.

Automatic session renewal is a separate remaining increment. The current save bridge retains failed saves in the open tab and warns before navigation, but it does not provide durable browser crash recovery. Never instruct someone with unsaved work to reload or close the editor; renewal must preserve the pending manifest, exact checkpoint identity and expected base.

## Coordinated footer renderer update

Production configuration now selects the private Astro renderer uploaded on
28 September for optional reviewed footer typography. Its actual Cloudflare
Worker is `xf-asr-prod-5986dc6fe5cac2da5d354b0bfa611394e463f93ab42f8677`,
version `030c6b4d-1ab3-4067-8ae1-0e4786d54abf`, deployment
`8b0cb790-7410-431e-a0bc-38a0e95f8442`. The full generation and code/assets
digests in `wrangler.toml` match the upload and Cloudflare settings readback.
The prior `a6a72b89` generation remains explicitly retained for rollback.
Staging's independent CMS renderer and configuration are unchanged.

Before this Dashboard configuration is deployed, deploy Studio delivery's
matching current/retained bindings and renderer-specific credential support,
then verify the existing Fantasy Limo preview still loads. Deploy the matching
Studio editor image and four-hour verifier before this native issuer as above.
The native metadata projection clones the complete footer object, preserving
the optional typography; strict document validation remains in Studio.

The new runtime renderer is uploaded but not activated by this documentation.
The client's footer still requires a reviewed AI operation, checkpoint save,
approval and preview publication. No client checkpoint was edited by the
configuration change. Existing full local build/test evidence above covers
the unchanged application source; focused runtime release, deployment guard
and QR navigation/access regressions accompany the configuration pin.

The final compatibility audit found a second validation boundary: Dashboard's
generated CMS graph verifier embeds the full Studio manifest schema. Its old
copy rejected an otherwise valid footer edit. A failing checkpoint regression
reproduced that error before the deterministic export was refreshed. The
generated-code diff adds only the bounded footer typography schema (17 lines);
the provenance manifest records the new source and file hashes. Studio's
generator `--check` confirms byte-for-byte correspondence. All 35 focused
verifier/recovery/typography tests pass, including malformed font rejection.
The final production rebuild passes at 25,370,513 raw Worker bytes (98,415 bytes
below the guard). The full final suite passes 14,844 tests in 2,143 files, with
the disposable session-duration migration enabled; the same 50 files/1,432
environment-gated tests remain skipped. Targeted test-file lint passes.
