# Client staging Worker fetch compatibility

PR585's bounded diagnostic was deployed from main35400298fe2caa2435892334378afd688ab81a7e
as management Worker version297c756f-e1cb-47f0-b75a-f0a19d855075 (100% read-back).
One signed-in Fantasy Limo staging update reported `network_redirect` before
receiving an HTTP response. This category does not prove an upstream redirect:
workerd rejects `redirect: 'error'` during request construction.

The [Cloudflare runtime implementation](https://github.com/cloudflare/workerd/blob/main/src/workerd/api/http.c%2B%2B)
accepts `follow` and `manual`. Four new tests against the actual bundled source
in Miniflare reproduced the failure in the hostname provider and HTTPS probe;
the outbound test server received zero requests before the fix.

Both requests now use manual redirect handling and reject unsuccessful or
redirected responses. Unused response bodies are cancelled. Credentials remain
restricted to the original fixed API endpoint; no redirect is followed. Scope,
provider identity, response-size bounds and existing deadlines remain enforced.
The probe helper is exported for the runtime test; no public Worker route was
added.

Validation: all47 runtime/provider/private-management tests and90 related
management/deployment/contract/API tests pass. Strict Worker TypeScript passes.
Independent end-to-end review found no required changes. Focused lint and the
guarded Worker dry run precede commit. The runtime tests contain no real tokens,
use an in-process outbound server and exercise both successful verification and
redirect rejection without contacting external services.

Remaining: merge/release this fix and verify Fantasy's actual snapshot, internal
page and assets before calling the preview shareable. The public form Turnstile
verifier has the same unsupported option; fix and runtime-test that separately
before hosted public-action activation (it requires the Pages release path).
Automatic checkpoint dispatch and full CMS/action acceptance remain unfinished.
