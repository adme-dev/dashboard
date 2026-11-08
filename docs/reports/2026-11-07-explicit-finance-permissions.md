# Explicit accounting permission boundary

Source base: `c9c81b62b8337efa7ca2d1325228805994122c9b` (fresh origin/main). Changes are isolated from the canonical checkout's existing work.

Company accounting requires a fresh explicit FINANCE grant on the active member's exact assigned database role. Owner/God mode, development mode, static role defaults and cached groups cannot supply the grant. Read-only roles cannot mutate accounting. Accounting HTTP routes, connection binding, AI context, SDK tools and both direct and normal MCP execution enforce this boundary before data/provider work. Finance navigation resolves current grants independently of cached role policy.

Live database verification on 7 November 2026 showed exactly four active Finance users: accounts@adme.net.au, clara@adme.net.au, paul@adme.net.au and robert@adme.net.au. No Finance grants, individual assignments or custom-role policies were added. Grant-changing administration endpoints additionally require fresh writable ADMIN permission.

Marketing campaign billing, spend and budget management retain their existing media permissions. CLIENTS retains commercial summaries, planning budgets and billing terms. INVOICE_OWN_CLIENTS permits current assigned-client invoice reads and own-draft work; sending and recording payments require writable Finance. Project/time-entry provenance cannot disclose foreign-client data. Employee expense submissions and own-record workflows remain available; cross-staff accounting and approvals require Finance. Staff roster/capacity stays available while hourly rates are Finance-only.

Migration 504 is idempotent and adds only the documented INVOICE_OWN_CLIENTS permission to the system account_manager role. It does not add Finance, modify custom roles or reassign users. The migration was tested twice in disposable PostgreSQL, applied automatically to the configured application database and read back successfully.

Machine accounting access requires nonempty configured secrets, exact methods and bounded read routes. Missing secrets and arbitrary paths cannot establish accounting authority.

Verification: 885 targeted tests passed across 71 suites after updating compatibility fixtures and keeping the strict God-mode inventories explicit about the Finance/ADMIN exception. Five actual PostgreSQL suites passed 45 tests, including active/exact-role permissions, revocation, read-only denial, invoice row locks/current assignments, provenance redaction, employee expense authority, AM migration and commercial workflow preservation. Test databases are disposable localhost databases; no fabricated staff sessions, customer enquiries, provider writes or campaign spend were used. Independent integrated and final scoped reviews reported no remaining Critical/Important findings. New source/test files pass ESLint; older files retain pre-existing lint/type-check debt, with the production build recorded separately.

Authenticated baseline: Paul retains Finance permission and GET /api/xero/status responds 200. This browser's baseline reports connected=false; a successful permission response is not evidence of an active Xero connection or provider delivery.

Release source, deployment ID and post-deploy browser acceptance are recorded in the release receipt after release.

The broad local suite was interrupted after disk exhaustion and browser-launch failures. No full-suite pass is claimed; the provisioned GitHub CI pipeline remains the full-suite gate. All failures attributable to the changed Finance policy found before interruption were addressed with explicit-grant fixtures and reverified in the 885-test run. No application code changed in this follow-up.
