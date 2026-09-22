# Staging hostname failure diagnostics

The first hosted Fantasy Limo staging request retained `HOST_UNAVAILABLE` with
one build admission. Cloudflare showed no custom domain, and public DNS did not
resolve. The management secret binding exists; its dedicated account token is
active with Workers Scripts Write. This is evidence of an unresolved hostname
failure, not a successful preview or a proven credential fault.

Provider failures now record only a fixed event, operation, reason and numeric
HTTP status (or null). URLs, tenant/site identifiers, credentials, response
bodies and exception messages are excluded. Validation and response limits
remain enforced; there is no automatic mutation retry.

Verification: the two diagnostic regression tests failed before implementation.
All 18 provider tests then passed, and the affected four-suite section passed
78 tests. Focused ESLint and management Worker strict typecheck passed.
Independent review read both changed source/test files and found no issues.

Next: deploy this diagnostic, capture the next authorized provider attempt,
resolve its cause, then verify HTTPS, snapshot content and client isolation.
Do not advertise the Fantasy hostname as ready before those checks pass.
