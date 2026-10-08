# Page Studio sign-in email

Standalone customer sign-in uses Cloudflare Email Service through the private `PAGE_STUDIO_CUSTOMER_EMAIL` service binding. It never falls back to shared staff/portal credentials or Resend. Missing bindings and rejected provider deliveries fail closed. The subject and CTA are **Continue to Page Studio**.

`PAGE_STUDIO_CUSTOMER_EMAIL_FROM` must be `notification@xeroflow.io`, matching the dedicated Worker sender allowlist. Onboard `xeroflow.io` to Cloudflare Email Sending and confirm its DNS status is ready before activation. The Worker has no public route or API credential; both workers.dev and preview URLs are disabled.

Preview connects to `xeroflow-page-studio-customer-email-staging`, configured under `workers/page-studio-customer-email/wrangler.toml`. Deploy that Worker first with `pnpm deploy:workers page-studio-customer-email`, then run the Pages guard and `pnpm deploy:preview`. Production customer signup remains disabled and has no new email binding in this change. Its eventual activation requires a separately deployed production gateway and matching Pages binding.

Validate by requesting an authorized sign-in email and inspecting Cloudflare Email Sending delivery metadata for the sender, recipient and subject. A generic successful signup response alone does not prove delivery. Do not copy authentication tokens into logs or consume the recipient's verification link during delivery checks.
