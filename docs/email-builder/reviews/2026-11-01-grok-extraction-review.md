# FigFlow template PATCH/DELETE extraction

Read-only review of `/Users/paulgiurin/orca/workspaces/dashboard/figflow-edm-release-20261101` at `ee3608c00`. No source edits, no test run, and no Pages rebuild. `git diff 75098e165..HEAD` is empty for the design routes, `server/utils/email-marketing`, the spike Nitro config, the proxy test, the delegation test, and the worker database test. Banner and Brief commits on this HEAD are outside those paths.

## Verdict

No blocker in the moved handlers, the shared transport, or the authority split. Template `PATCH` and `DELETE` skip the draft flag and still require the private binding. The handlers keep write access, scope checks, and the typed constraint mapping. The transport still forwards the original request and does not derive an actor. Template mutations stay off the delegation allow-list.

The parent’s six-route measurement on `75098e165` is raw `25467070` against budget `25468928` (1,858 bytes under) and gzip `7338339`, 2,228 bytes under the failed candidate. That number is evidence for that base only. `ee3608c00` still needs its own Pages build after configuration is ready.

## Transport

`server/utils/email-marketing/designTransport.ts` is the only handler exported by:

- `server/api/email/design/[...path].ts`
- `server/api/email/templates/[id].patch.ts`
- `server/api/email/templates/[id].delete.ts`

Those files remain normal `server/api` routes, so Pages middleware still runs before the hop. `GET` template, template create, import, render, and test-send stay in their own route files.

A path matches the legacy gate only when it is `PATCH` or `DELETE` on `/api/email/templates/` plus 36 hex-or-hyphen characters (lines 18–19). That match skips `FIGFLOW_EDM_DRAFT_SAVES_ENABLED` (lines 22–24). Draft routes keep the old allow-list and the string `true` flag. `edm_templates.id` is a UUID (`server/database/migrations/133-email-templates.sql` line 8), so the 36-character gate matches the column. It is still not a strict UUID version check.

Every accepted route, including template edits with the flag off, then requires `EMAIL_DESIGN.fetch` to be a function and `PAGE_STUDIO_RELEASE_ENVIRONMENT` to be `production` or `staging` (lines 25–29). The handler clones the request, overwrites `x-xeroflow-email-design-environment` from Pages env, copies status, headers, and body, forces `cache-control: no-store`, and turns any throw into one 503 `design_service_unavailable` (lines 30–41). It does not read the session or invent an actor.

`test/unit/emailDesignProxy.test.ts` covers template `PATCH` and `DELETE` with the flag absent: 200 and `no-store` when the binding answers, and 503 `no-store` when it does not. Those four cases do not repeat the cookie, body, or delegation-header assertions. The clone they share is the same one the draft tests already check.

## Handlers and worker mount

`templateUpdateHandler.ts` and `templateDeleteHandler.ts` are the previous route bodies. Update still parses the same Zod body, calls `requireWriteAccess`, checks scope on the existing row and on a supplied `client_id`, renders with `createEmailRenderer` from the request env, and maps constraint errors through `rethrowLegacyDesignConflict`. Delete still requires write access, loads the row, checks client access, and uses the same mapper. `designConflict.ts` is unchanged and is no longer imported by a Pages route file.

`workers/email-design-spike/nitro.config.ts` mounts those two util files at `PATCH` and `DELETE` `/api/email/templates/:id`, beside the four draft handlers. It does not mount the Pages reexports. Its h3 preset includes `readBody`. The checked-in runtime artifact is still the four-route bundle: `emailDesignWorker.database.test.ts` calls absolute `/api/email/templates/:id` and is red 404 until the six-route bundle is the artifact under test. That 404 is the missing route, not a flag check inside the handler. Kimi still owns admission and that bundle.

## Authority

Pages auth and rbac still see template `PATCH` and `DELETE` before the proxy. The worker handlers call `requireWriteAccess` again. With no delegation header, that slow path reloads the session and permission groups from the database.

`x-god-mode-internal-execution` is forwarded with the original request. `isAllowedGodModeInternalExecutionTarget` is still false for template `PATCH` and `DELETE`. `test/server/utils/godModeInternalExecutionDelegation.test.ts` lines 378–379 assert those two negatives. A present header still fails closed before session fallback, on Pages and again in worker `requireAuth`. No second delegation owner was added.

God-mode mutation coordination stays on the H3 event. Template routes are not a registered mutation family, and they are not delegated targets, so this move does not remove a working delegated or god-mode template edit. Ordinary admin and owner JWTs do not need that bypass.

## Size context

Parent measurement, not remeasured here: six-route extraction on `75098e165` raw `25467070` / `25468928`, 1,858 bytes left, gzip `7338339`, 2,228 bytes below the failed candidate. Both owned implementation markers were absent from that Pages output. The design sources are unchanged at `ee3608c00`. The final budget claim waits for a build of this HEAD.
