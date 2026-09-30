# Customer preview provisioning — RND-21

Continue PR604 with the distinct standalone actor/session contract. Use the existing private coordinator and customer D1/runtime executor. No public signup activation, production allocation, payment or editor grant.

1. Retain one immutable staging provisioning intent per approved preview site. Derive scope and initial content-only template from retained site data, authenticate the native customer session, and never replace the initiating login on retry. Keep actual customer identities rather than creating portal actors.
2. Add a distinct customer actor in Dashboard/Studio provisioning contracts. Fresh authority must match the retained intent, verified session/account/identity, workspace ownership, exact business/site binding, live preview entitlement and explicit operator approval. Deny production and forged/cross-customer/revoked inputs.
3. Fence checkpoint acceptance with the same customer authority transaction. Preserve customer provenance without submitting it through legacy agency/client staging authority. Existing editor/publishing adapters stay closed; no automatic Ready claim.
4. Verify real PostgreSQL intent/replay/revocation/rollback and checkpoint races; extend Studio protocol and executor tests to customer actors and independent resource scopes. Run existing regressions and fresh final review, then push paired draft PRs and update canonical PRD.

Deferred to the next UI/runtime acceptance slice: customer-facing create/progress/dashboard routes, customer editor sessions, automatic staging/publishing and hosted two-database acceptance. The current service remains internal until those adapters and rollout configuration are complete.
