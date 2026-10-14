# Customer domains and launch

Upgrade the existing per-site CMS and portal for every customer. Reuse current Nuxt UI, semantic colour tokens, left-aligned instructions and explicit readiness states. Purchase and registrar transfer use official Cloudflare handoffs in the customer's account; XeroFlow must not collect card details or claim a registrar action completed merely because a link was opened.

## Findings
- Site CMS has no domain tab; the existing portal screen fails with DOMAIN_ACCESS_DENIED.
- Fantasy's four sites share a zero-custom-domain entitlement; its signed-in user is a portal viewer with a site editor membership. Neither is a provider outage. Do not silently promote customer roles or increase subscription quotas.
- Existing Cloudflare management service supports attach and verify but not portal production publish. Existing publication requires approved versions and fresh agency authority.

## Ordered implementation
1. Separate domain visibility from permission to attach: every active scoped site member can see setup options and exact plan/access blockers. Admin/manager plus editor membership and current quota remain necessary for mutations. Test zero-quota reads and denied writes/cross-client access.
2. Expose Domains & Launch within each CMS website and the existing portal screen. Add provider choices: keep DNS, move DNS hosting, transfer registration, buy domain. Official provider instructions and handoffs, explicit return-to-connect step. No invented DNS records or claimed completed transfers.
3. Add actual readiness states, retry and actionable errors. Show preview and production state separately; never claim active DNS means published. Preserve site-scoped authority and disabled controls on stale/error states.
4. Test, review, merge current main and deploy through guarded release scripts. Verify all four customer sites and mobile accessibility in live Chrome. Preserve existing QR Codes/navigation.
5. Production self-publishing and Cloudflare account readiness require a verified production delivery path and current publish authority. Audit those dependencies before exposing a customer launch mutation; document any provider/configuration blocker explicitly, without weakening release checks.

## Acceptance
Customers can discover domain setup in their site's dashboard, choose the correct provider path, understand exact next steps and inspect scoped DNS/HTTPS status. Authorized domain managers can attach and verify within current capacity. Read-only/no-capacity accounts see instructions and a precise access message instead of a broken screen. Registration/transfer payments and terms stay with the customer at Cloudflare.

## Release order and operational status
Deploy the Dashboard Pages application **before** the management Worker. Old Pages uses a strict domain response schema and rejects the new optional fields from the updated Worker. New Pages accepts both old and new responses. Verify the new Pages assets before deploying the Worker. Roll back the Worker before rolling back Pages.

The production Cloudflare zone has no configured SaaS fallback origin, delivery route or management CNAME target as of 14 October 2026. The UI reports configuration unavailable and does not enable domain attachment. Do not invent a DNS target or direct customer traffic to preview infrastructure. Complete and prove production delivery before configuring this target. This change does not implement a customer publication mutation or grant higher customer roles or plan capacity.

Existing DNS verification requires a publicly visible CNAME: use a DNS-only subdomain without optional CNAME flattening. Root-domain/flattened routing needs a separate supported verification path.
