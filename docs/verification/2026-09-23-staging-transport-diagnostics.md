# Client staging transport diagnosis

The Fantasy Limo hostname is attached to the correct staging service and its
HTTPS service probe returns 200. The root URL still returns 404 because there
is no active snapshot. A fresh signed-in Update staging attempt reached the
management Worker but failed its initial Cloudflare hostname list request before
receiving an HTTP response. Production telemetry identified only `network`.

The provider adapter now reports a fixed transport category for known timeout,
abort, invalid-header, redirect, request-context, TLS, DNS, connection and generic
TypeError failures. Exception text is inspected locally with a 512-character
bound; exception content, credentials, URLs and provider bodies are never emitted.
Unknown errors retain the generic category. The error returned to the caller,
redirect refusal, exact hostname/provider identity checks and retry behavior are
unchanged. This is diagnostic instrumentation, not a claim that staging is fixed.

Nine transport regressions failed before implementation. All 88 provider,
management Worker and deployment tests pass, as does strict Worker TypeScript.
A guarded Worker dry run and independent review precede release. After deployment,
perform one authorized preview update and inspect its category before changing
provider configuration or retrying again. Preserve existing production pointers.
