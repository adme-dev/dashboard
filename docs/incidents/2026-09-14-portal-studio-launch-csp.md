# Portal Studio launch CSP recovery — 14 September 2026

The portal's current popup launcher submits its signed editing-session token to the configured Studio origin. Every portal document on main restricted form submissions to `'self'`. The initial `about:blank` popup inherits that policy, so a cross-origin Studio launch was blocked even after client-side navigation from login to the website workspace.

This repair was reconciled selectively from PR519 (`b1be71745c8a9729018464a5a442ecb68fe25507`) onto freshly fetched main `0f45827e150d6fb20800710dd174586b20548be0`. It recovers only the middleware allowance and its regression coverage; it does not merge the historical branch. That main includes the Geist font recovery from PR545.

## Boundary

Only portal HTML documents add the origin parsed from server runtime configuration `public.pageStudioEditorUrl` to `form-action`. The value must be an explicit HTTPS URL without credentials, wildcard, whitespace, backslash or directive separator. Paths, queries and fragments do not enter the CSP. There is no request-supplied origin. Empty or malformed configuration keeps the self-only policy.

All portal documents, including login and project pages, need the allowance because client-side navigation keeps the original document's policy. Portal API responses retain the original self-only policy. Every other security directive and header remains unchanged. This follows the CSP [form-action navigation restriction](https://w3c.github.io/webappsec-csp/#directive-form-action).

## Verification

- Before implementation, four recovered portal-document regression cases failed against main with `form-action 'self'`.
- After implementation, 34 tests passed across portal-security middleware, Page Studio workspace launch and Geist font loading. Coverage includes every initial portal document, malformed configuration, origin normalization, unchanged security headers and unchanged API policies.
- Targeted ESLint passed after correcting test quote style.
- Actual installed Chrome ran four isolated fixtures using the real middleware and launcher source. Each starts at `/portal/login`, navigates with `history.pushState` to `/portal/page-studio`, then opens the normal popup: main blocked the POST (zero receiver requests); the repair allowed one POST to the configured editor; an unconfigured target and malformed configuration remained blocked (zero receiver requests). Successful launch had no CSP violation.
- Browser network was intercepted with synthetic session data. No production credentials or customer data were used, and no request reached a live Studio service. This does not prove the live authenticated portal-to-editor journey, which remains a release acceptance check.

No merge or deployment was performed as part of this recovery. Before release, refresh main, preserve the current font/navigation and other integrations, run required checks, and verify the deployed portal login-to-editor journey on the exact released source.

Full CI on rebased source `cf2cea998` passed 13,345 tests but rejected the frozen security-gate inventory: the middleware adds one configured-origin runtime lookup. The follow-up explicitly records that line as unrelated configuration, updates the measured count/digest and leaves all authorization/bypass classifications unchanged. Required CI is rerun before integration.
