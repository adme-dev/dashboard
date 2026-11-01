# FigFlow initialization completion slice

Worktree HEAD observed during implementation: `ec0dcd39e`. No merge, stash, branch operation, or release action was performed.

## Scope and implementation

Changed only the four owned files:

- `server/utils/email-marketing/designInitialization.ts`
- `server/api/email/design/drafts/initialize.post.ts`
- `test/unit/emailDesignInitialization.test.ts`
- `test/unit/emailDesignInitializationRoute.test.ts`

Closed the two requested initialization findings:

1. **Authorization precedes kind classification.** After owner locking and the existing actual/expected client check, the service now awaits fresh authorization before checking `template_kind`. A revoked caller on a library row receives the authorization failure rather than `TEMPLATE_DRAFT_REQUIRED`; an authorized caller still receives the draft-only error. Missing/wrong-scope behavior remains `NOT_FOUND` before authorization.
2. **Initialization returns exact head metadata.** Added dedicated `InitializeTemplateDesignDraftResult`, extending the existing receipt only within this service with `schemaVersion: 0 | 1` and `origin: 'legacy' | 'design'`. The same transaction and exact-head query now select `r.schema_version` and `r.origin`, returning those values with the unchanged `documentId` / `revisionId`. The route includes both fields in its locator response.

The parent-added `LEGACY_CONTENT_CHANGED` behavior is preserved: the exact-head SQL still compares `to_jsonb(t)=r.payload` for schema 0 and throws without replacing or appending a snapshot when legacy content diverged. Existing heads, repeated initialization, snapshot creation, and the global `DesignRevisionReceipt` were not changed.

## RED / GREEN verification

The RED run had 22 tests with six targeted failures: authorization order on library rows, legacy and structured service metadata, and legacy and structured route response fields.

Final commands:

```sh
pnpm exec vitest run test/unit/emailDesignInitialization.test.ts test/unit/emailDesignInitializationRoute.test.ts
pnpm exec eslint server/utils/email-marketing/designInitialization.ts server/api/email/design/drafts/initialize.post.ts test/unit/emailDesignInitialization.test.ts test/unit/emailDesignInitializationRoute.test.ts
```

Final results: **2 test files / 22 tests passed**, and ESLint passed for all four owned files. Vitest emitted the repository's existing Vite `configLoader: native` / `__dirname` warning.

## Limits and parent ownership

- Verification used mocked service transactions/database and mocked route boundaries. No real PostgreSQL integration tests were changed or run, and no database was accessed.
- Parent owns actual PostgreSQL integration updates, current-main/release checks, merge, and deployment.
- No other source, documentation, migration, integration test, dependency, commit, or deployment was touched; unrelated dirty files remain intact.
