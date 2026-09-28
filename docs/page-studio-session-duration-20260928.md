# Four-hour Studio editing sessions

The 15-minute native session lifetime stopped ordinary editing, including a Fantasy Limo footer AI request on 28 September 2026. New sessions allow up to four hours, capped by the existing native login expiry. Live session/login revocation, role, entitlement and site isolation checks still run for every operation.

Migration 436 changes the ledger maximum without changing existing session rows. It was applied to production and read back on 28 September at 07:00:07 UTC. Migration 435 is reserved by the independent runtime CMS work. The migration retains positive-duration, nonce, role, capability, scope and revocation constraints.

Release order: deploy Studio's matching token verifier first, then this native issuer. An existing 15-minute session keeps its original expiry; launch a fresh session after release. Avoid rolling a verifier back to a 15-minute maximum while four-hour sessions remain valid.

Local verification covers issuance capped at login expiry, rejection of an expired native login, four-hour token bounds in the companion Studio change, and a disposable PostgreSQL migration test that runs twice and retains old session expiry. The production build passes (raw Worker 25,370,463 / 25,468,928 bytes). The full test suite passes: 2,142 files, 14,840 tests, with the disposable migration test enabled; 50 files/1,432 tests remain skipped by their existing environment gates. Separate PostgreSQL AI acceptance, checkpoint and history authority suites pass 24, 26 and 31 tests respectively. Live session issuance and deployment remain pending.

Automatic session renewal is a separate remaining increment. The current save bridge retains failed saves in the open tab and warns before navigation, but it does not provide durable browser crash recovery. Never instruct someone with unsaved work to reload or close the editor; renewal must preserve the pending manifest, exact checkpoint identity and expected base.
