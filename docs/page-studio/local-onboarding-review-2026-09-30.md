# Local customer onboarding review — 30 September 2026

## Scope and source

This is an entry-page/source audit supporting the [canonical PRD](../prd/page-studio-customer-cms-prd.md), not completed self-service onboarding acceptance. Requirements and task status remain in the PRD.

- Repository: `adme-dev/dashboard`.
- Clean owned worktree: `/private/tmp/dashboard-component-workspace-rnd-20260930`.
- Branch: `docs/component-workspace-rnd-20260930`.
- Runtime source baseline: `a98b83a53c65fbb80da48e8a2348610d2c9d24bb`; checkout at startup `c220d82cefd6450b03cfed545da9b4f0962b97f9` adds documentation only.
- Fresh fetch confirmed the branch includes current `origin/main` at review time. No application code changed for this review.
- The user's root worktree and unrelated development servers were left intact.

## Run locally

From the owned worktree, with Node 24.18.0 and pnpm 10.17.1 available:

```sh
pnpm install --frozen-lockfile
pnpm dev --host 127.0.0.1 --port 3000
```

Open `http://127.0.0.1:3000/studio`. The dev process was left running after this review; restart it with the command above if the process has ended. The path under `/private/tmp` is a development checkout, not a durable deployment location.

No `.env` or production database/email credentials were copied into this checkout. Full authenticated workflows require an explicitly isolated test database, authentication configuration, captured/test email delivery and the relevant management/runtime services. A local Nuxt process alone does not emulate those Cloudflare services or launch the separate Page Studio editor.

## Observed evidence

- Frozen-lockfile dependency installation and `nuxt prepare` completed successfully.
- Nuxt 4.5.1/Vite/Nitro development server compiled and served `/studio` with HTTP 200.
- Chrome rendered the real Page Studio login: “Sign in to Page Studio”, email field, sign-in-link action, and “New here? Ask your website team to invite you and assign your website.”
- The blank-email action was disabled. No form was submitted and no email, registration, billing, provisioning or deployment action was triggered.
- Startup reported existing duplicate-import and circular-dependency warnings in Page Studio utilities; dependency installation also reported ignored dependency build scripts. These were not changed or treated as a successful production build.

## Source findings and next acceptance

The existing `/auth/register` handler creates agency staff. `/studio` authenticates existing invited customer users, while site creation requires customer scope and an active entitlement. Setup and domain screens already exist in agency/portal paths, but their copy and approval/navigation rules assume agency management.

The next implementation starts with PRD RND-01/RND-17: map customer workspace ownership to existing identity/client/site/storage records. RND-18–RND-23 then deliver verified signup, resumable business setup, idempotent customer/site creation, provisioning, the customer dashboard, editor handoff and first publication. Test both standalone and invited customers with separate customer databases before claiming the whole journey works.

This review did not verify authenticated dashboard data, account creation, customer-database writes, visual-editor launch, payments, DNS or hosted publication. Those remain explicit implementation acceptance items.
