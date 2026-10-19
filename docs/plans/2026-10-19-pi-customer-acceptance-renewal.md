# Pi customer acceptance renewal

The normal invited customer launched Studio using Chrome's native Launch Studio
button. Its unchanged, unrevoked session `e482df0a-a677-4b6f-90fa-1c5bb7e5b889`
expired at 2026-10-19T03:42:12Z. The retained editor's page GET, checkpoint POST
and Pi start-draft POST returned 401 `TOKEN_INVALID` after 03:57 UTC. This proves
browser access closes after natural expiry; it is not a replay test of an expired
signed token because the browser also expires its authentication cookie.

Studio release receipt PR138 passed Linux and Windows CI and merged as
`4dc6331d3274d1dbbb87490b2e8ca0332ebcced5`. Pi remains disabled.

## Scoped preview renewal

Cloudflare's preview is deployment `e07ed0a4-547c-4d23-9ce0-852ac14b2a41`, source
`ce6e92b05eb6917272729ba24c7e8af38feeb930`. That source includes current main
`6b82be128f29101324f4d3db7930ec30f45d1d7d` and 19 already-deployed customer-launch
commits. Preserve that exact application code rather than remove those features
when renewing the test window.

Change only preview `PAGE_STUDIO_CUSTOMER_SIGNUP_EXPIRES_AT` from
2026-10-15T10:30:00Z to **2026-10-20T04:00:00Z**. Retain the existing two approved
mailbox hashes, exact preview origin, sender and all other configuration. No
production signup, Pi admission, customer capability, paid build allowance,
publication, domain or database entitlement changes are included.

The existing native preview plans are separately expired. Renewing login does
not renew those plans or authorize editing, publication or paid AI. Test normal
sign-in, account visibility and cross-account denial before deciding which
supported entitlement workflow is needed. Never rewrite creation receipts or
session expiries to make acceptance pass.

## Verification and execution

- [x] Fresh current-main ancestry and prior preview source verified.
- [x] Signup and deployment-guard suites: 55 tests pass across four files.
- [ ] Guarded `pnpm deploy:preview` and provider source/config readback.
- [ ] Approved-mailbox login and two-account isolation checks.
- [ ] Production configuration and deployment remain unchanged on readback.

The first test invocation required Nuxt's generated tsconfigs; `nuxt prepare`
resolved that setup prerequisite and the actual tests then passed. Application
code is unchanged from the live preview. Evidence is archived under
`Worktree Archives/2026-10-19/pi-acceptance-renewal/`.
