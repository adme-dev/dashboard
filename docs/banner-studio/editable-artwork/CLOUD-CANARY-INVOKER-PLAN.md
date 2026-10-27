# Native canary invoker plan: private RPC through a loopback Wrangler session

27 October 2026. **This is a plan for root to review. It is research only.** No
Wrangler session, deployment, remote RPC call, native run, Docker operation,
secret read, login, install, or git change was made while writing it. The only
file written is this one. The canary package, its retained artifacts and all
candidate code are unchanged.

It covers the package described in [CLOUD-NATIVE-CANARY.md](CLOUD-NATIVE-CANARY.md)
and [CLOUD-CANARY-REPAIR.md](CLOUD-CANARY-REPAIR.md). Source read:
`workers/banner-engine/canary/worker.ts` (SHA-256 `f03b5379…66c0`, which matches
the repair record) and `wrangler.jsonc` (`ca3b7486…c759`). Kimi owns image
attestation. Root owns the Pages release, the canary deployment, the admission
flip and the one approved run. Nothing here authorizes any of those.

## Recommendation in one paragraph

Run a **throwaway, never-deployed invoker Worker** under `wrangler dev`, bound to
`127.0.0.1`. Its only binding is a service binding with `remote: true` to
`banner-engine-native-canary`, entrypoint `NativeCanaryControl`. Wrangler 4.110
supports this path in its source, and Cloudflare documents it as *the* way to
reach a deployed Durable Object from local dev. The invoker's code runs on the
operator's Mac. Its `env.BANNER_NATIVE_CANARY.run()` call goes from a local
Miniflare proxy client over a capnweb WebSocket to an ephemeral, preview-token
gated proxy Worker that Wrangler uploads as an **edge preview** (not a
deployment). That proxy Worker then calls the real `NativeCanaryControl.run()`
over a normal service binding. No public run endpoint is added. No production
app, route, Pages project or deployed Worker is changed. Nothing persists after
`Ctrl-C` except what the canary itself records.

## 1. How the path works in installed Wrangler 4.110.0

Versions checked: `pnpm exec wrangler --version` → `4.110.0`;
miniflare `4.20260708.1`; workerd `1.20260708.1`; capnweb `0.5.0` (bundled).
All paths are under `node_modules/`.

| Step | What happens | Evidence |
| --- | --- | --- |
| 1 | `wrangler dev` (local mode) bundles the invoker and checks whether any binding is remote. | `wrangler-dist/cli.js:364558–364571` calls `maybeStartOrUpdateRemoteProxySession` unless `dev.remote === false` (that is, unless `--local` is passed). |
| 2 | Only bindings marked `remote: true` are selected for the proxy. Vars and `.dev.vars` are **not** sent. | `pickRemoteBindings`, `cli.js:363909–363918`. |
| 3 | Wrangler starts a *second* worker, `templates/remoteBindings/ProxyServerWorker.ts`, with `dev.remote: "minimal"`, `server.port: 0`, `inspector: false`. Its bindings are the selected remote bindings. | `startRemoteProxySession`, `cli.js:363779–363808`. |
| 4 | That worker is uploaded as an **edge preview**. The upload is `POST /accounts/<id>/workers/scripts/<invoker-name>/edge-preview` with `wrangler-session-config: {"workers_dev":true,"minimal_mode":true}`. The host is `<invoker-name>.<account-subdomain>.workers.dev`. Every request carries `cf-workers-preview-token`. The token is refreshed every 50 minutes. | `createPreviewSession` / `createPreviewToken`, `cli.js:212052–212128`; header injection `cli.js:363324–363334`; `PREVIEW_TOKEN_REFRESH_INTERVAL = 50*60*1e3`, `cli.js:170770`. |
| 5 | The upload metadata keeps the named entrypoint: `{ type: "service", service, entrypoint }`. | `cli.js:149510–149527`. |
| 6 | On the local side, a remote service binding becomes `{ name, entrypoint, props, remoteProxyConnectionString }`. This branch is checked **before** the default dev-registry branch. | `buildMiniflareBindingOptions`, `cli.js:169937–169949`. |
| 7 | Miniflare swaps the binding for a `remote-proxy-client` worker. Any property other than `fetch` (here `run` and `status`) is forwarded to a capnweb `newWebSocketRpcSession`, on `ws://<local proxy>/?MF-Binding=BANNER_NATIVE_CANARY`. | `miniflare/dist/src/index.js:80715–80730`; `dist/src/workers/shared/remote-proxy-client.worker.js:2288–2335`. |
| 8 | The remote `ProxyServerWorker` resolves `env[MF-Binding]` and serves it as the capnweb main object. capnweb treats a workerd `ServiceStub` (a service binding) as an RPC target. So the call path `["run"]` with arguments `[]` becomes `env.BANNER_NATIVE_CANARY.run()` on the real binding. | `templates/remoteBindings/ProxyServerWorker.ts` (SHA-256 `b88aa01f…e2f3`), `getExposedJSRPCBinding` + `newWorkersRpcResponse`; capnweb `typeForRpc`, `remote-proxy-client.worker.js:78`. |
| 9 | `NativeCanaryControl.run()` forwards to the fixed DO name. `run(...args)` rejects any argument. | `worker.ts:173–176`, `worker.ts:67–68`. |

**Account selection trap, verified in source.** The remote proxy session does
*not* use the invoker's `account_id`. In the `wrangler dev` path it is called
without an auth hook (`cli.js:364561–364567`), so `resolveDevConfig`
(`cli.js:210592`) runs `requireAuth()` against the **proxy template config**,
which has no `account_id`. `getActiveAccountId` (`cli.js:123900`) then picks, in
order: a temporary account, then `config.account_id` (absent), then
`CLOUDFLARE_ACCOUNT_ID`, then **the cached last-used account**. **Always export
`CLOUDFLARE_ACCOUNT_ID`.** Without it, a stale account cache can silently send
the preview to the wrong account.

**Interactive mutation traps, verified in source.** If the account has no
workers.dev subdomain, `getWorkersDevSubdomain` offers to **register one**
(`cli.js:147838–147870`). `confirm()` returns the fallback (`false`, which
declines) when the session is non-interactive or `CI` is set
(`cli.js:121791–121800`, `116732–116740`). Logged-out or expired-token sessions
also stop with an error rather than opening a browser login when
non-interactive (`cli.js:123975–123985`). **Run every command with `CI=true`.**
Never pass `--temporary`, `--remote`, `--local` or `--tunnel`.

## 2. Supported versus inferred

| Claim | Status |
| --- | --- |
| Remote service bindings work in `wrangler dev`. Deployed DOs are reached through a deployed Worker that is bound with a remote service binding. | **Documented.** [Local development → Remote bindings](https://developers.cloudflare.com/workers/local-development/) ("Accessing remote Durable Objects/Workflows via service bindings"). [Bindings per env](https://developers.cloudflare.com/workers/local-development/bindings-per-env/) marks Service Bindings ✅ for remote connections and Durable Objects ❌ (so the DO cannot be bound directly). |
| A service binding can target a named `entrypoint`. | **Documented** ([configuration → service bindings](https://developers.cloudflare.com/workers/wrangler/configuration/), [RPC](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/)). For *remote* bindings the entrypoint is carried end to end **in source** (table rows 5–6). The docs do not show a remote + entrypoint example. |
| JS RPC (not only `fetch`) works over a remote service binding. | **Source-supported** (rows 7–8: capnweb WebSocket, `ServiceStub` → `rpc-target`). Not executed here. |
| The edge preview creates no deployed script, version, route or workers.dev deployment, and leaves nothing behind after the session. | **Inferred** from the `edge-preview` endpoint and preview-token gating. Verify after the session (§6). |
| The preview host is reachable only with the preview token. | **Inferred** from the header use in source. The token exists only in Wrangler's memory. |
| The capnweb WebSocket survives a call lasting up to about 5 minutes without traffic. | **Unknown.** Neither the docs nor the source give an idle timeout. Treat a lost reply as likely and design for it (§5). |
| An in-flight `run()` continues inside the DO if the caller's WebSocket closes. | **Inferred.** The canary was built for lost acknowledgements either way: the alarm fences and destroys, and `status()` returns the record. |
| `wrangler tail` shows the RPC with entrypoint and method (`NativeCanaryControl.run - Ok @ …`). | **Source-supported** in the pretty formatter (`cli.js:304745`, `rpcMethod` detection `cli.js:304781`). JSON field names are inferred. |
| The local dev server and the proxy-session server listen only on loopback. | **Source-supported.** `--ip 127.0.0.1` for the invoker. The proxy session uses the template config default `localhost` (`cli.js:34883`, `210633–210641`). Verify with `lsof` (§4.4). |

Rejected alternatives:

- **`getPlatformProxy` Node script.** The first call to an RPC method that is not
  known to be async goes through Miniflare's synchronous `Atomics.wait` bridge
  (`miniflare/index.js` `#call`/`#syncCall`). Remote RPC through it is unverified.
- **`wrangler dev --remote`.** This runs the invoker's own HTTP handler on a
  workers.dev preview, which is more exposure for no benefit.
- **A deployed private invoker Worker.** This adds infrastructure and a standing
  HTTP surface.
- **A hand-rolled capnweb client.** This depends on an internal protocol.
- **Cloudflare dashboard or API.** As far as I know, no API invokes a named
  entrypoint. That is inferred.

## 3. Proposed files (scratch directory only, never committed or deployed)

Root creates these in a fresh directory **outside the repository**. The
`.dev.vars` file holds a local-only nonce and the two non-secret expected pins.
Per row 2, `.dev.vars` is never uploaded.

`$SCRATCH/wrangler.jsonc`:

```jsonc
{
  "name": "banner-native-canary-invoker-local",
  "main": "invoker.ts",
  // Must be ≤ the installed workerd (1.20260708.1); a later date fails with
  // ERR_FUTURE_COMPATIBILITY_DATE. Matches the existing workerd tests.
  "compatibility_date": "2026-07-01",
  "account_id": "<32-hex-account-id>",
  "workers_dev": false,
  "preview_urls": false,
  "services": [
    {
      "binding": "BANNER_NATIVE_CANARY",
      "service": "banner-engine-native-canary",
      "entrypoint": "NativeCanaryControl",
      "remote": true
    }
  ],
  "dev": {
    "ip": "127.0.0.1",
    "port": 8799,
    "inspector_ip": "127.0.0.1",
    "local_protocol": "http",
    "enable_containers": false,
    "generate_types": false
  }
}
```

The invoker defines no Durable Object, container, route, cron, queue or other
binding. So its Miniflare cannot host a local `NativeCanary`, and no Docker is
involved. `account_id` here is for documentation and the guard only. The
operative account is `CLOUDFLARE_ACCOUNT_ID` (§1).

`$SCRATCH/invoker.ts`:

```ts
interface Control { run(): Promise<unknown>; status(): Promise<unknown> }
interface Env {
  BANNER_NATIVE_CANARY: Control
  INVOKER_NONCE: string
  EXPECTED_PACKAGE_SHA256: string
  EXPECTED_OUTER_IMAGE: string
}

// Second fence only; the DO's durable consumption record is the real one.
let runAttempted = false
const encoder = new TextEncoder()

function authorized(request: Request, env: Env): boolean {
  const given = encoder.encode(request.headers.get('x-canary-invoker') ?? '')
  const want = encoder.encode(env.INVOKER_NONCE ?? '')
  return want.byteLength === 64 && given.byteLength === want.byteLength
    && crypto.subtle.timingSafeEqual(given, want)
}

function reply(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body, null, 2),
    { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } })
}

function pins(record: unknown, env: Env) {
  const r = record as { packageSha256?: unknown, outerImage?: unknown } | null
  return {
    packageSha256: r?.packageSha256 === env.EXPECTED_PACKAGE_SHA256,
    outerImage: r?.outerImage === env.EXPECTED_OUTER_IMAGE
  }
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default {
  async fetch(request, env) {
    // Browsers attach Origin to cross-site POSTs and cannot send the custom
    // header without a preflight (OPTIONS → 404 here); DNS rebinding lacks the nonce.
    if (request.method !== 'POST' || request.headers.has('origin') || !authorized(request, env)) return reply(404, null)
    if ((request.headers.get('content-length') ?? '0') !== '0' || request.headers.has('transfer-encoding')) return reply(400, { error: 'body-forbidden' })
    const path = new URL(request.url).pathname
    const at = new Date().toISOString()
    if (path === '/status') {
      try { return reply(200, { op: 'status', at, record: await env.BANNER_NATIVE_CANARY.status() }) }
      catch (error) { return reply(502, { op: 'status', at, error: 'status-failed', message: message(error) }) }
    }
    if (path !== '/run') return reply(404, null)
    if (runAttempted) return reply(409, { op: 'run', at, error: 'invoker-run-latched' })
    runAttempted = true
    let before: unknown
    try { before = await env.BANNER_NATIVE_CANARY.status() }
    catch (error) { return reply(502, { op: 'run', at, error: 'pre-status-failed-run-not-called', message: message(error) }) }
    if (before !== null) return reply(409, { op: 'run', at, error: 'already-consumed-run-not-called', record: before, pins: pins(before, env) })
    try {
      const record = await env.BANNER_NATIVE_CANARY.run()
      return reply(200, { op: 'run', at, returnedAt: new Date().toISOString(), record, pins: pins(record, env) })
    } catch (error) {
      // Includes pre-consumption refusals (e.g. canary-disabled-or-unpinned) AND
      // post-consumption transport loss. Never retry; read status() instead.
      return reply(502, { op: 'run', at, error: 'run-threw-or-reply-lost', message: message(error) })
    }
  }
} satisfies ExportedHandler<Env>
```

`$SCRATCH/.dev.vars` (mode `0600`):

```
INVOKER_NONCE=<64 hex chars from openssl rand -hex 32>
EXPECTED_PACKAGE_SHA256=60d764cfd1fefc45e5437fe87e9cf424b2ddd5318aba53244f5b5cb9a876d339
EXPECTED_OUTER_IMAGE=registry.cloudflare.com/<32-hex-account-id>/banner-engine-native-canary@sha256:<64-hex-manifest-digest>
```

`$SCRATCH/hdr` (mode `0600`) is the curl header file. Using it keeps the nonce
out of `ps` argv:

```
x-canary-invoker: <same 64 hex chars>
```

The invoker is root-owned review material. Before first use, root should run
`pnpm exec tsc --noEmit` against it with `@cloudflare/workers-types`, or
esbuild-only, to check it. Do **not** run `wrangler deploy --dry-run` on any
canary config; per the canary record, it builds the container image.

## 4. Exact procedure for root

Run everything from the repository root so `pnpm exec wrangler` resolves to the
pinned 4.110.0. `ACCOUNT_ID` is the 32-hex account embedded in the canary's
registry image reference. `VERSION_ID` is the canary version root recorded at
deploy time.

### 4.1 Session environment and scratch

```sh
export CI=true WRANGLER_SEND_METRICS=false
export CLOUDFLARE_ACCOUNT_ID='<ACCOUNT_ID>'
export WRANGLER_LOG=info          # never debug: debug logging may include request headers (inferred risk)
unset CLOUDFLARE_INCLUDE_PROCESS_ENV CLOUDFLARE_LOAD_DEV_VARS_FROM_DOT_ENV
SCRATCH=$(mktemp -d /tmp/banner-canary-invoker.XXXXXX); chmod 700 "$SCRATCH"
export WRANGLER_REGISTRY_PATH="$SCRATCH/registry"; mkdir "$WRANGLER_REGISTRY_PATH"   # empty, private dev registry
# write wrangler.jsonc, invoker.ts, .dev.vars, hdr as in §3; chmod 600 .dev.vars hdr
pnpm exec wrangler --version      # must print 4.110.0
```

**Credentials.** Use the existing Wrangler session as it is. Per the official
`whoami`/login docs, OAuth is stored in `~/.config/.wrangler/config/default.enc`
with its key in the macOS Keychain. Never open, print or copy that file, the
keychain entry, or any `CLOUDFLARE_API_TOKEN`. Never run `wrangler auth token`,
which prints the token. Check only for *presence* of an env token:
`[ -n "${CLOUDFLARE_API_TOKEN+x}" ] && echo 'env API token set'`. If one is set,
it overrides OAuth, and root must decide deliberately which identity to use. If
the session has expired, the command stops (`CI=true`). Logging in again is a
separate root decision, outside this plan. If Access protects workers.dev on
this account, the proxy fails with an Access block page and asks for
`CLOUDFLARE_ACCESS_CLIENT_ID/SECRET`. **Stop there.** Creating service tokens
is out of scope.

### 4.2 Read-only target guards (all must pass before starting the session)

```sh
pnpm exec wrangler whoami --account "$CLOUDFLARE_ACCOUNT_ID"
#   expect: the intended user, membership in exactly ACCOUNT_ID, no "temporary" account
pnpm exec wrangler deployments status --name banner-engine-native-canary --json > "$SCRATCH/deploy-before.json"
#   expect: one version at 100%, id == VERSION_ID
pnpm exec wrangler versions view "<VERSION_ID>" --name banner-engine-native-canary --json > "$SCRATCH/version-before.json"
#   expect: BANNER_NATIVE_CANARY_PACKAGE_SHA256 == 60d764…d339,
#           BANNER_NATIVE_CANARY_OUTER_IMAGE == the exact registry digest ref,
#           BANNER_NATIVE_CANARY_ENABLED == "false" (probe) or "true" (approved run only),
#           DO binding NATIVE_CANARY → NativeCanary; no routes; workers_dev false
pnpm exec wrangler deployments status --name banner-native-canary-invoker-local
#   expect: an error that the Worker does not exist (the invoker name must stay undeployed)
pnpm exec wrangler containers list --json > "$SCRATCH/containers-before.json"
#   record the banner-engine-native-canary application ID; then:
pnpm exec wrangler containers instances "<APPLICATION_ID>" --json
#   expect: no running instance
```

Any mismatch means stop. The account in `whoami`, `CLOUDFLARE_ACCOUNT_ID`, the
invoker's `account_id` and the 32-hex segment of the image reference must all
be the same string.

### 4.3 Start the loopback session (terminal A) and the tail (terminal B)

```sh
# A — leave running; Ctrl-C ends it
pnpm exec wrangler dev --config "$SCRATCH/wrangler.jsonc" \
  --ip 127.0.0.1 --port 8799 --inspector-ip 127.0.0.1 \
  --persist-to "$SCRATCH/state" --log-level info \
  --show-interactive-dev-session=false 2>&1 | tee "$SCRATCH/dev.log"

# B — hosted-side corroboration (creates a temporary tail on the canary; removed on exit)
pnpm exec wrangler tail banner-engine-native-canary --format pretty 2>&1 | tee "$SCRATCH/tail.log"
```

`dev.log` must contain `⎔ Establishing remote connection...`. It must show the
binding row `env.BANNER_NATIVE_CANARY (banner-engine-native-canary#NativeCanaryControl)`
with mode **remote**, and `Ready on http://127.0.0.1:8799`. It must not contain
`Failed to start the remote proxy session`, `needs to be run remotely`,
`not connected` or `Cloudflare Access`.

### 4.4 Loopback check

```sh
lsof -nP -iTCP -sTCP:LISTEN | grep -Ei 'workerd|node' | tee "$SCRATCH/listeners.txt"
# every listener belonging to this session must be 127.0.0.1 or [::1]; any *:port or LAN address → Ctrl-C and stop
```

### 4.5 Phase A: transport probe with `status()` (spends nothing)

Run this while the deployed version still has admission `false`.

```sh
curl -sS --max-time 60 -X POST -H @"$SCRATCH/hdr" --data-binary '' \
  http://127.0.0.1:8799/status | tee "$SCRATCH/status-probe.json"
```

Expect `"record": null`, and `NativeCanaryControl.status - Ok` in `tail.log` at
the same time. This proves that the remote RPC path reaches the hosted DO.
`status()` only reads storage. It creates no record, so no consumption happens.
Do **not** probe with `/run` while admission is disabled. It would be refused
before consumption (`worker.ts:71–73`), but it would still put a `run` call on
the evidence record, against the "call run once" rule.

Then press `Ctrl-C` in terminal A. Root performs its own separately approved
admission-enable redeploy, outside this plan. Repeat §4.2 against the **new**
`VERSION_ID`, now expecting `ENABLED == "true"`, and restart §4.3. Restarting
ties the session to a verified version.

### 4.6 Phase C: the single approved run

```sh
curl -sS --max-time 400 -X POST -H @"$SCRATCH/hdr" --data-binary '' \
  http://127.0.0.1:8799/run | tee "$SCRATCH/run.json"
curl -sS --max-time 60 -X POST -H @"$SCRATCH/hdr" --data-binary '' \
  http://127.0.0.1:8799/status | tee "$SCRATCH/status-after.json"
```

Send `/run` **once**. The invoker latches. It calls `status()` first, and calls
`run()` only if the record is `null`. On any `502` from `/run`, never call
`/run` again; follow §5.

### 4.7 Cleanup

```sh
# A and B: Ctrl-C (disposes the remote proxy session and the tail)
lsof -nP -iTCP -sTCP:LISTEN | grep -Ei 'workerd|node'          # no listener from this session remains
pnpm exec wrangler deployments status --name banner-native-canary-invoker-local   # still "does not exist"
pnpm exec wrangler deployments status --name banner-engine-native-canary --json > "$SCRATCH/deploy-after.json"
#   unchanged from the recorded version (nobody redeployed mid-run)
pnpm exec wrangler containers instances "<APPLICATION_ID>" --json > "$SCRATCH/instances-after.json"
#   expect no running instance once the record shows outerDestroyed true (or after the 5-minute alarm)
```

Next, root copies the evidence files to its retained location:
`dev.log`, `tail.log`, `listeners.txt`, `status-probe.json`, `run.json`,
`status-after.json`, `deploy-*.json`, `version-before.json`, `containers-*.json`
and `instances-after.json`. Do **not** copy `.dev.vars` or `hdr`. Then run
`rm -rf "$SCRATCH"` and `unset CLOUDFLARE_ACCOUNT_ID WRANGLER_REGISTRY_PATH`.

After that, root follows the canary's own retirement steps
([CLOUD-NATIVE-CANARY.md](CLOUD-NATIVE-CANARY.md)): disable admission, redeploy,
keep the tombstone and DO namespace, and decide infrastructure retirement
separately. `status()` keeps working after admission is disabled, because it
does not check admission. Any later read uses a fresh §4.1–§4.3 session plus
`/status` only.

## 5. Failure boundaries

The consumption boundary is the DO transaction plus `storage.sync()` in
`run()` (`worker.ts:74–85`). Everything before it spends nothing. Everything
after it has spent the one invocation.

| Failure | When | Spent? | Action |
| --- | --- | --- | --- |
| Not logged in or token expired, account mismatch, temporary account, wrong Wrangler version, no workers.dev subdomain, Access block, `Failed to start the remote proxy session`, preview upload rejected (for example, unknown service or entrypoint) | Before any RPC | No | Stop, fix outside this plan, restart from §4.1. |
| `/status` returns `502` | Probe | No | Transport not proven. Do not run. |
| `/run` → `409 already-consumed-run-not-called` | Before `run()` | Already spent earlier | Evidence of an earlier consumption. Report it and never call `run()`. |
| `/run` → `502 pre-status-failed-run-not-called` | Before `run()` | No | Latched. Restart the session. Root decides whether to try again. |
| `/run` → `502` with `canary-disabled-or-unpinned` or `canary-arguments-forbidden` | Refused before the transaction | No | Deployed config is wrong. Fix through root's deploy and re-verify §4.2. |
| `/run` → `502` with another or transport message (WebSocket close, `curl` timeout, Wrangler crash, laptop sleep) | Unknown; possibly after consumption | **Assume yes** | Never call `run()` again. Wait at least 6 minutes, past the 5-minute DO deadline. Start a fresh session and call `/status` only. A record of `uncertain`/`stopped`/`finished` is final. If the record is still `null` after that wait, the call never reached the transaction. Retrying is a new root decision, not an automatic one. |
| `/run` → `200` with `record.state` `uncertain` or `stopped`, or `pins` false | After consumption | Yes | Final. Do not retry. Record it as an unsuccessful hosted canary. |
| Someone else's local process or browser hits the proxy-session WebSocket port | Any time during the session | Possibly | Residual risk (§7). Detect it with the `consumedAt` and `tail.log` timeline. |

## 6. Telling hosted evidence from a local simulation

A record counts as **hosted evidence** only if **all** of these hold:

1. `dev.log` shows `Establishing remote connection` and the binding in mode
   *remote*, without `--local`. On its own this is weak: the binding table
   reports `remote` straight from config (`cli.js:150729–150741`).
2. `WRANGLER_REGISTRY_PATH` was a fresh, empty directory. If the remote session
   had failed, the fallback (`cli.js:169946–169950`) resolves the service through the
   dev registry. An empty private registry means any local `wrangler dev` of
   the canary on this machine cannot answer. The invoker config has no DO or
   container, so it cannot host `NativeCanary` itself.
3. `tail.log` for the **deployed** `banner-engine-native-canary` shows
   `NativeCanaryControl.status` and `NativeCanaryControl.run` events. Their
   timestamps must bracket the invoker's `at`/`returnedAt`, and their outcomes
   must match.
4. `deploy-before.json` and `deploy-after.json` show the same single version,
   whose `versions view` vars equal the expected pins. The invoker's `pins` are
   both `true`, and `record.outerImage` is the exact
   `registry.cloudflare.com/<ACCOUNT_ID>/…@sha256:` reference.
5. The Containers instance listing for the canary application shows that an
   instance existed for the run window, and that none is running afterward.

These signs mean **local simulation, or not proven**:

- Any record produced by `test/banner/engineCloudCanary*.test.ts` or another
  local workerd run. Those tests use compatibility date `2026-07-01`, local
  SQLite, and synthetic container transport.
- A missing `Establishing remote connection` line.
- Binding mode `local`/`not connected`, or errors such as
  `Binding … needs to be run remotely`.
- An empty `tail.log` over the call window.
- A changed deployment version.

The receipt's runtime fields (Docker version, cgroups, architecture) support
the hosted claim. They are not proof alone, because a local `wrangler dev` of
the canary with Docker could produce similar fields. Item 2 plus item 3 is what
excludes that case.

## 7. Residual risks root accepts or declines

- **Local, unauthenticated proxy port.** For the session's duration, the
  proxy-session listener (random port on `localhost`) accepts capnweb
  WebSockets with `MF-Binding=BANNER_NATIVE_CANARY`. It checks no nonce or
  Origin; that is inferred from the template, which has no such check. Any
  same-user process, including other agents on this shared Mac, could call
  `run()` through it. A malicious web page could too, because browsers do not
  apply CORS to WebSockets. Chrome's Local Network Access permission may block
  that (inferred).

  Mitigations: keep the session to minutes; pause other agents' Cloudflare
  work; do not browse during the window; rely on the DO one-shot record. Even an
  early trigger produces exactly one consumption, and `consumedAt` and
  `tail.log` would reveal it. The invoker nonce protects only the invoker's own
  port.
- **Preview token scope.** The preview token can call every remote binding in
  the session, which here is only this one. It lives in Wrangler's memory and
  rotates every 50 minutes.
- **Long call over a WebSocket.** A lost reply is plausible (§2), and it is
  handled by `status()` reads, not retries.
- **Edge preview side effects.** That the edge preview leaves no persistent
  object is inferred. §4.7 checks that the invoker name still does not exist.
- **Shared dirty checkout.** Wrangler, Miniflare and workerd come from this
  worktree's `node_modules`. They are not reinstalled, and nothing here changes
  them.

## 8. Sources

Official (retrieved live 27 October 2026; `/workers/development-testing/`
redirects to `/workers/local-development/`):

- [Local development, remote bindings, Access, security considerations](https://developers.cloudflare.com/workers/local-development/)
- [Supported bindings per development mode](https://developers.cloudflare.com/workers/local-development/bindings-per-env/)
- [Wrangler configuration: service bindings `entrypoint`](https://developers.cloudflare.com/workers/wrangler/configuration/)
- [Service bindings](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/) and [RPC (WorkerEntrypoint)](https://developers.cloudflare.com/workers/runtime-apis/bindings/service-bindings/rpc/)
- [Wrangler general commands: `dev`, `whoami`, credential storage](https://developers.cloudflare.com/workers/wrangler/commands/general/)
- [Wrangler API: `startRemoteProxySession`](https://developers.cloudflare.com/workers/wrangler/api/)

Installed source (read-only):

- `node_modules/wrangler/wrangler-dist/cli.js` (4.110.0): line references in §1, §2 and §6
- `node_modules/wrangler/templates/remoteBindings/ProxyServerWorker.ts` and `wrangler.jsonc`
- `node_modules/.pnpm/miniflare@4.20260708.1/node_modules/miniflare/dist/src/index.js` and `dist/src/workers/shared/remote-proxy-client.worker.js`
- Local CLI help only (`--version`, `deployments status`, `versions view`, `containers list|instances`, `tail`, `whoami --help`). These ran with `CI=true` and no authenticated command.

Review base: shared dirty checkout `adme-dev/banner-editable-artwork`, HEAD
`47ec30c3522f6ab660d730776709770c8a22d7c8`. No fetch or reconciliation was done.
