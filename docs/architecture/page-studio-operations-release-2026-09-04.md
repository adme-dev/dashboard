# Page Studio Operations Release

## Decision

The imported-and-owned XeroFlow Page Studio is the sole visual website authoring surface. The Agency dashboard is its governed control plane. It does not embed or maintain a competing internal page builder.

Agency and client users manage the site record in XeroFlow, then launch Studio in a new tab for visual editing. Signed, scoped editor sessions preserve tenant, client, site, role, origin, and expiry boundaries.

## Operational workspaces

- **Pages and Studio:** site hierarchy and launch context.
- **Assets:** validated image upload registration, metadata editing, and authorised R2 delivery.
- **Forms:** native lead submissions joined to Page Studio evidence without duplicating the CRM source of truth.
- **Analytics:** release-bound event summaries, routes, and recent activity.
- **Builds and releases:** checkpoint review, approval, immutable publication, rollback, and drift evidence.
- **Domains:** attachment, provider lifecycle, DNS instructions, and verification with fail-closed activation.
- **Settings:** active editor-session visibility and revocation.

All operational routes require authenticated tenant/client/site scope. Mutations remain auditable. Asset content is signature-checked rather than trusting a filename or browser MIME declaration.

## Cloudflare domain boundary

When `PAGE_STUDIO_CLOUDFLARE_ZONE_ID`, `PAGE_STUDIO_CLOUDFLARE_API_TOKEN`, and `PAGE_STUDIO_CUSTOM_HOSTNAME_TARGET` are configured, domain attachment provisions a Cloudflare custom hostname and records provider ownership and certificate challenges. Without those credentials, XeroFlow records DNS-only instructions but does not claim provider activation.

No domain becomes active merely because it was entered. Verification requires the expected DNS state and, where applicable, the provider hostname and certificate to be active.

## Release evidence

- Dashboard Page Studio tests: 141 passed and 1 intentionally skipped across 29 files.
- Changed Page Studio lint surface: zero errors.
- Nuxt production build and worker-size guard passed with 40,030 raw bytes and 3,147,310 gzip bytes remaining.
- No schema migration was needed; the existing Page Studio schema supports the added operations.

## Remaining external acceptance

- Set production Cloudflare custom-hostname credentials.
- Attach and verify a disposable acceptance hostname.
- Confirm DNS ownership, TLS issuance, and served-host routing.
- Run an authenticated production smoke test for Studio launch, reference-site rendering, operational tabs, and session revocation.

These are environment and live-provider acceptance steps, not unimplemented dashboard or Studio features.

## Rollback

Revert the dashboard and Studio release commits and redeploy the preceding artifacts. The routes and UI panels are additive, and this release contains no destructive database migration.
