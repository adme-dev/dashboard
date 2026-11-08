# Explicit accounting permissions

Base: fresh origin/main c9c81b62b8337efa7ca2d1325228805994122c9b. The canonical checkout has 426 pre-existing changes and is untouched. User authorises closing the accounting access gap and enforcing granted permissions; release is part of completing this security fix.

## Policy

An active user must have a fresh, explicit FINANCE grant on their exact assigned database role (or assigned system role when no custom role exists). No legacy role-name, cached context, development-mode or owner/God-mode bypass supplies accounting access. Read-only roles cannot mutate accounting even with FINANCE. The current granted users are Clara, Paul, Accounts and Robert at adme.net.au; no email allowlist or Finance grant is added. The documented system Account Manager role receives its existing intended INVOICE_OWN_CLIENTS grant explicitly; custom roles and individual assignments are unchanged. A later grant/revocation must take effect on the next request.

Guard all accounting HTTP families before cache/token/provider access. Cover financial assistant retrieval and execution, not just page visibility. Keep marketing ad-spend/budget work and existing own-client invoice/portal scopes separate. Callback may preserve recognised identity-only Xero sign-in without binding accounting for a non-Finance user. Real account connection writes require Finance write authority.

Machine access uses nonempty configured secrets, exact methods and bounded read paths; no synthetic owner or unconfigured-secret bypass. Keep existing independent webhook validation and do not broaden anonymous routes. Grant no new identities. Do not fabricate staff sessions or customer/accounting activity.

Client commercial summaries and project planning budgets remain available with fresh CLIENTS permission. Campaign spend and budget setting retain MEDIA_BUYING/MARKETING_MANAGEMENT paths. Invoice access requires fresh FINANCE or INVOICE_OWN_CLIENTS plus current active client assignments; scoped staff may create/edit their own drafts only. Sending and recording payments require Finance write permission. Internal employee rates and company margins remain Finance-only.

## Tasks

- [x] Fresh Finance authority with unit and real PostgreSQL denial/revocation/read-only tests.
- [x] Central server route policy and middleware; explicit UI Finance gates; existing Finance role helpers use the fresh gate.
- [x] OAuth shared-connection binding checks and identity-only fallback tests.
- [x] Strict machine-job authentication and bounded verified internal read fanout.
- [x] Financial tools/vector/saved-plan context fresh permission checks.
- [ ] Targeted regressions, independent adversarial review, current-main reconciliation, guarded production build/release and real authorised readback.

## Threats and acceptance

Unauthorised staff must receive 403 before any financial DB/vector/cache/provider call; invalid/absent sessions remain 401 and permission lookup failures 503. A cached FINANCE group, owner role or dev runtime cannot elevate a denied grant. Grant revocation and read-only edits are checked freshly. Machine secrets are never selected from request body, missing/empty configured values never authenticate, and machine read credentials cannot authorise writes or arbitrary routes. The four existing Finance users retain access; marketing remains usable. No production data writes are needed for proof.

The existing graph has 24,328 nodes and pre-path-ID collisions; its Finance/Xero query provided context only. Current source and live role membership are authoritative. No graph rebuild or generated wiki claims are used as release evidence.

## Review record

Independent non-author reviews covered current authority SQL, HTTP/machine/OAuth boundaries, client/project commercial preservation, scoped invoice mutations, AI/MCP execution, expense ownership and authority-grant writers. The foreign invoice provenance finding and normal MCP Finance read finding were fixed and independently re-reviewed. Final scoped review found no Critical/Important blockers. Combined targeted tests: 653 passed; actual PostgreSQL: 45 passed.
