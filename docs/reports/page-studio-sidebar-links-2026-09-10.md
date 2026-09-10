# Page Studio sidebar audit — 10 September 2026

Production has the earlier Websites section: Demo Sites, Reviews, Releases,
Domains & DNS and Subscriptions. The application-platform preview additionally
has Setup proposals. Booking pages existed in preview but their global sidebar
links were missing; this change adds Bookings and Driver sheet for agency users
with PAGE_STUDIO_VIEW, and Bookings for portal users with an assigned site.
The destinations retain their scoped website picker and server authorization.

| Audience | Link | Destination |
|---|---|---|
| Agency | Demo Sites | /agency/page-studio |
| Agency | Bookings | /agency/page-studio/bookings |
| Agency | Driver sheet | /agency/page-studio/bookings/driver-sheet |
| Agency approver | Reviews | /agency/page-studio/reviews |
| Agency approver | Setup proposals | /agency/page-studio/setup-proposals |
| Agency publisher | Releases | /agency/page-studio/releases |
| Agency domain permission | Domains & DNS | /agency/page-studio/domains |
| Agency subscription permission | Subscriptions | /agency/page-studio/subscriptions |
| Assigned portal user | Websites | /portal/page-studio |
| Assigned portal user | Bookings | /portal/page-studio/bookings |
| Assigned portal user | Domains & DNS | /portal/page-studio/domains |
| Assigned portal user | Release history | /portal/page-studio/releases |
| Assigned portal user | Subscription & usage | /portal/page-studio/subscriptions |

Site-specific content, forms/submissions, assets, pages and publishing remain
inside the selected website workspace. Launch Studio opens the separately
deployed editor with a signed session. No placeholder links were added for
unfinished email configuration, runtime provisioning or billing activation.

Validation: existing navigation, site-booking navigation and deploy-guard suites
pass 19 tests. Both layouts pass ESLint; deploy:check passes. Agency navigation
uses the existing Nuxt UI scrolling sidebar; portal content retains overflow-y-auto.
The production scrolling fix is separately live in PR #521. This sidebar change
is for the application-platform preview and does not publish its pending features
to production. Preview deployment and authenticated browser verification pending.
