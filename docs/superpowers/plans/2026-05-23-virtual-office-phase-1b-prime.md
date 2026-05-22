# Virtual Office — Phase 1b' (Finish & Ship) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Provision two CF RealtimeKit presets + three worker secrets via API, expose a `forceRelay` config knob in `useOfficeRealtime`, redeploy the worker, deploy a Pages preview, run the existing test suite green, then hand off to Paul for UAT and merge.

**Architecture:** Two stages. (a) **Infrastructure**: invoke CF REST API to create presets on the RealtimeKit application Paul provisions in pre-flight, then `PUT` three secrets onto `office-room-worker`. (b) **Code**: add a tiny `resolveForceRelay()` helper with unit tests, surface `officeForceRelay` in `runtimeConfig.public`, then pass `defaults.forceRelay` through `RealtimeKitClient.init()`. All infra ops are idempotent + observable via API GETs.

**Tech Stack:** Cloudflare REST API (curl), Cloudflare Workers (Wrangler), Nuxt 4 (`runtimeConfig`), `@cloudflare/realtimekit` Core SDK, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-23-virtual-office-phase-1b-prime-design.md`

---

## Pre-flight (Paul-driven — required before plan can start)

These two steps must be done before Task 1. They are NOT part of the plan but are required input.

- **1b'-01:** Cloudflare dashboard → Realtime → RealtimeKit → "Create application" → name `agency-virtual-office` → save the **App ID** (UUID).
- **1b'-02:** Cloudflare dashboard → My Profile → API Tokens → "Create Token" → custom token with `Account > Realtime Kit > Edit` permission on the new app → save the **API token value** (it's only shown once at creation).

Paste both values into chat:

```
APP_ID=<uuid-from-step-01>
API_TOKEN=<token-from-step-02>
```

The executor reads these from chat and exports as shell env vars for the remainder of the plan. The token value is never written to a file, never echoed in shell output, never committed.

---

## Conventions used in this plan

Throughout, the executor sets these once at session start (after Paul pastes values):

```bash
export CLOUDFLARE_API_TOKEN=$(grep '^CLOUDFLARE_API_TOKEN=' /Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval/.env | cut -d= -f2-)
export CLOUDFLARE_ACCOUNT_ID=a5b299b3ad15c1b5b895dc66f9357b17
export APP_ID=<paste-from-Paul>
export RK_TOKEN=<paste-from-Paul>        # the Realtime-Kit-scoped token from 1b'-02
```

`$CLOUDFLARE_API_TOKEN` is the broader account token used for Workers secret writes; `$RK_TOKEN` is the scoped Realtime-Kit token that the worker uses at runtime.

---

## Task 1: Verify CF token scopes before any destructive operation

**Files:** none — verification only.

- [ ] **Step 1: Verify token validity**

```bash
curl -s https://api.cloudflare.com/client/v4/user/tokens/verify \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq '.success'
```

Expected: `true`

- [ ] **Step 2: Probe Realtime Kit list scope on the new app**

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/realtime/kit/$APP_ID/presets" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq '.success'
```

Expected: `true` (empty `result` array is fine — that just means no presets yet). If `false` with code 7003 ("Could not route to..."), then `$APP_ID` is wrong — re-prompt Paul. If `false` with `authentication` errors, the token lacks `Realtime Kit:Edit` scope — STOP and report to Paul.

- [ ] **Step 3: Probe Workers Scripts:Edit scope (list secrets on office-room-worker)**

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/office-room-worker/secrets" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq '.success'
```

Expected: `true`. If `false`: token lacks `Workers Scripts:Edit` scope. STOP and ask Paul to either (a) update the token's scopes to include `Workers Scripts:Edit`, or (b) plan to do Tasks 5-7 manually via `wrangler secret put` (which takes ~90s total).

- [ ] **Step 4: Record scope state**

Print a one-line summary to the session output:
```
Scope probe: realtime_kit_edit=PASS, workers_scripts_edit=PASS (or FAIL with specific message)
```

No commit — verification only.

---

## Task 2: Create the `staff_full` preset via CF API

**Files:** none — API call only. Resource persists on CF side.

- [ ] **Step 1: Create the preset**

```bash
curl -s -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/realtime/kit/$APP_ID/presets" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "staff_full",
    "config": {
      "max_screenshare_count": 1,
      "max_video_streams": { "desktop": 6, "mobile": 2 },
      "media": {
        "audio": { "enable_high_bitrate": true, "enable_stereo": true },
        "video": { "frame_rate": 30, "quality": "hd" },
        "screenshare": { "frame_rate": 15, "quality": "vga" }
      },
      "view_type": "GROUP_CALL"
    },
    "permissions": {
      "media": {
        "audio": { "can_produce": "ALLOWED" },
        "video": { "can_produce": "ALLOWED" },
        "screenshare": { "can_produce": "ALLOWED" }
      }
    }
  }' | jq '{success, name: .result.name, id: .result.id, errors}'
```

Expected:
```json
{ "success": true, "name": "staff_full", "id": "<uuid>", "errors": null }
```

If `errors` contains code 1001 ("preset name already exists"), that's acceptable — pass through to Step 2 to verify.

- [ ] **Step 2: Verify it appears in the list**

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/realtime/kit/$APP_ID/presets" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq '.result[] | select(.name == "staff_full") | {name, id}'
```

Expected: object with `"name": "staff_full"` and a UUID `id`.

No commit (no local file changes).

---

## Task 3: Create the `viewer_lurking` preset via CF API

**Files:** none — API call only.

- [ ] **Step 1: Create the preset**

```bash
curl -s -X POST \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/realtime/kit/$APP_ID/presets" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "viewer_lurking",
    "config": {
      "max_screenshare_count": 1,
      "max_video_streams": { "desktop": 6, "mobile": 2 },
      "media": {
        "audio": { "enable_high_bitrate": true, "enable_stereo": true },
        "video": { "frame_rate": 30, "quality": "hd" },
        "screenshare": { "frame_rate": 15, "quality": "vga" }
      },
      "view_type": "GROUP_CALL"
    },
    "permissions": {
      "media": {
        "audio": { "can_produce": "NOT_ALLOWED" },
        "video": { "can_produce": "NOT_ALLOWED" },
        "screenshare": { "can_produce": "NOT_ALLOWED" }
      }
    }
  }' | jq '{success, name: .result.name, id: .result.id, errors}'
```

Expected:
```json
{ "success": true, "name": "viewer_lurking", "id": "<uuid>", "errors": null }
```

- [ ] **Step 2: Verify it appears in the list**

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/realtime/kit/$APP_ID/presets" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq '.result[] | select(.name == "viewer_lurking") | {name, id}'
```

Expected: object with `"name": "viewer_lurking"`.

- [ ] **Step 3: Confirm both presets together**

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/realtime/kit/$APP_ID/presets" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq '[.result[].name] | sort'
```

Expected: `["staff_full", "viewer_lurking"]` (alphabetical).

No commit.

---

## Task 4: Set `CF_ACCOUNT_ID` secret on `office-room-worker`

**Files:** none — API call only.

- [ ] **Step 1: PUT the secret**

```bash
curl -s -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/office-room-worker/secrets" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{ \"name\": \"CF_ACCOUNT_ID\", \"text\": \"$CLOUDFLARE_ACCOUNT_ID\", \"type\": \"secret_text\" }" \
  | jq '{success, name: .result.name, type: .result.type, errors}'
```

Expected:
```json
{ "success": true, "name": "CF_ACCOUNT_ID", "type": "secret_text", "errors": null }
```

- [ ] **Step 2: Verify secret exists in list**

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/office-room-worker/secrets" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq '.result[] | select(.name == "CF_ACCOUNT_ID") | {name, type}'
```

Expected: `{ "name": "CF_ACCOUNT_ID", "type": "secret_text" }`.

No commit.

---

## Task 5: Set `CF_REALTIMEKIT_APP_ID` secret on `office-room-worker`

**Files:** none — API call only.

- [ ] **Step 1: PUT the secret**

```bash
curl -s -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/office-room-worker/secrets" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{ \"name\": \"CF_REALTIMEKIT_APP_ID\", \"text\": \"$APP_ID\", \"type\": \"secret_text\" }" \
  | jq '{success, name: .result.name, type: .result.type, errors}'
```

Expected:
```json
{ "success": true, "name": "CF_REALTIMEKIT_APP_ID", "type": "secret_text", "errors": null }
```

- [ ] **Step 2: Verify**

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/office-room-worker/secrets" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq '.result[] | select(.name == "CF_REALTIMEKIT_APP_ID") | {name, type}'
```

Expected: `{ "name": "CF_REALTIMEKIT_APP_ID", "type": "secret_text" }`.

No commit.

---

## Task 6: Set `CF_REALTIMEKIT_API_TOKEN` secret on `office-room-worker`

**Files:** none — API call only.

- [ ] **Step 1: PUT the secret**

```bash
curl -s -X PUT \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/office-room-worker/secrets" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  -H "Content-Type: application/json" \
  -d "{ \"name\": \"CF_REALTIMEKIT_API_TOKEN\", \"text\": \"$RK_TOKEN\", \"type\": \"secret_text\" }" \
  | jq '{success, name: .result.name, type: .result.type, errors}'
```

Expected:
```json
{ "success": true, "name": "CF_REALTIMEKIT_API_TOKEN", "type": "secret_text", "errors": null }
```

- [ ] **Step 2: Verify all three secrets together**

```bash
curl -s "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/workers/scripts/office-room-worker/secrets" \
  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" | jq '[.result[].name] | sort'
```

Expected: array containing at minimum `["CF_ACCOUNT_ID", "CF_REALTIMEKIT_API_TOKEN", "CF_REALTIMEKIT_APP_ID", "OFFICE_SYNC_SECRET"]`.

- [ ] **Step 3: Clear RK_TOKEN from shell**

```bash
unset RK_TOKEN
```

Reduces leak risk if the shell history file is inspected. No commit.

---

## Task 7: Add `resolveForceRelay` helper with unit tests

**Files:**
- Create: `app/composables/officeForceRelay.ts`
- Create: `test/app/composables/officeForceRelay.test.ts`

The helper isolates the runtime-config-reading logic so it's unit-testable without mocking Nuxt's auto-imports.

- [ ] **Step 1: Write the failing tests**

Create `test/app/composables/officeForceRelay.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { resolveForceRelay } from '~/composables/officeForceRelay'

describe('resolveForceRelay', () => {
  it('returns false when officeForceRelay is undefined', () => {
    expect(resolveForceRelay({ public: {} })).toBe(false)
  })

  it('returns true when officeForceRelay is boolean true', () => {
    expect(resolveForceRelay({ public: { officeForceRelay: true } })).toBe(true)
  })

  it('returns false when officeForceRelay is boolean false', () => {
    expect(resolveForceRelay({ public: { officeForceRelay: false } })).toBe(false)
  })

  it('returns false when officeForceRelay is the string "false"', () => {
    expect(resolveForceRelay({ public: { officeForceRelay: 'false' } })).toBe(false)
  })

  it('returns false when officeForceRelay is the string "true" — strict boolean only', () => {
    // Strict boolean comparison: only `true` (boolean) flips. String "true" does not.
    // Pages env vars come as strings; if someone sets NUXT_PUBLIC_OFFICE_FORCE_RELAY=true,
    // Nuxt's runtime config layer coerces it. This test documents that resolveForceRelay
    // does NOT do additional string coercion — that's Nuxt's job.
    expect(resolveForceRelay({ public: { officeForceRelay: 'true' } })).toBe(false)
  })

  it('returns false for any non-true value', () => {
    expect(resolveForceRelay({ public: { officeForceRelay: 1 } })).toBe(false)
    expect(resolveForceRelay({ public: { officeForceRelay: null } })).toBe(false)
  })
})
```

- [ ] **Step 2: Run the test to confirm it fails**

```bash
pnpm test:run test/app/composables/officeForceRelay.test.ts
```

Expected: FAIL with "Cannot find module '~/composables/officeForceRelay'" or similar.

- [ ] **Step 3: Write the minimal implementation**

Create `app/composables/officeForceRelay.ts`:

```ts
// Tiny helper isolating the runtime-config read for unit testability.
// Used by useOfficeRealtime to drive `defaults.forceRelay` on SDK.init.
// Strict boolean-true comparison — string "true" returns false. Pages env
// vars are string-typed; Nuxt's runtime config layer is expected to coerce
// NUXT_PUBLIC_OFFICE_FORCE_RELAY=true to a real boolean before reaching here.

export interface ForceRelayConfig {
  public: {
    officeForceRelay?: unknown
  }
}

export function resolveForceRelay(config: ForceRelayConfig): boolean {
  return config.public.officeForceRelay === true
}
```

- [ ] **Step 4: Run the test to confirm it passes**

```bash
pnpm test:run test/app/composables/officeForceRelay.test.ts
```

Expected: PASS — 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add app/composables/officeForceRelay.ts test/app/composables/officeForceRelay.test.ts
git commit -m "$(cat <<'EOF'
feat(office): resolveForceRelay helper for SDK init forceRelay flag

Isolates the runtime-config read so it's unit-testable without
mocking Nuxt auto-imports. Strict boolean === true comparison;
Nuxt's runtime config layer is responsible for string->boolean
coercion of NUXT_PUBLIC_OFFICE_FORCE_RELAY env var.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Surface `officeForceRelay` in `nuxt.config.ts` runtimeConfig

**Files:**
- Modify: `nuxt.config.ts` (add to `runtimeConfig.public`)

- [ ] **Step 1: Read current nuxt.config.ts to find the runtimeConfig block**

```bash
grep -n 'runtimeConfig\|public:' nuxt.config.ts | head -20
```

Locate the existing `runtimeConfig.public` block.

- [ ] **Step 2: Add `officeForceRelay: false` to runtimeConfig.public**

If `runtimeConfig.public` already exists, add a single line `officeForceRelay: false,` inside it. If it doesn't exist, add:

```ts
runtimeConfig: {
  public: {
    officeForceRelay: false,
  },
},
```

The exact placement depends on the existing config structure — preserve surrounding properties.

- [ ] **Step 3: Verify Nuxt typecheck doesn't break**

```bash
NODE_OPTIONS='--max-old-space-size=8192' pnpm exec nuxt typecheck 2>&1 | tail -30
```

Expected: no new errors mentioning `officeForceRelay`. (Pre-existing ~60 errors per CLAUDE.md known-issues are acceptable as long as the count doesn't grow.)

- [ ] **Step 4: Commit**

```bash
git add nuxt.config.ts
git commit -m "$(cat <<'EOF'
feat(office): runtimeConfig.public.officeForceRelay (default false)

Surface the forceRelay knob in Nuxt runtimeConfig so production
can flip TURN-only relay via NUXT_PUBLIC_OFFICE_FORCE_RELAY=true
without redeploying. Default false: standard ICE behaviour.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Wire `forceRelay` into `useOfficeRealtime`

**Files:**
- Modify: `app/composables/useOfficeRealtime.ts:143`

- [ ] **Step 1: Read the current SDK.init call site**

```bash
sed -n '140,148p' app/composables/useOfficeRealtime.ts
```

Expected to see:
```
  const client = await SDK.init({ authToken: creds.authToken })
```

- [ ] **Step 2: Verify the SDK accepts `defaults.forceRelay`**

```bash
grep -rn 'forceRelay' node_modules/@cloudflare/realtimekit/types/ 2>/dev/null | head -5
# Or, if the types are under a different path:
find node_modules/@cloudflare/realtimekit -name '*.d.ts' | head -3
grep -l 'forceRelay' $(find node_modules/@cloudflare/realtimekit -name '*.d.ts')
```

Expected: at least one `.d.ts` file contains `forceRelay` (likely on an init options interface). If NOT found, the SDK version may not expose it — STOP and check `package.json` for the realtimekit version vs CF docs. Adjust the option path or upgrade the SDK before proceeding.

- [ ] **Step 3: Modify the call site**

Edit `app/composables/useOfficeRealtime.ts` around line 143:

```ts
// Before
const client = await SDK.init({ authToken: creds.authToken })

// After
const client = await SDK.init({
  authToken: creds.authToken,
  defaults: { forceRelay: resolveForceRelay(useRuntimeConfig()) },
})
```

Add this import at the top of the file (near the other imports around line 23-25):

```ts
import { resolveForceRelay } from '~/composables/officeForceRelay'
```

- [ ] **Step 4: Run the office worker test suite to confirm nothing broke**

```bash
pnpm test:run test/workers/office-room/ test/server/utils/officeRoom/ test/server/utils/officeRealtime.test.ts test/app/composables/officeForceRelay.test.ts
```

Expected: all green. Existing 28 worker/server tests + the 6 new helper tests = 34+ tests pass.

- [ ] **Step 5: Typecheck the modified file**

```bash
NODE_OPTIONS='--max-old-space-size=8192' pnpm exec nuxt typecheck 2>&1 | grep -A1 'useOfficeRealtime' | head -20
```

Expected: no errors mentioning `useOfficeRealtime.ts`. If "Object literal may only specify known properties" or "defaults does not exist" appears, the SDK init options shape is different — check `node_modules/@cloudflare/realtimekit/types/` and adjust the option path (it might be `meeting.forceRelay` or top-level `forceRelay`).

- [ ] **Step 6: Commit**

```bash
git add app/composables/useOfficeRealtime.ts
git commit -m "$(cat <<'EOF'
feat(office): pass forceRelay through SDK.init for hostile-NAT escape hatch

Default-off behavior preserved. To enable TURN-only relay in prod,
set NUXT_PUBLIC_OFFICE_FORCE_RELAY=true on Cloudflare Pages.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: Redeploy `office-room-worker` so it picks up new secrets

**Files:** none — deploy operation.

The Cloudflare Workers Secret API attaches secrets to the worker, but the running DO instance keeps its previous env until the next bundle reload. A `wrangler deploy` forces that reload while preserving DO state.

- [ ] **Step 1: Deploy the worker**

```bash
cd workers/office-room
wrangler deploy
cd ../..
```

Expected output contains "Uploaded office-room-worker" + a worker URL. If errors mention "binding not found" for `OFFICE_ROOMS`, the migration tag in wrangler.toml may need updating — check `tag = "v1"` line.

- [ ] **Step 2: Tail the worker briefly to confirm clean boot**

```bash
( cd workers/office-room && timeout 10s wrangler tail --format pretty 2>&1 || true )
```

Expected: no errors in the 10-second window. Empty output is normal (no traffic yet).

- [ ] **Step 3: Verify the new bundle is live by hitting any worker endpoint**

```bash
# The worker is internal-only (called from Pages); a direct curl will 404,
# but the response headers should include `server: cloudflare` and the
# request should NOT error with a 500.
curl -sI "https://office-room-worker.<your-cf-subdomain>.workers.dev/" 2>&1 | head -5
```

Skip if the worker has no public URL. Step 2's clean tail is sufficient.

No commit — deploy is an artifact, not a file change.

---

## Task 11: Deploy Pages preview

**Files:** none — deploy operation.

- [ ] **Step 1: Confirm git tree is clean and on the right branch**

```bash
git status --short
git rev-parse --abbrev-ref HEAD
```

Expected: clean tree (or only `docs/superpowers/` changes if plan/spec were just committed). Branch: `feat/virtual-office-1b-media`.

- [ ] **Step 2: Deploy preview**

```bash
NODE_OPTIONS='--max-old-space-size=8192' pnpm deploy:preview
```

Expected: build succeeds, `wrangler pages deploy` runs, prints a preview URL. Save the URL.

If OOM occurs: the `NODE_OPTIONS` flag should prevent it per CLAUDE.md. If it still OOMs, bump to `--max-old-space-size=12288` and retry.

- [ ] **Step 3: Smoke-test `/office` on the preview URL**

```bash
PREVIEW_URL=<paste-the-preview-url-from-step-2>
curl -sI "$PREVIEW_URL/office" | head -5
```

Expected: `HTTP/2 200` (or 301/302 to /login if the route is auth-gated — that's also acceptable, just means presence layer is intact).

No commit.

---

## Task 12: Run the existing test suite green

**Files:** none — validation only.

- [ ] **Step 1: Run the four targeted test paths from the UAT acceptance criteria**

```bash
pnpm test:run \
  test/workers/office-room/ \
  test/server/utils/officeRoom/ \
  test/server/utils/officeRealtime.test.ts \
  test/app/composables/officeForceRelay.test.ts
```

Expected: all green. Test count should be 34+ (28 original + 6 from Task 7).

- [ ] **Step 2: If any test fails**

STOP. Read the failure carefully. Common causes:
- Snapshot mismatches from the realtime.ts changes (shouldn't apply — Task 7-9 didn't touch realtime.ts in the worker)
- Pre-existing failures unrelated to this plan (rare — UAT acceptance says 28 tests pass currently)
- Race conditions in async tests (re-run once; if still failing, investigate)

Do NOT mark Task 12 complete until output is green.

- [ ] **Step 3: Print a short hand-off summary**

To the chat:

```
Phase 1b' execution complete. Ready for UAT.

Provisioned:
- RealtimeKit presets: staff_full, viewer_lurking
- Worker secrets on office-room-worker: CF_ACCOUNT_ID, CF_REALTIMEKIT_APP_ID, CF_REALTIMEKIT_API_TOKEN
- forceRelay knob: default off (NUXT_PUBLIC_OFFICE_FORCE_RELAY to flip)

Deploys:
- office-room-worker: deployed at <timestamp>
- Pages preview: <preview-url>

Test suite: 34+ tests green

UAT doc: docs/superpowers/uat/2026-05-22-virtual-office-phase-1b-uat.md
Hand off to Paul to walk it.
```

---

## Paul-driven post-plan (NOT part of the plan, but required for shipping)

- **1b'-12:** Paul walks `docs/superpowers/uat/2026-05-22-virtual-office-phase-1b-uat.md` end-to-end on the preview URL from Task 11. Expected effort: 50-60 minutes. Section 5 (token refresh) is OPTIONAL per the spec — defer to post-merge monitoring if Paul lacks 56 idle minutes.

- **1b'-13:** If UAT passes:
  ```bash
  gh pr ready 11
  gh pr merge 11 --merge
  ```
  Then monitor the first 30 minutes of production traffic (or absence thereof) via `wrangler tail --config workers/office-room/wrangler.toml`.

If UAT fails: see spec §8 rollback paths.

---

## Self-review log

(Filled in after writing — not for the executor's eye.)

- **Spec coverage:** Tasks 1-12 cover spec §6 IDs 1b'-03 through 1b'-11. Spec §6 IDs 1b'-01, 1b'-02, 1b'-12, 1b'-13 are Paul-driven and documented in the Pre-flight + Post-plan sections.
- **Placeholders:** None detected on final pass. Every step has concrete code or commands.
- **Type consistency:** `resolveForceRelay` signature is consistent between Task 7 (definition) and Task 9 (call site). The runtime config key `officeForceRelay` is consistent between Task 8 (config) and Task 7/9 (read).
- **Out-of-scope adherence:** No tasks pull in 1b'' polish items (retry, webhook, iOS pre-check, etc.) — confirmed against spec §3 out-of-scope table.
