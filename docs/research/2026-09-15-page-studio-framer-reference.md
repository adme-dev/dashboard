# Framer reference for Page Studio

The user supplied https://www.framer.com during the domains/email and customer
runtime completion work. Treat this as another product reference alongside
Base44, Wix and Squarespace; the active delivery objective continues unchanged.
Official pages were read on15 September2026 Melbourne. This is documentary
comparison, not a hands-on trial or proof that XeroFlow matches these features.

## Relevant patterns and acceptance checks

| Framer reference | Page Studio acceptance check |
| --- | --- |
| Canvas-native AI generates and refines editable site content; CMS agents manage collections and connect them to the canvas. [Product](https://www.framer.com/) | A signed-in customer creates and edits pages, components and content with chat; review/save retains editable structure and site scope. Treat visible AI proposals and published results separately. |
| Native forms have configurable fields, submission states, email/Sheets/webhook destinations and spam controls. [Forms](https://www.framer.com/help/articles/how-can-i-add-a-contact-form-to-my-framer-website/) | Fields and validation are configurable in the builder; a real accepted submission reaches the correct scoped database/inbox, with clear success/error and retry behavior. A lead form alone does not prove availability or a confirmed booking. |
| Webhooks use signed requests, unique submission IDs, bounded retries and direct successful responses. [Webhook contract](https://www.framer.com/help/articles/framer-form-webhook-setup/) | Keep durable scoped receipts, authenticated server integrations, idempotent retries and delivery status visible. Do not expose webhook secrets in generated code. |
| Users connect owned domains in settings and receive the precise DNS records to install. [Domain setup](https://www.framer.com/help/articles/how-to-connect-a-custom-domain/) | Keep domain, ownership/TLS/DNS state and actionable instructions together. Support apex/subdomain paths through verified Cloudflare configuration; never copy Framer's IPs or claim its DNS recipe applies to XeroFlow. Preserve existing email records and provide rollback. |
| CMS detail pages adapt to content through conditional layouts. [CMS pages](https://www.framer.com/help/articles/how-to-create-flexible-cms-detail-pages/) | Reuse typed collections for fleet, products, locations and services; editing customer data must update the intended page without cross-site effects. |

These checks mostly reinforce the existing checklist. They do not authorize a
new integration, installation, customer publication or broad visual redesign.
Cloudflare runtime provisioning, upgrades, retention/cleanup, metering and
failure recovery remain necessary for our promised customer application layer;
this review makes no claim that Framer lacks comparable capabilities.

Current production and incomplete work are recorded in
[the completion checklist](2026-09-15-page-studio-completion-progress.md).
Domain verification and initial attachment are released; portal/email management
and customer runtime reconciliation are still undergoing acceptance. Neither full
domains/email nor runtime lifecycle acceptance is complete. Keep the
[local Graph Wiki](../../graphify-out/wiki/page-studio-application-platform.md) in sync.
