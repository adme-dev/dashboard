# FigFlow current-main Pages size

Read-only. No rebuild, no source edit, no guard change. Numbers below are the parent measurements, not a new local size run.

Parent measurements:

- Budget raw `25468928`.
- `2cfbdab98` candidate raw `25468856`, 72 bytes under.
- Current main `75098e165` split build raw `25469298`, gzip `7339434`, 370 bytes over.
- Delta from the passing candidate: `25469298 - 25468856 = 442` bytes.
- Parent also reports the Pages proxy at about 1 KB and `toWebRequest` at about 180 bytes newly bundled.
- Parent reports native tests passing. This review did not run them.
- Parent reports the new runtime suite passing all four design routes, the renderer RPC, and local Postgres. The assertion limits of that suite are in `/private/tmp/figflow-runtime-grok-review.md`.

## Recommendation

Keep the proxy guards. Do not shave the allow-list, `cache-control: no-store`, the `production|staging` environment check, the environment-header overwrite, the string `true` flag check, or the single redacted 503. Those are the Pages security boundary. A 180-byte `toWebRequest` removal cannot close a 370-byte gap, and a hand-rolled clone would be a second request path.

The smallest safe durable choice, if `75098e165` must fit this budget, is to forward the existing canonical template `PATCH` and `DELETE` handlers through the same private worker:

- Add explicit worker routes for those two handlers. Leave `scanDirs` empty.
- Keep Pages auth and rbac in front of the hop, using the same request-owned `EMAIL_DESIGN` fetch the design proxy uses.
- Make the binding mandatory for that legacy CRUD. A missing or non-function binding is 503 before dispatch.
- Do not put these two routes behind `FIGFLOW_EDM_DRAFT_SAVES_ENABLED`. With the flag off they must still forward. Gating them would 404 today's template update and delete.
- Keep `rethrowLegacyDesignConflict` as it is (`server/utils/email-marketing/designConflict.ts`). It maps `55000` / `email_design_scope_copy_required`, `55000` / `email_design_revision_required`, and `23503` / `email_design_documents_template_id_fkey` to 409 and rethrows every other error. It does not copy database `detail`. The only production importers are `server/api/email/templates/[id].patch.ts` and `[id].delete.ts`.

That is a real rollout, not a byte shave. Today those two routes run inside Pages and do not need `EMAIL_DESIGN`. After the move, template update and delete fail closed until the service binding exists in `wrangler.toml`, including while draft saves stay flag-gated. The private worker must repeat session, write access, and scope checks, because its Nitro config does not mount Pages middleware. Lost replies stay one 503 with no retry. Rollout tests have to cover flag-off forward, missing binding 503, the three constraint 409s, unrelated errors rethrown, viewer or guest denial on Pages, and cache `no-store`. The current runtime suite does not call template `PATCH` or `DELETE`.

Measure the Pages raw total after the move before calling the budget cleared. The unique Pages graph is those two handler bodies plus `designConflict.ts`. It does not include the renderer client. `createEmailRenderer` remains imported by campaign create and patch, template create, import, render, and test-send, both page-studio form helpers, and the dynamic import in `server/utils/ai/marketing/departmentEmailOperations.ts`. `templates.ts` remains imported by template get, list, create, and import. If the measured drop is 370 bytes or less, stop. Do not continue into the proxy guards, and do not treat this move as a size win until the build says so.

`75098e165` is over budget on the parent's raw number. The last reported pass remains `2cfbdab98` at 72 bytes under. This review did not rebuild either tree.
