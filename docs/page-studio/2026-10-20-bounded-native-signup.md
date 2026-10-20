# Bounded native signup and Pages binding budget — prepared change

This source change prepares ordinary signup for exactly `pgiurin@gmail.com` and
`developer@adme.net.au`, ending at **2026-10-22T12:00:00Z**. It is not evidence of
production deployment, email delivery, genuine login or customer acceptance.
The preceding preparation source (`a6fe7d716deacc37b5d32dadb7cb067ea1463210`,
CI `39356406569`) passed build/tests, but Cloudflare rejected its deployment with
153 text bindings against the 150 limit. The canonical serving deployment remains
`08f4bb08-2f0b-4eaf-8ef9-f9f96497e265`. This change combines prepared resources,
bounded signup and the omissions below in one subsequent guarded release after
review and exact-main CI; the failed preparation was never a live activation.

Three production Pages signup variables change:

- `PAGE_STUDIO_CUSTOMER_SIGNUP_ENABLED`: `false` → `true`.
- `PAGE_STUDIO_CUSTOMER_SIGNUP_EMAIL_HASHES`: the JSON array of the two approved
  mailbox digests, as pinned by the deployment configuration test.
- `PAGE_STUDIO_CUSTOMER_SIGNUP_EXPIRES_AT`: `2026-10-22T12:00:00Z`.

Each digest is lowercase hexadecimal SHA-256 over UTF-8 of
`email.trim().toLowerCase()`, without salt. Both scope keys are required together.
Unknown mailboxes receive the same generic response without account/email effects.
Expiry also gates customer session/setup endpoints, so acceptance must finish
inside this window. Do not silently extend it or reuse the expired staging scope.

To fit the text-binding limit, omit exactly these six production variables:

- `MCP_FINANCIAL_TOOLS_ENABLED=false`
- `MCP_REQUIRE_WRITE_SCOPE=false`
- `AGENCY_WORKFLOWS_SCHEDULED_PUBLISHING_PRIMARY=false`
- `AGENCY_WORKFLOWS_CRM_FOLLOWUP_WRITES_ENABLED=false`
- `AGENCY_WORKFLOWS_CRM_FOLLOWUP_PRIMARY=false`
- `NODE_VERSION=24`

Every runtime consumer of the five flags compares directly with the string
`'true'`; omission preserves each disabled path. The configuration regression test
evaluates those actual expressions with missing, false and true values. Node has
no runtime consumer; CI and package engines still pin Node `24.18.0`. Top-level
and preview variables stay unchanged. No secret is removed.

The signup candidate had 52 declared production variables; these omissions reduce
that to 46. Four generated runtime variables bring plaintext bindings to 50.
With the operator's current count of 99 live secrets, the inferred total is 149,
one below the provider limit. The test pins declared capacity without hardcoding
a secret inventory. Recount live secrets and generated bindings before deployment;
this arithmetic is not a successful upload receipt.

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
