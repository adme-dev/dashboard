# Dashboard loading after login

Robert reported successful magic-link authentication followed by a blank page in
Safari 27. His console showed auth status `logged_in`, a Vue null-component
unmount error and a workspace request without a response. The exact Safari
unmount error has not yet been reproduced locally.

An independently reproducible defect was found: 18 dashboard widgets awaited
their initial requests at the top of setup. Under the page's Suspense boundary,
a stalled widget prevented the surrounding dashboard from mounting. Role and
widget changes could also remove components with pending async setup.

Initial requests now begin in `onMounted`, preserving each widget's existing
loading UI, success/error handling and user-triggered refresh behavior. The page
can mount before the responses arrive. No authentication checks are changed.

## Evidence

- All 18 pending-request regression cases failed against the previous widgets:
  the surrounding dashboard heading was absent.
- All 37 runtime tests pass after the fix: every affected widget handles pending
  and rejected requests without suspending the page, navigation remains possible
  before completion, and a delayed successful client response renders normally.
- With related dashboard checks, 44 tests pass.
- New test lint passes. The 18 existing Vue files have 309 baseline lint
  diagnostics; rule, severity, message and source positions match current main
  exactly. This change introduces no additional lint diagnostics.
- Independent review read every changed widget and the tests end-to-end, with
  no actionable findings.
- A local browser harness using the actual My Clients component displayed the
  surrounding dashboard while its request was deliberately unresolved, then
  rendered the delayed client response with zero captured rendering errors.

This proves the loading defect and its fix, not Safari-specific acceptance.
Production build, CI, deployment and Robert's original Safari flow still require
verification before the login incident can be declared resolved.
