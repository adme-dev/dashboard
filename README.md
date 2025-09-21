# Nuxt Dashboard Template

[![Nuxt UI](https://img.shields.io/badge/Made%20with-Nuxt%20UI-00DC82?logo=nuxt&labelColor=020420)](https://ui.nuxt.com)

Get started with the Nuxt dashboard template with multiple pages, collapsible sidebar, keyboard shortcuts, light & dark more, command palette and more, powered by [Nuxt UI](https://ui.nuxt.com).

- [Live demo](https://dashboard-template.nuxt.dev/)
- [Documentation](https://ui4.nuxt.com/docs/getting-started/installation/nuxt)

<a href="https://dashboard-template.nuxt.dev/" target="_blank">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://ui4.nuxt.com/assets/templates/nuxt/dashboard-dark.png">
    <source media="(prefers-color-scheme: light)" srcset="https://ui4.nuxt.com/assets/templates/nuxt/dashboard-light.png">
    <img alt="Nuxt Dashboard Template" src="https://ui4.nuxt.com/assets/templates/nuxt/dashboard-light.png">
  </picture>
</a>

> The dashboard template for Vue is on https://github.com/nuxt-ui-templates/dashboard-vue.

## Quick Start

```bash [Terminal]
npm create nuxt@latest -- -t github:nuxt-ui-templates/dashboard
```

## Deploy your own

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-name=dashboard&repository-url=https%3A%2F%2Fgithub.com%2Fnuxt-ui-templates%2Fdashboard&demo-image=https%3A%2F%2Fui4.nuxt.com%2Fassets%2Ftemplates%2Fnuxt%2Fdashboard-dark.png&demo-url=https%3A%2F%2Fdashboard-template.nuxt.dev%2F&demo-title=Nuxt%20Dashboard%20Template&demo-description=A%20dashboard%20template%20with%20multi-column%20layout%20for%20building%20sophisticated%20admin%20interfaces.)

## Setup

Make sure to install the dependencies:

```bash
pnpm install
```

## Development Server

Start the development server on `http://localhost:3000`:

```bash
pnpm dev
```

## Production

Build the application for production:

```bash
pnpm build
```

Locally preview production build:

```bash
pnpm preview
```

Check out the [deployment documentation](https://nuxt.com/docs/getting-started/deployment) for more information.

## Renovate integration

Install [Renovate GitHub app](https://github.com/apps/renovate/installations/select_target) on your repository and you are good to go.

## Staging Setup (Xero Dashboard)

1. Environment
   - Set `XERO_CLIENT_ID`, `XERO_CLIENT_SECRET`, `XERO_REDIRECT_URI` (e.g. `https://your-domain.com/api/xero/callback`)
   - Set `SESSION_SECRET`
   - Optional: `DATABASE_URL`, `CACHE_URL`
2. Xero App
   - In Xero Developer portal, add the redirect URI to your app settings
   - Scopes used: `offline_access accounting.reports.read accounting.settings.read accounting.transactions.read accounting.contacts.read`
3. Deploy
   - Build and deploy (`pnpm build`) to your hosting (Vercel/Netlify/etc.)
   - Ensure env vars are configured in hosting provider
4. Health & Webhooks
   - Health check: `GET /api/health`
   - Webhook (optional): `POST /api/xero/webhook` (configure to invalidate caches)
