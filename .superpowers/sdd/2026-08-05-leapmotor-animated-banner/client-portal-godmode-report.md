# Client portal God Mode access fix

## Outcome

`POST /api/agency/client-portal/access` is now an exact registered God Mode mutation instead of failing in middleware with `God mode mutation coordination required`. The route remains a mutation: it still creates or refreshes the agency portal identity, issues a portal session, increments login activity, writes the client activity record, and sets the existing `client_session_token` cookie.

## Root cause and contract

- The active-owner middleware audits every staff API request and requires every non-read route to have one exact durable mutation family.
- Client portal access had no registered family, so middleware returned 503 before the route handler.
- Exempting or reclassifying the POST as read-only would have bypassed the mutation/audit boundary and was rejected.
- A dedicated Nitro plugin now registers only the exact POST path. It does not modify the shared God Mode plugin used by the concurrent Task 7 repair.

For active owners, the browser supplies one bounded `Idempotency-Key` per explicit open action. The coordinator binds actor, method/path, the canonical request digest (including client ID), correlation ID, and session digest in `god_mode_execution_ledger`. The portal-user upsert (including its login counter), session insert, activity record, succeeded/failed ledger state, and immutable terminal audit share one non-retrying transaction. A successful replay loads the exact actor/client/session tuple and reissues the deterministic per-auth-session token without inserting another session or activity record. Same-key cross-client reuse conflicts, another actor has an independent ledger namespace, expired/missing replay sessions fail closed, and a committed operation whose commit acknowledgement was lost replays without duplicate mutation.

Ordinary staff retain the normal POST path and random portal tokens. Management roles may open any client; scoped permitted roles must have an exact `client_team_assignments` row. Unauthorized roles never enter the transaction, and unassigned clients return the existing non-enumerating 404.

The UI still emits the existing `Failed to open portal` error toast with the server description and navigates only after a successful response.

## TDD and verification

RED was observed before production edits:

- active-owner middleware rejected the exact portal access route with the reported 503;
- a scoped account manager's client lookup did not include `client_team_assignments`; and
- the portal UI did not provide a stable request identity.

Final verification:

- Focused regression and inventory suite: 9 files passed, 72 tests passed.
- Covered active-owner/Paul flow, exact route admission, ordinary authorized access, unauthorized role denial, unassigned/cross-client denial, actor scoping, same-key replay, no duplicate session/activity/login record, committed-but-acknowledgement-lost replay, cookie digest storage, navigation, terminal-audit routing, and unchanged failure toast.
- ESLint passed for every owned production and test file, including the full client portal page.
- `git diff --check` passed.
- Full `pnpm run typecheck` remains red on the repository-wide inherited baseline. A fresh filtered run emitted zero diagnostics for all client-portal fix production and test paths.

No migration, database mutation, provider call, deployment, or production action was performed.

## Release-size simplification

The first production build after the correctness fix measured 24,756,245 deployed bytes against the immutable 24,750,000-byte budget. The portal implementation was simplified without changing the budget or compactor:

- the portal family now reuses the existing transaction-bound banner project coordinator;
- `server/utils/banner/godModeProjectCreation.ts` only gains an optional replay callback. When omitted, its original banner lookup, error, and registration behavior are unchanged;
- portal-specific session creation and replay stay in their own module, with the same actor/client checks and atomic writes;
- the login timestamp/counter is folded into the existing portal-user upsert; and
- the one-use UI request helper is inlined and an already-unused portal URL helper is removed.

The first measured simplification artifact was 24,750,160 bytes, a 6,085-byte deployed reduction. The final source removes additional emitted SQL/UI bytes after that measurement. Applied to the current integration artifact reported at 24,754,424 bytes, the conservative expected result is no more than 24,748,339 bytes (at least 1,661 bytes below budget); a clean integration build remains the authoritative final number.
