# Bounded native production signup — prepared change

This source change prepares ordinary signup for exactly `pgiurin@gmail.com` and
`developer@adme.net.au`, ending at **2026-10-22T12:00:00Z**. It is not evidence of
production deployment, email delivery, genuine login or customer acceptance.
Wait for the preceding preparation release (`a6fe7d716deacc37b5d32dadb7cb067ea1463210`,
CI `39356406569`) and its provider readback before releasing this stage.

Only three production Pages variables change:

- `PAGE_STUDIO_CUSTOMER_SIGNUP_ENABLED`: `false` → `true`.
- `PAGE_STUDIO_CUSTOMER_SIGNUP_EMAIL_HASHES`: the JSON array of the two approved
  mailbox digests, as pinned by the deployment configuration test.
- `PAGE_STUDIO_CUSTOMER_SIGNUP_EXPIRES_AT`: `2026-10-22T12:00:00Z`.

Each digest is lowercase hexadecimal SHA-256 over UTF-8 of
`email.trim().toLowerCase()`, without salt. Both scope keys are required together.
Unknown mailboxes receive the same generic response without account/email effects.
Expiry also gates customer session/setup endpoints, so acceptance must finish
inside this window. Do not silently extend it or reuse the expired staging scope.

The existing production origin, terms version, sender, email service and all
other production/staging bindings remain unchanged. Native preview runtime stays
explicitly false; preview creation, browser, editor, CMS and Forms flags remain
absent/disabled. Pi settings are unchanged. No approval, workspace ID, grant,
account or session is created by this configuration change.

After review and exact-source CI, release through the guarded `pnpm deploy:*`
workflow to `agency-dashboard`; `pnpm deploy:check` must pass first. Record source,
deployment ID and serving configuration before ordinary signup tests. Real mailbox
verification and normal setup must create native production IDs. Genuine second
mailbox login and hosted operator/customer acceptance remain pending; staging IDs
and synthetic sessions cannot substitute for them. Later preview/editor activation
requires a separately reviewed scope using those real IDs.

To close early, set `PAGE_STUDIO_CUSTOMER_SIGNUP_ENABLED=false` and release through
the same guard, retaining both scope keys. Never remove both keys while signup is
true: that removes the mailbox restriction. Preserve accounts and audit evidence.
