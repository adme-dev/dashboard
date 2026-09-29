# Independent Page Studio customer entry

29 September 2026. Implementation in progress; preview verification pending.

The customer starts at `/studio`, signs in using their invited account, sees My sites at `/studio/sites`, opens the canonical Studio builder or the website CMS, and returns to My sites without entering the agency operations dashboard. Initial access uses provisioned customer accounts and sites, following the existing membership and entitlement model. Public signup and billing are separate work.

The product shell uses the existing application font, semantic light/dark colors and Nuxt UI controls. A quiet header provides Page Studio identity, My sites and sign out. The site list prioritises each website name and the two main actions: Open Studio and Manage content. Loading, no-access, empty and error states provide an explicit next step. CMS and draft history reuse the existing scoped components, without duplicating the visual editor.

Authentication reuses the portal session and magic-link service. Only same-origin `/portal` and `/studio/sites` return destinations are allowed; encoded separators, external URLs and traversal cannot expand that authority. API endpoints remain authoritative for membership, site access, entitlements and editing. No agency role, publication right, tenant selection or site assignment is inferred from the new route. Existing agency and portal paths remain supported.

Implementation and verification:

- [x] Add strict shared redirect validation and regression cases.
- [x] Add public entry, product shell, authenticated site list, content and history routes.
- [x] Preserve product destination through magic-link verification and sign out.
- [x] Connect existing site listing and signed editor launch; show useful denied/empty/error states.
- [x] Update public feature descriptions/navigation.
- [ ] Run targeted auth/UI tests, lint and production build.
- [ ] Deploy only Dashboard preview and verify desktop/mobile, existing-account access, cross-account denial, builder launch, CMS and return to My sites.

Production deployment, open signup, billing and expanded approval permissions are not part of this increment.

The product routes use the existing client-only auth routing policy. The portal security headers and resource-hint filtering also cover `/studio`, and the staff auth-error handler leaves customer sessions to their own sign-in flow. The public product entry is a route on the existing application host; a separate product hostname has not been configured.

Local verification: 122 focused auth, redirect, middleware, site-list, CMS access and draft-history tests pass. Changed/new files pass ESLint; the modified existing MarketingNav and staff auth-error plugin retain their independently verified pre-existing 35 and 5 lint findings. Full build and hosted preview acceptance remain pending at this checkpoint.
