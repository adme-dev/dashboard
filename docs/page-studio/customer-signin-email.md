# Page Studio sign-in email

Standalone customer sign-in uses Cloudflare Email Service through the private `PAGE_STUDIO_CUSTOMER_EMAIL` service binding. It never falls back to shared staff/portal credentials or Resend. Missing bindings and rejected provider deliveries fail closed. The subject and CTA are **Continue to Page Studio**.

`PAGE_STUDIO_CUSTOMER_EMAIL_FROM` must be `notification@xeroflow.io`, matching the dedicated Worker sender allowlist. Onboard `xeroflow.io` to Cloudflare Email Sending and confirm its DNS status is ready before activation. The Worker has no public route or API credential; both workers.dev and preview URLs are disabled.

Preview connects to `xeroflow-page-studio-customer-email-staging`, configured under `workers/page-studio-customer-email/wrangler.toml`. Deploy that Worker first with `pnpm exec wrangler deploy --config workers/page-studio-customer-email/wrangler.toml`, using the explicit config to avoid generated Pages-config discovery, then run the Pages guard and `pnpm deploy:preview`. Production customer signup remains disabled. Production Pages source now prepares the separate production gateway binding; activation still requires a reviewed guarded Pages release and scoped hosted acceptance.

Validate by requesting an authorized sign-in email and inspecting Cloudflare Email Sending delivery metadata for the sender, recipient and subject. A generic successful signup response alone does not prove delivery. Do not copy authentication tokens into logs or consume the recipient's verification link during delivery checks.

## Production gateway preparation

The same reviewed gateway has a separate `production` environment named
`xeroflow-page-studio-customer-email-production`. Validate the bundle with
`pnpm exec wrangler deploy --config workers/page-studio-customer-email/wrangler.toml --env production --dry-run`.
After source review and release checks, deploy with the same command without
`--dry-run`. Both environments restrict sending from `notification@xeroflow.io` and
have no public URL. Configuration follows Cloudflare's
[send binding restrictions](https://developers.cloudflare.com/email-service/configuration/send-bindings/).

Deploying this gateway alone does not enable native signup. Bind it as
`PAGE_STUDIO_CUSTOMER_EMAIL` only in the production Pages environment, then use
the existing mailbox allowlist and expiry settings for scoped hosted acceptance.
The two historical preview accounts belong to the staging database; production
tests must create accounts through ordinary email verification and setup. Never
copy account/session rows or reuse preview entitlements as production evidence.

On 20 October 2026 the private production gateway was deployed from
`b4d39838414dd6a310b5adeafd76bec9c22db2fd`: deployment
`33916b51-e0e1-4dd8-a09d-1a07ea362c40`, version
`ef445a14-016a-4e90-a17c-046e04e7c6f5`. API readback verified the source tag,
100% version selection, sender restriction and disabled public URLs. Sender DNS
reported `ready`. This receipt covers gateway preparation; no production Pages
binding, native signup activation or delivered customer email is claimed.

## Production Pages source preparation

The production-only `wrangler.toml` configuration binds the production customer
email gateway and the isolated native-preview provisioner, content router and
checkpoint bucket. Source deployment flattening retains these settings. It keeps
`PAGE_STUDIO_CUSTOMER_SIGNUP_ENABLED` and
`PAGE_STUDIO_CUSTOMER_PREVIEW_RUNTIME_ENABLED` explicitly `false`.
The prepared customer origin is `https://app.xeroflow.io`, sender is
`notification@xeroflow.io`, terms version is `2026-08-02` (the existing canonical
preview terms version), and source editor origin is
`https://studio-customer-preview.xeroflow.io`. No preview mailbox hashes,
workspace approvals, expiry or account scopes are copied into production.

Run the focused Pages configuration tests and `pnpm deploy:check` before the
reviewed source release. Management must be deployed before Pages. These source
settings are preparation only: they do not prove a Pages deployment, delivered
customer email, native signup acceptance or Pi activation. Keep signup and the
native preview runtime disabled until the separately authorized acceptance step.
