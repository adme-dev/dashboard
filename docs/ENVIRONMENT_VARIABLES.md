# Environment Variables Setup Guide

This document explains how to configure environment variables for local development and Cloudflare Pages deployment.

## Quick Start

### 1. Local Development

```bash
# Set up local .dev.vars file
./scripts/setup-local.sh

# Or manually copy the example
cp .dev.vars.example .dev.vars
# Edit .dev.vars with your actual values

# Start development server with Wrangler
npx wrangler pages dev -- npm run dev
```

### 2. Production Deployment

```bash
# Interactive setup
./scripts/setup-env.sh production

# Or set secrets individually
npx wrangler pages secret put DATABASE_URL --env production
npx wrangler pages secret put JWT_SECRET --env production
# ... etc
```

## File Structure

| File | Purpose | Committed to Git |
|------|---------|-----------------|
| `.env` | Local non-secret vars | No (in .gitignore) |
| `.env.example` | Example/template | Yes |
| `.dev.vars` | Local secrets for Wrangler | No (in .gitignore) |
| `.dev.vars.example` | Example/template | Yes |
| `wrangler.toml` | Non-secret config per environment | Yes |

## Required Variables

### Database
```bash
DATABASE_URL=postgresql://user:pass@host:5432/db?sslmode=require
```
Get from [Neon](https://neon.tech) - Use the **pooled** connection string.

### Security (Auto-generated)
```bash
JWT_SECRET=$(openssl rand -base64 32)
SESSION_SECRET=$(openssl rand -base64 32)
CRON_SECRET=$(openssl rand -base64 32)
```

### Email (Required for Magic Links)
```bash
RESEND_API_KEY=re_your_api_key_here
```
Get from [Resend](https://resend.com).

### Video Asset Intelligence

Video Asset Intelligence uses a Cloudflare Pages queue producer plus a standalone Worker consumer:

- `ASSET_INTELLIGENCE_QUEUE` is the Pages producer binding in `wrangler.toml` for enqueueing asset intelligence jobs.
- `xeroflow-asset-intelligence` is the standalone Worker in `workers/asset-intelligence`, consuming the `asset-intelligence` queue.
- The Worker requires `HYPERDRIVE` for database access in production, or `DATABASE_URL` for local/fallback database access.
- The Worker requires the `MEDIA_BUCKET` R2 binding for source and derivative assets.
- The Worker requires the `AI` binding for Workers AI model execution.

Required production deployment steps:

1. Create the queues with `pnpm exec wrangler queues create asset-intelligence` and `pnpm exec wrangler queues create asset-intelligence-dlq`.
2. Apply the production video asset migrations in order: `176_video_assets_metadata.sql`, `177_video_asset_harness.sql`, then `178_video_derivative_bucket_item_unique_index.sql`. If the environment also missed the earlier duplicate-numbered source-asset migration, apply `176_video_gen_source_assets.sql` before `177`.
3. Deploy the standalone Worker with `pnpm --dir workers/asset-intelligence deploy`.
4. Deploy the Pages producer binding with `pnpm deploy:production`.
5. Smoke test one extraction and confirm the queue drains to DB/R2.

Full runbook: `workers/asset-intelligence/DEPLOYMENT.md`.

### Agency Workflows Smoke

`AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET` is the preferred machine credential for
the production Workflows smoke gate. Store the same random value in both places:

- Cloudflare Pages production secret for `agency-dashboard`, so
  `/api/agency/workflows/readiness` and `/api/agency/workflows/status` can
  validate `x-workflow-smoke-secret`.
- GitHub Actions repository secret, so the deploy job can run
  `pnpm run smoke:agency-workflows:ci` after Cloudflare Pages deploys.

This is a diagnostic-only credential. It does not replace
`WORKFLOW_SERVICE_SECRET` or `WORKFLOW_CALLBACK_SECRET`, and it should not be
set only on the separate `agency-workflows` Worker.

## Environment-Specific Configuration

### Development (Local)
```bash
# Uses .dev.vars file automatically
npx wrangler pages dev -- npm run dev
```

### Preview (Staging)
```bash
# Deploy to preview branch
git push origin feature-branch
# Or manually:
npx wrangler pages deploy --env preview
```

### Production
```bash
# Deploy to production
git push origin main
# Or manually:
npx wrangler pages deploy --env production
```

## Managing Secrets with Wrangler

### Set a Secret
```bash
npx wrangler pages secret put DATABASE_URL --env production
```

### List Secrets
```bash
npx wrangler pages secret list --env production
```

### Delete a Secret
```bash
npx wrangler pages secret delete DATABASE_URL --env production
```

## Variable Categories

### Server-Only (Private)
These are only accessible in server-side code (API routes, server utils):

- `DATABASE_URL`
- `JWT_SECRET`
- `SESSION_SECRET`
- `XERO_CLIENT_SECRET`
- `RESEND_API_KEY`
- `GROQ_API_KEY`
- `R2_SECRET_ACCESS_KEY`
- `MONDAY_API_TOKEN`

Access in Nuxt:
```typescript
const config = useRuntimeConfig()
// Server-side only
const dbUrl = config.databaseUrl
const jwtSecret = config.jwtSecret
```

### Public (Client + Server)
These are accessible in both client and server code:

- `NUXT_PUBLIC_APP_URL`
- `NUXT_PUBLIC_APP_NAME`
- `NUXT_PUBLIC_ZERO_SERVER_URL`

Access in Nuxt:
```typescript
const config = useRuntimeConfig()
// Both client and server
const appUrl = config.public.appUrl
```

## Troubleshooting

### "Authentication required" errors in production
Check that secrets are set:
```bash
npx wrangler pages secret list --env production
```

### Variables not loading locally
Ensure `.dev.vars` exists:
```bash
ls -la .dev.vars
# If not exists:
./scripts/setup-local.sh
```

### Database connection errors
- Verify you're using the **pooled** connection string from Neon
- Check that `sslmode=require` is included
- Ensure the database user has proper permissions

### Xero OAuth not working
- Verify `XERO_CLIENT_ID` and `XERO_CLIENT_SECRET` are set
- Check that `XERO_REDIRECT_URI` matches your Xero app configuration
- Ensure the redirect URI in Xero developer portal includes your domain

## Security Best Practices

1. **Never commit secrets** - `.dev.vars` and `.env` are in `.gitignore`
2. **Use different secrets per environment** - Don't reuse JWT_SECRET between dev/prod
3. **Rotate secrets regularly** - Especially if a team member leaves
4. **Use Wrangler for production** - Don't use `.env` files in production
5. **Limit secret access** - Only give Cloudflare dashboard access to necessary team members

## Environment Variable Reference

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | Yes | Neon PostgreSQL connection |
| `JWT_SECRET` | Yes | JWT signing key |
| `SESSION_SECRET` | Yes | Session encryption |
| `RESEND_API_KEY` | Yes* | Email service API key |
| `XERO_CLIENT_ID` | No | Xero OAuth client ID |
| `XERO_CLIENT_SECRET` | No | Xero OAuth client secret |
| `GROQ_API_KEY` | No | AI features API key |
| `MONDAY_API_TOKEN` | No | Monday.com integration |
| `AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET` | No | Machine credential for post-deploy Workflows readiness/status smoke |
| `R2_*` | No | Cloudflare R2 storage |

*Required for magic link authentication to work
