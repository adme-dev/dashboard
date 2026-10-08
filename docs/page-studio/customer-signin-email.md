# Page Studio sign-in email

`PAGE_STUDIO_CUSTOMER_EMAIL_FROM` sets the sender address for standalone customer sign-in emails. Verify that domain with the sending provider before enabling signup. The email subject and CTA are **Continue to Page Studio**.

Set the server-only secret `PAGE_STUDIO_CUSTOMER_RESEND_API_KEY` to a Resend **Sending access** key restricted to the matching sender domain (currently `xeroflow.io`). When present, it selects a dedicated Resend transport for customer sign-in only; staff and portal email continue using their existing settings. Configure the secret separately for each deployment environment. Request Cloudflare bindings take precedence over local process environment values. Never put the credential in Wrangler vars, public runtime config, source control, or logs.

Without the dedicated secret, the existing shared Cloudflare gateway/Resend fallback remains in effect. That gateway currently permits only `notification@adme.net.au`, so XeroFlow sender activation requires the dedicated secret. Dedicated delivery errors fail closed and are never retried through shared credentials.

Before activation, deploy the reviewed code and secret, then request an authorized sign-in email. Confirm the provider reports delivery and the actual From address, subject and HTML are correct. A generic successful response from the signup endpoint does not prove email delivery. This configuration does not enable native signup or change its recipient/expiry gates.
