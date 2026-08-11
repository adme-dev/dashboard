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

### Google Ads AI Max readiness

```bash
GOOGLE_AI_MAX_NOTIFICATIONS_ENABLED=false
```

`GOOGLE_AI_MAX_NOTIFICATIONS_ENABLED` controls internal AI Max migration alerts and
the daily unresolved digest. It defaults to disabled: only the exact string `true`
enables delivery. Keep it absent or `false` through migration and first-scan comparison,
then enable it only after the media-team sign-off in
`docs/runbooks/google-ai-max-readiness.md`. The scanner and readiness page remain
read-only regardless of this flag.

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
the production Workflows smoke gate. Store the raw random value in GitHub
Actions only, and store its SHA-256 verifier in Pages deploy config:

- GitHub Actions repository secret `AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET`, so
  the deploy job can send `x-workflow-smoke-secret` while running
  `pnpm run smoke:agency-workflows:ci` after Cloudflare Pages deploys.
- Cloudflare Pages non-secret var
  `AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET_SHA256` in `wrangler.toml`, so
  `/api/agency/workflows/readiness` and `/api/agency/workflows/status` can
  validate the header without relying on a duplicated encrypted secret value.

This is a diagnostic-only credential. It does not replace
`WORKFLOW_SERVICE_SECRET` or `WORKFLOW_CALLBACK_SECRET`, and it should not be
set only on the separate `agency-workflows` Worker. A Cloudflare Pages
`AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET` secret is still accepted as an operator
fallback, but the committed SHA-256 verifier is the CI path of record.

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

### CRM search release and sealed evaluation

| Binding | Runtime | Purpose |
|---|---|---|
| `CRM_SEARCH_RESOURCE_APPROVAL_VERIFICATION_KEYRING` | Pages | Active Ed25519 public verification keys for signed `resource_provision` bootstrap envelopes. |
| `CRM_SEARCH_RESOURCE_MANIFEST` | CRM search consumer | Signed exact environment resource envelope; not an unsigned JSON readback. |
| `CRM_SEARCH_RESOURCE_MANIFEST_VERIFICATION_KEYRING` | CRM search consumer | Independent active Ed25519 public verification keyring for resource manifests. |
| `CRM_SEARCH_RELEASE_APPROVAL_VERIFICATION_KEYRING` | Protected release runner | Active Ed25519 public keyring for immutable deployment approval artifacts. |
| `CRM_SEARCH_ARTIFACT_VERIFICATION_KEYRING` | Protected release runner | Independent active Ed25519 public keyring used to verify the canonical exact-file frozen artifact before either Pages or Worker mutation. |
| `CRM_SEARCH_EVIDENCE_VERIFICATION_KEYRING` | Protected release runner | Independent active Ed25519 public keyring for the bounded privacy-safe release evidence; the approval must pin its exact canonical hash. |
| `CRM_SEARCH_RELEASE_APPROVAL_DATABASE_URL` | Protected release runner | Direct, non-pooler Neon URL used only for the fresh approval/revocation/rate-card readback immediately before each spawn. Never expose it to Pages or a Worker. |
| `CRM_SEARCH_ARTIFACT_SIGNING_KEY_VERSION` | Release-artifact CI environment | Active key ID for artifact production. CI-only; never configure on an application runtime. |
| `CRM_SEARCH_ARTIFACT_SIGNING_PRIVATE_KEY_PEM` | Release-artifact CI environment | Ed25519 private key for the build-once artifact envelope. CI-only and independently protected from approval/evidence keys. |
| `CRM_SEARCH_ENVIRONMENT` | CRM search consumer | Exact `preview` or `production` identity checked against the signed envelope. |
| `CRM_SEARCH_SEALED_HOLDOUT_KEYRING` | Pages evaluation runtime | Dedicated AES-256-GCM keyring; no process-environment fallback. |

The signed resource manifest contains an exact `externalIntegrations` inventory for `database`, provider APIs, Meta, Google, audience writers, Xero, email delivery, Monday, Slack, outbound webhooks, Google Sheets, and Social Dashboard. Every entry is either explicitly disabled or carries a stable verified target/account identity digest and verification timestamp. A different secret digest is not target isolation. An enabled preview entry must name a verified target distinct from production; unknown, omitted, inherited, malformed, or production-equal identities fail before deployment or provider work. The committed preview environment keeps `CRM_EMAIL_CONVERSATIONS_ENABLED`, all three `PERSONA_*_WRITES_ENABLED` flags, `MCP_GEN_TOOLS_ENABLED`, and `MCP_BANNER_TOOLS_ENABLED` false.

Neon execution additionally requires a signed `production_migration` approval envelope and an injected direct-Neon readback immediately before both branch creation and migration. Verification covers the approval ID/revision, implementation SHA, artifact/binding/evidence digests, cost ceiling, reason, expiry, and separated requester/approver actors. The branch request and signed target attestation bind the accepted approval ID/revision and exact digests. A caller-built authority object is never accepted; dry-run emits only the required proof plan.

Keyrings are bounded/versioned and may not reuse CRM search service, confirmation, analytics, or cron secrets. Missing, malformed, expired, retired, tampered, wrong-environment, or wrong-target evidence fails closed before provider or deployment work. The Task 18 release scripts execute only a dry-run in this repository state.

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
| `AGENCY_WORKFLOWS_SMOKE_SHARED_SECRET_SHA256` | No | Pages-side verifier hash for the Workflows smoke credential |
| `R2_*` | No | Cloudflare R2 storage |

*Required for magic link authentication to work
