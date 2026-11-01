# Standalone Worker legacy template CRUD spike

## Owned changes

Only `workers/email-design-spike/` files were changed. The parent-owned handlers already existed and were read, not created or edited:

- `server/utils/email-marketing/templateUpdateHandler.ts`
- `server/utils/email-marketing/templateDeleteHandler.ts`

The spike now explicitly maps six routes: the original four draft routes plus:

- `PATCH /api/email/templates/:id` → canonical `templateUpdateHandler.ts`
- `DELETE /api/email/templates/:id` → canonical `templateDeleteHandler.ts`

`scanDirs` remains empty, so there is still no broader auth/admin/API discovery. The draft feature flag is not applied to legacy CRUD. Canonical require-write, session, permission, client-scope, renderer, and versioned-template constraint handling remain unchanged. No actor headers, delegation flow, or GodMode capability was added; unsupported template PATCH/DELETE delegation stays denied.

## Admission ceiling and dependency graph

- Added the canonical graph's required implicit `readBody` h3 autoimport.
- Mirrored the existing optional rendering/native external package list in both bundle phases; nothing was installed.
- Kept the private environment/header and JWT admission checks before dynamic Nitro loading.
- Kept `DESIGN_ACTION_LIMITS.envelopeBytes` as the default outer body limit.
- For legacy template PATCH only, the outer admission ceiling is now exactly `MAX_RENDER_REQUEST_BYTES + DESIGN_ACTION_LIMITS.envelopeBytes`. This is an admission-only overhead allowance before Nitro buffering; it does not raise or bypass the renderer's own `MAX_RENDER_REQUEST_BYTES` limit or canonical validation.
- DELETE has no special body path or elevated allowance.

## Actual build and Miniflare evidence

Rebuilt successfully with exact Node `24.18.0`, Nitro `2.13.4`, and the outer esbuild step. The emitted route table contains exactly the six expected method/route pairs. The outer build retains the previously observed non-fatal `??` warning from canonical design code; no canonical source was changed.

All twelve sequential one-worker Miniflare scenarios passed with compatibility date `2026-07-08`, `nodejs_compat` alone, deadlines, and final disposal:

1. The original nine admission cases: disabled flag, missing/invalid/mismatched environment, missing/fallback secret, oversized draft chunk, no-token denial, and wrong-key versus configured-key JWT behavior.
2. Legacy PATCH and DELETE with the draft flag absent both reach canonical 401 `Unauthorized` for a missing token.
3. Legacy PATCH with `DESIGN_ACTION_LIMITS.envelopeBytes + 1` bytes is admitted by the higher legacy ceiling and reaches canonical 401 rather than being incorrectly rejected at the draft limit.
4. A chunked legacy PATCH above `MAX_RENDER_REQUEST_BYTES + DESIGN_ACTION_LIMITS.envelopeBytes` returns 413 `design_request_too_large` before canonical auth.

No real secret, database, renderer, deployment, or production binding was used. Focused ESLint and `git diff --check` passed.

Final outer artifact: **803,870 raw bytes / 215,919 gzip bytes** (`Z_BEST_COMPRESSION`). Nitro's intermediate report was 492 kB / 143 kB gzip.

## Remaining acceptance

Parent must rerun its actual local-PostgreSQL, renderer-RPC, route, permission/scope, constraint-conflict, revocation, and cleanup integration coverage against this expanded artifact. These no-token admission tests do not prove successful CRUD, runtime rendering, or production readiness. Transport, private-entry configuration, and release decisions remain with the parent.
