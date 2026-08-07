# Drafts — non-routable page archive

Pages moved out of `app/pages/` so they no longer generate routes, kept for reference.

- `pricing-self-service.vue` — the original three-tier self-service pricing page (Starter/Agency/Enterprise, free trial, per-seat pricing). Replaced 2026-07-22 by the sales-assisted enterprise pricing page, per `docs/prd/xeroflow-enterprise-platform-prd.md` (no self-service signup, no free tier, annual contracts). Its plan copy predates the enterprise PRD — do not restore without reconciling against the PRD's claims rules (no SSO/SLA/compliance claims before they exist).
- `browserbase-style.vue`, `browserbase-light.vue` — homepage design studies (dark and light variants). Never linked from anywhere and not in the public-route allowlist; contained outdated free-trial copy.
