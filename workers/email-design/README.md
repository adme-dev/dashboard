# Private email design service

The private Worker owns versioned draft reads/saves, metadata, initialization and
actor-bound round-trip proposals/apply/cancel. It has no public route, workers.dev
URL, preview URL, cron or sending capability. Pages mounts only a bounded design
transport; existing template PATCH/DELETE stay local in Pages.

## Session authority

The activation release replaces the copied JWT_SECRET requirement with the
existing canonical Pages `/api/auth/me` endpoint, also used by Creative Suite.
`server/utils/auth.ts` imports the canonical signature-verification port;
only this Worker's Nitro build aliases it to `sessionToken.ts`. Pages retains
its unchanged HMAC verifier and key. The private Worker stores no signing key.
Its build rejects an artifact that contains the old local fallback verifier.

Each verification calls a fixed production or preview authority URL with the
exact bearer token, no cookies, no redirects or cached verdicts, an 8-second
request bound and 32 KiB response bound. A successful active user must match the
original token's userId before claims are returned. Existing validateSession and
design access checks still freshly query active staff, revocation, roles and
client scope. There is no caller-selected actor or alternative auth grant.
Authority outages fail closed with 503 and retain existing mutation recovery.

Admission requires exact EMAIL_DESIGN_ENVIRONMENT and its private matching
request header plus EMAIL_DESIGN_SESSION_AUTHORITY=pages-auth-me-v1. It bounds
streamed request bytes before Nitro buffers them. Current reviewed production
configuration enables draft saves; staging remains disabled. The deployment
guard enforces these exact values and the existing target/source/resource rules.

## Routes

| Method | Path |
|---|---|
| GET / PATCH | `/api/email/design/drafts/:id` |
| PATCH | `/api/email/design/drafts/:id/metadata` |
| POST | `/api/email/design/drafts/initialize` |
| POST | `/api/email/design/roundtrip` |
| PATCH / DELETE | `/api/email/templates/:id` (prepared canonical handlers; Pages remains local) |

Migrations 491–493 are already applied to the verified production database.
No sending/publication/module pipeline is introduced. Legacy writes cannot
silently overwrite a structured versioned owner.

Use Node 24.18.0 and the existing scripts: `pnpm build`, `pnpm test:admission`,
`pnpm deploy:check`, `pnpm deploy:production`. Actual deployment requires clean
exact fetched main. Pages must use its separate guarded deploy command.

The opt-in real Worker/PostgreSQL/native-WASM fixture remains in
`test/integration/emailDesignWorker.database.test.ts`. It intercepts the canonical
authority into an isolated synthetic fixture; real hosted acceptance is separate.
See `docs/email-builder/figflow-roundtrip-milestone.md` and the release receipt for
exact deployment and acceptance status. No user password or JWT secret is needed
from the operator to provision this service.
