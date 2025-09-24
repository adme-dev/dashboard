# ADME Xero Dashboard

[![Nuxt UI](https://img.shields.io/badge/Made%20with-Nuxt%20UI-00DC82?logo=nuxt&labelColor=020420)](https://ui.nuxt.com)

AI-assisted financial dashboard that connects to Xero to surface real-time KPIs, anomaly alerts, and decision support for advisors and finance teams. The project started from the official [Nuxt UI Dashboard template](https://github.com/nuxt-ui-templates/dashboard) and has been extended with secure Xero OAuth flows, server-side reporting, and Netlify deployment automation.

## Project Links

- Latest Netlify deploy: https://adme-xero.netlify.app
- Source repository: https://github.com/adme-dev/dashboard

## Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fadme-dev%2Fdashboard&project-name=adme-xero-dashboard&repository-name=adme-xero-dashboard)

## Feature Highlights

- **Real-time Xero insights** – cash flow, revenue, expense, and profit KPIs pulled directly from the Xero Accounting API.
- **AI-driven analytics** – anomaly detection, scenario forecasts, and curated recommendations using external AI models.
- **Secure OAuth integration** – token exchange, refresh, and multi-tenant support handled via Nitro server routes.
- **Modern UX** – responsive Nuxt UI layout with command palette, theming, keyboard shortcuts, and modular widgets.
- **Production-ready pipeline** – Netlify build + deploy flow, `_redirects`/`_headers` management, and environment configuration baked in.

## Tech Stack

- Nuxt 3 + Nitro (TypeScript, Vue 3, Vite)
- Nuxt UI Pro components & Tailwind CSS
- Netlify for hosting and serverless functions
- `xero-node` SDK for OAuth + Accounting API access
- pnpm for dependency management

## Getting Started

### Prerequisites

- Node.js 22.x (matching `.nvmrc`)
- pnpm ≥ 10
- Xero developer account with an OAuth 2.0 app configured

### Clone & Install

```bash
git clone https://github.com/adme-dev/dashboard.git
cd dashboard
pnpm install
cp .env.example .env
```

Populate `.env` with the secrets described below.

### Required Environment Variables

| Variable | Description |
| --- | --- |
| `XERO_CLIENT_ID` | OAuth client id from Xero developer portal |
| `XERO_CLIENT_SECRET` | OAuth client secret |
| `XERO_REDIRECT_URI` | Callback path (use `/api/xero/callback` – host is resolved automatically) |
| `SESSION_SECRET` | Random string for cookie/session signing |
| `DATABASE_URL` | (Optional) persistence for tokens and metadata |
| `CACHE_URL` | (Optional) external cache/Redis connection |

Scopes requested from Xero: `offline_access accounting.reports.read accounting.settings.read accounting.transactions.read accounting.contacts.read`.

### Run Locally

```bash
pnpm dev
```

The app starts on http://localhost:3000. Use `netlify dev --offline` if you want to exercise Netlify-specific behaviour locally (SSR via `/.netlify/functions/server`).

### Build & Preview

```bash
pnpm build
pnpm preview
```

Preview runs the production bundle on http://localhost:3000 with Nitro’s preview server.

## Deploying to Netlify

This repository is configured for Netlify builds out of the box (`netlify.toml`, `_redirects`, `_headers`). If you deploy to Vercel instead, set `NITRO_PRESET=vercel` (or rely on Vercel’s `VERCEL` env var) so the SSR bundle targets the correct platform.

1. Connect the repo at https://app.netlify.com/ and select **pnpm build** as the command (already in config).
2. In “Site settings → Build & deploy → Environment”, add the variables listed above. For `XERO_REDIRECT_URI`, set `/api/xero/callback`.
3. Trigger a deploy. Netlify will compile the Nitro server into `/.netlify/functions/server` and publish the static assets from `dist/`.
4. To redeploy from the CLI:

   ```bash
   netlify deploy --prod --message "Deploy latest"
   ```

   Ensure you have authenticated with `netlify login` first.

## Xero OAuth Checklist

1. In the Xero developer portal, set the redirect URI to match the production domain plus `/api/xero/callback`.
2. Enable the scopes listed above.
3. During login at `/api/xero/login`, we generate CSRF-protected state + PKCE and redirect to Xero’s consent screen.
4. The callback persists refresh tokens via Nitro server utilities (`server/utils/tokenStore.ts`).

## Maintenance

- Linting and formatting follow the Nuxt UI template conventions.
- Renovate bot can be re-enabled if dependency automation is desired.
- For AI model providers (e.g., Groq), add their keys to `.env` and hook into the `server/api/ai/*` endpoints.

## Credits

Originally based on the [nuxt-ui-templates/dashboard](https://github.com/nuxt-ui-templates/dashboard) starter by the Nuxt team. Extended and maintained by the ADME engineering group.
