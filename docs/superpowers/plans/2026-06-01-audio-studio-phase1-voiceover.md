# Audio Studio — Phase 1 (Voiceover) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Generate owned AI voiceover, persist it to R2 as a tenant-scoped reusable asset, browse it in a new Audio Studio library, and drop it into Banner Studio audio layers — all on the current Cloudflare stack with no new infra.

**Architecture:** A single `audio_assets` table is the durable record; `server/utils/audio/assets.ts` is the *sole gateway* to that table and to R2 keys. `voiceGen.ts` wraps the existing `aiVoice.ts` TTS to persist output. `musicGuard.ts` (ported from the reference pipeline) runs advisory on voiceover and becomes the hard gate for music in Phase 2. The synchronous `voiceover.post.ts` endpoint orchestrates auth → guard → TTS → persist. A new `/agency/audio` page and a Banner Studio picker tab consume the library.

**Tech Stack:** Nuxt 4 / Nitro, Neon Postgres (`server/utils/db.ts`), Cloudflare R2 (`server/utils/storage.ts`), Workers AI via `server/utils/aiVoice.ts`, Nuxt UI v4, Vitest (`test/**`).

**Spec:** `docs/superpowers/specs/2026-06-01-audio-studio-design.md` (Phase 1 only — Phases 2–3 get their own plans).

**Scope notes / deliberate simplifications for v1 (internal, staff-only):**
- **Client access control is a tag, not an ACL.** `client_id` is a nullable label on the asset. Any write-access staff member can generate/list/use assets. Per-client ACL + quotas are gated to the portal phase (per the spec's enterprise-by-surface table). Endpoints still call `requireWriteAccess`.
- **Scoped access via freshly-minted presigned URLs**, not a raw `stream/[...key]` proxy route. The scope check happens in the endpoint (`requireWriteAccess`); the returned URL is a short-lived presigned R2 URL. This reuses `getPresignedDownloadUrl` and matches how the rest of the app serves R2 files. The dedicated stream route from the spec is deferred to the portal phase where true per-client scoping is required.
- **No AI Gateway wiring in this plan.** It's foundational for cost telemetry but is an infra/config task (route `AI.run` through a Gateway binding), tracked separately so it doesn't block the VO vertical slice. `cost_cents` column is added now so the data shape is ready.

---

## File Structure

**Create:**
- `server/database/migrations/147_audio_assets.sql` — the asset table
- `server/utils/audio/musicGuard.ts` — artist-mimicry guard (port)
- `server/utils/audio/assets.ts` — asset spine (DB + R2 gateway)
- `server/utils/audio/voiceGen.ts` — TTS → buffer orchestration
- `server/api/agency/audio/voiceover.post.ts` — sync VO generation
- `server/api/agency/audio/assets/index.get.ts` — list library (scoped)
- `app/composables/useAudioStudio.ts` — client data/composable
- `app/components/audio/VoiceoverForm.vue` — generation form
- `app/components/audio/AssetLibrary.vue` — library grid + audio player
- `app/pages/agency/audio/index.vue` — the Audio Studio page
- `test/audio/musicGuard.test.ts`
- `test/audio/assets.test.ts`
- `test/audio/voiceGen.test.ts`

**Modify:**
- `app/types/index.ts` — add `AudioAsset` interface
- `app/components/banner/AssetsPanel.client.vue` — add "Audio Studio" tab
- `app/pages/features/index.vue` + `app/components/MarketingNav.vue` — front-facing sync

---

## Task 1: Migration — `audio_assets` table

**Files:**
- Create: `server/database/migrations/147_audio_assets.sql`

- [ ] **Step 1: Write the migration**

```sql
-- 147_audio_assets.sql — Audio Studio owned-audio asset spine.
-- One row per generated asset (voiceover now; music in Phase 2).
CREATE TABLE IF NOT EXISTS audio_assets (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id       UUID NULL REFERENCES agency_clients(id) ON DELETE SET NULL,
  created_by      UUID NOT NULL,
  kind            TEXT NOT NULL CHECK (kind IN ('voiceover', 'music')),
  status          TEXT NOT NULL DEFAULT 'ready'
                  CHECK (status IN ('queued','processing','rendering','done','failed','ready')),
  title           TEXT NULL,
  prompt          TEXT NULL,           -- music brief OR voiceover text
  lang            TEXT NULL,
  voice           TEXT NULL,
  channels        TEXT[] NOT NULL DEFAULT '{}',   -- requested target channels
  r2_key_master   TEXT NULL,
  variants        JSONB NOT NULL DEFAULT '{}'::jsonb, -- { radio, tiktok, meta } -> r2 keys
  duration_sec    NUMERIC NULL,
  cost_cents      INTEGER NULL,
  idempotency_key TEXT NULL UNIQUE,
  error           TEXT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_audio_assets_client_kind_status
  ON audio_assets (client_id, kind, status);
CREATE INDEX IF NOT EXISTS idx_audio_assets_created_at
  ON audio_assets (created_at DESC);
```

- [ ] **Step 2: Run the migration against the database**

Run:
```bash
export DATABASE_URL=$(grep DATABASE_URL .env | cut -d= -f2-)
psql "$DATABASE_URL" -f server/database/migrations/147_audio_assets.sql
```
Expected: `CREATE TABLE` + two `CREATE INDEX` (or no error if re-run — guards are idempotent).

- [ ] **Step 3: Verify the table exists**

Run:
```bash
psql "$DATABASE_URL" -c "\d audio_assets"
```
Expected: table description listing all columns above.

- [ ] **Step 4: Commit**

```bash
git add server/database/migrations/147_audio_assets.sql
git commit -m "feat(audio): migration 147 — audio_assets spine table"
```

---

## Task 2: `AudioAsset` type

**Files:**
- Modify: `app/types/index.ts` (append near other asset/entity interfaces)

- [ ] **Step 1: Add the interface**

Add to `app/types/index.ts`:

```ts
export interface AudioAsset {
  id: string
  clientId: string | null
  createdBy: string
  kind: 'voiceover' | 'music'
  status: 'queued' | 'processing' | 'rendering' | 'done' | 'failed' | 'ready'
  title: string | null
  prompt: string | null
  lang: string | null
  voice: string | null
  channels: string[]
  r2KeyMaster: string | null
  variants: Record<string, string>
  durationSec: number | null
  costCents: number | null
  error: string | null
  createdAt: string
  updatedAt: string
  /** Short-lived presigned playback URL, minted by the API on read. */
  streamUrl?: string
}
```

- [ ] **Step 2: Type-check the file compiles (no new errors introduced)**

Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | grep -c "app/types/index.ts" || true`
Expected: `0` (the new interface introduces no errors in that file).

- [ ] **Step 3: Commit**

```bash
git add app/types/index.ts
git commit -m "feat(audio): add AudioAsset type"
```

---

## Task 3: `musicGuard.ts` — artist-mimicry guard (port)

**Files:**
- Create: `server/utils/audio/musicGuard.ts`
- Test: `test/audio/musicGuard.test.ts`

- [ ] **Step 1: Write the failing test**

Create `test/audio/musicGuard.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { guardAudioPrompt } from '~~/server/utils/audio/musicGuard'

describe('guardAudioPrompt', () => {
  it('passes a clean genre/mood brief', () => {
    const r = guardAudioPrompt('upbeat indie pop, 120 bpm, bright and summery')
    expect(r.safe).toBe(true)
    expect(r.violations).toEqual([])
    expect(r.sanitized).toBe('upbeat indie pop, 120 bpm, bright and summery')
  })

  it('strips an "in the style of <artist>" clause and flags it', () => {
    const r = guardAudioPrompt('summery pop in the style of Taylor Swift, 120 bpm')
    expect(r.safe).toBe(false)
    expect(r.violations.some(v => /taylor swift/i.test(v))).toBe(true)
    expect(r.sanitized.toLowerCase()).not.toContain('taylor swift')
    expect(r.sanitized.toLowerCase()).not.toContain('in the style of')
  })

  it('catches a bare blocklisted artist name anywhere in the brief', () => {
    const r = guardAudioPrompt('a Drake type beat with heavy 808s')
    expect(r.safe).toBe(false)
    expect(r.violations).toContain('drake')
    expect(r.sanitized.toLowerCase()).not.toContain('drake')
  })

  it('collapses whitespace left by removals', () => {
    const r = guardAudioPrompt('chill   sounds like   Adele   vibe')
    expect(r.sanitized).not.toMatch(/\s{2,}/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run test/audio/musicGuard.test.ts`
Expected: FAIL — cannot find module `musicGuard`.

- [ ] **Step 3: Write the implementation**

Create `server/utils/audio/musicGuard.ts`:

```ts
// server/utils/audio/musicGuard.ts
// Meta bans AI-generated audio that mimics a specific copyrighted artist's
// voice/style. A brief that says "in the style of <artist>" is a takedown +
// account-flag risk. Two passes: cheap pattern/blocklist first, optional AI
// backstop second. The AI pass can only ADD violations, never clear a clean
// pattern result. Used advisory for voiceover; a hard gate for music (Phase 2).

export interface GuardResult {
  safe: boolean
  violations: string[]
  sanitized: string
}

// Starter blocklist — back this with a KV-stored set in production (see
// loadBlocklist). Illustrative only.
const ARTIST_BLOCKLIST = [
  'taylor swift', 'beyonce', 'beyoncé', 'drake', 'the weeknd', 'ed sheeran',
  'billie eilish', 'sabrina carpenter', 'kendrick lamar', 'sia', 'adele',
]

const STYLE_CLAUSE =
  /\b(?:in the style of|sounds? like|similar to|inspired by|reminiscent of|a la|à la|mimic(?:king)?|imitat\w+|cover of|rip[- ]?off of)\b\s+([^.,;]+)/gi

export function guardAudioPrompt(prompt: string, blocklist: string[] = ARTIST_BLOCKLIST): GuardResult {
  const violations: string[] = []
  let sanitized = prompt

  // 1. Strip "<clause> <reference>" constructions.
  sanitized = sanitized.replace(STYLE_CLAUSE, (_m, ref: string) => {
    violations.push(ref.trim())
    return ''
  })

  // 2. Bare artist-name mentions anywhere.
  const lower = sanitized.toLowerCase()
  for (const name of blocklist) {
    if (lower.includes(name)) {
      violations.push(name)
      sanitized = sanitized.replace(new RegExp(name, 'gi'), '')
    }
  }

  sanitized = sanitized.replace(/\s{2,}/g, ' ').trim()
  return { safe: violations.length === 0, violations, sanitized }
}

/**
 * Load the blocklist from KV (`CACHE` binding, key `audio:artist-blocklist`),
 * falling back to the inline starter list. Returns the inline list when KV is
 * unavailable (local dev). Never throws.
 */
export async function loadBlocklist(kv: { get(key: string, type: 'json'): Promise<unknown> } | null): Promise<string[]> {
  if (!kv) return ARTIST_BLOCKLIST
  try {
    const stored = await kv.get('audio:artist-blocklist', 'json')
    if (Array.isArray(stored) && stored.every(s => typeof s === 'string') && stored.length > 0) {
      return stored as string[]
    }
  } catch {
    // KV hiccup must not block generation — fall back to the inline list.
  }
  return ARTIST_BLOCKLIST
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/audio/musicGuard.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/audio/musicGuard.ts test/audio/musicGuard.test.ts
git commit -m "feat(audio): artist-mimicry guard (musicGuard)"
```

---

## Task 4: `assets.ts` — the asset spine (DB + R2 gateway)

**Files:**
- Create: `server/utils/audio/assets.ts`
- Test: `test/audio/assets.test.ts`

This is the only module that touches the `audio_assets` table or R2 keys. It exposes:
- `buildMasterKey(clientId, assetId, ext)` — pure key construction (testable without DB/R2)
- `createVoiceAsset(...)` — insert row + upload buffer + return asset with `streamUrl`
- `listAssets(filter)` — scoped library read with minted `streamUrl`s
- `mapRow(row)` — DB snake_case → `AudioAsset` camelCase (pure)

We unit-test the pure functions (`buildMasterKey`, `mapRow`) directly; DB/R2-bound functions are exercised in the endpoint integration test (Task 6) with mocks.

- [ ] **Step 1: Write the failing test**

Create `test/audio/assets.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildMasterKey, mapRow } from '~~/server/utils/audio/assets'

describe('buildMasterKey', () => {
  it('namespaces by client when present', () => {
    expect(buildMasterKey('client-123', 'asset-abc', 'mp3'))
      .toBe('audio/client-123/asset-abc/master.mp3')
  })

  it('falls back to org namespace when client is null', () => {
    expect(buildMasterKey(null, 'asset-abc', 'mp3'))
      .toBe('audio/org/asset-abc/master.mp3')
  })
})

describe('mapRow', () => {
  it('maps snake_case DB row to camelCase AudioAsset', () => {
    const row = {
      id: 'a1', client_id: null, created_by: 'u1', kind: 'voiceover',
      status: 'ready', title: 'Promo VO', prompt: 'Hello world', lang: 'en',
      voice: null, channels: ['tiktok'], r2_key_master: 'audio/org/a1/master.mp3',
      variants: {}, duration_sec: '3.2', cost_cents: null, error: null,
      created_at: '2026-06-01T00:00:00Z', updated_at: '2026-06-01T00:00:00Z',
    }
    const asset = mapRow(row)
    expect(asset.id).toBe('a1')
    expect(asset.clientId).toBeNull()
    expect(asset.r2KeyMaster).toBe('audio/org/a1/master.mp3')
    expect(asset.channels).toEqual(['tiktok'])
    expect(asset.durationSec).toBe(3.2)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run test/audio/assets.test.ts`
Expected: FAIL — cannot find module `assets`.

- [ ] **Step 3: Write the implementation**

Create `server/utils/audio/assets.ts`:

```ts
// server/utils/audio/assets.ts — SOLE gateway to the audio_assets table and R2
// keys. Voice (Phase 1), music (Phase 2), and render (Phase 3) all route through
// here so the future client-portal surface reuses it untouched.
import { randomUUID } from 'crypto'
import type { AudioAsset } from '~~/app/types'
import { queryRows, queryOne } from '~~/server/utils/db'
import { uploadFile, getPresignedDownloadUrl, isStorageConfigured } from '~~/server/utils/storage'

const PRESIGN_TTL = 60 * 60 // 1 hour playback URLs

/** Pure: construct the R2 key for an asset's master file. */
export function buildMasterKey(clientId: string | null, assetId: string, ext: string): string {
  return `audio/${clientId ?? 'org'}/${assetId}/master.${ext}`
}

/** Pure: DB row (snake_case) → AudioAsset (camelCase). */
export function mapRow(row: any): AudioAsset {
  return {
    id: row.id,
    clientId: row.client_id ?? null,
    createdBy: row.created_by,
    kind: row.kind,
    status: row.status,
    title: row.title ?? null,
    prompt: row.prompt ?? null,
    lang: row.lang ?? null,
    voice: row.voice ?? null,
    channels: row.channels ?? [],
    r2KeyMaster: row.r2_key_master ?? null,
    variants: row.variants ?? {},
    durationSec: row.duration_sec != null ? Number(row.duration_sec) : null,
    costCents: row.cost_cents != null ? Number(row.cost_cents) : null,
    error: row.error ?? null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

/** Mint a short-lived playback URL for an asset's master (null if no master/key). */
export async function streamUrlFor(asset: AudioAsset): Promise<string | undefined> {
  if (!asset.r2KeyMaster) return undefined
  if (!isStorageConfigured()) return `/api/_uploads/${asset.r2KeyMaster}`
  return getPresignedDownloadUrl(asset.r2KeyMaster, PRESIGN_TTL)
}

export interface CreateVoiceAssetInput {
  createdBy: string
  clientId: string | null
  title: string | null
  text: string
  lang: string | null
  voice: string | null
  channels: string[]
  audio: ArrayBuffer | Uint8Array
  format: string            // e.g. 'mp3'
  durationSec?: number | null
}

/** Insert a ready voiceover asset and upload its master to R2. */
export async function createVoiceAsset(input: CreateVoiceAssetInput): Promise<AudioAsset> {
  const id = randomUUID()
  const key = buildMasterKey(input.clientId, id, input.format)
  const buffer = Buffer.from(input.audio instanceof ArrayBuffer ? new Uint8Array(input.audio) : input.audio)

  await uploadFile(buffer, key, input.format === 'mp3' ? 'audio/mpeg' : `audio/${input.format}`)

  const row = await queryOne(
    `INSERT INTO audio_assets
       (id, client_id, created_by, kind, status, title, prompt, lang, voice, channels, r2_key_master, duration_sec)
     VALUES ($1, $2, $3, 'voiceover', 'ready', $4, $5, $6, $7, $8, $9, $10)
     RETURNING *`,
    [id, input.clientId, input.createdBy, input.title, input.text, input.lang,
     input.voice, input.channels, key, input.durationSec ?? null],
  )
  const asset = mapRow(row)
  asset.streamUrl = await streamUrlFor(asset)
  return asset
}

export interface ListAssetsFilter {
  kind?: 'voiceover' | 'music'
  clientId?: string | null
  limit?: number
}

/** Scoped library read. Mints a streamUrl per asset. */
export async function listAssets(filter: ListAssetsFilter = {}): Promise<AudioAsset[]> {
  const where: string[] = []
  const params: any[] = []
  if (filter.kind) { params.push(filter.kind); where.push(`kind = $${params.length}`) }
  if (filter.clientId !== undefined) {
    if (filter.clientId === null) where.push('client_id IS NULL')
    else { params.push(filter.clientId); where.push(`client_id = $${params.length}`) }
  }
  params.push(Math.min(filter.limit ?? 100, 200))
  const sql = `SELECT * FROM audio_assets
    ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
    ORDER BY created_at DESC LIMIT $${params.length}`
  const rows = await queryRows(sql, params)
  const assets = rows.map(mapRow)
  await Promise.all(assets.map(async a => { a.streamUrl = await streamUrlFor(a) }))
  return assets
}
```

> Note: import path `~~/app/types` for the shared `AudioAsset` type — server code uses the `~~/` (double-tilde) alias. If the worker reports the type doesn't resolve from server context, inline a local copy of the `AudioAsset` shape in `assets.ts` rather than importing across the app/server boundary, and reconcile in Task 2's type. Verify with the typecheck in Task 6.

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/audio/assets.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/audio/assets.ts test/audio/assets.test.ts
git commit -m "feat(audio): asset spine — assets.ts (DB + R2 gateway)"
```

---

## Task 5: `voiceGen.ts` — TTS → buffer orchestration

**Files:**
- Create: `server/utils/audio/voiceGen.ts`
- Test: `test/audio/voiceGen.test.ts`

`voiceGen` runs the guard advisory (sanitizing the text), then calls the existing `aiVoice.textToSpeech`, returning the audio buffer + format + the sanitized text + any guard violations. It does NOT touch the DB or R2 (that's `assets.ts`).

- [ ] **Step 1: Write the failing test**

Create `test/audio/voiceGen.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'

// Mock the TTS util so the test never calls Workers AI.
// Mock path must match the alias specifier the implementation imports.
vi.mock('~~/server/utils/aiVoice', () => ({
  textToSpeech: vi.fn(async (_event: any, text: string) => ({
    audioBuffer: new TextEncoder().encode(`audio:${text}`).buffer,
    format: 'mp3',
  })),
}))

import { generateVoiceover } from '~~/server/utils/audio/voiceGen'
import { textToSpeech } from '~~/server/utils/aiVoice'

describe('generateVoiceover', () => {
  it('sanitizes the text via the guard before synthesis and reports violations', async () => {
    const result = await generateVoiceover({} as any, {
      text: 'Read this in the style of Adele please',
      lang: 'en',
    })
    expect(result).not.toBeNull()
    // guard removed the mimicry clause before TTS
    const passedText = (textToSpeech as any).mock.calls[0][1] as string
    expect(passedText.toLowerCase()).not.toContain('adele')
    expect(result!.violations.length).toBeGreaterThan(0)
    expect(result!.format).toBe('mp3')
  })

  it('returns null when TTS is unavailable', async () => {
    ;(textToSpeech as any).mockResolvedValueOnce(null)
    const result = await generateVoiceover({} as any, { text: 'hello', lang: 'en' })
    expect(result).toBeNull()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm exec vitest run test/audio/voiceGen.test.ts`
Expected: FAIL — cannot find module `voiceGen`.

- [ ] **Step 3: Write the implementation**

Create `server/utils/audio/voiceGen.ts`:

```ts
// server/utils/audio/voiceGen.ts — orchestrates voiceover generation:
// guard (advisory) → TTS via the existing aiVoice util → return the buffer.
// Persistence is the caller's job (assets.createVoiceAsset).
import type { H3Event } from 'h3'
import { textToSpeech } from '~~/server/utils/aiVoice'
import { guardAudioPrompt } from '~~/server/utils/audio/musicGuard'

export interface GenerateVoiceoverInput {
  text: string
  lang?: string
}

export interface VoiceoverResult {
  audioBuffer: ArrayBuffer
  format: string
  sanitizedText: string
  violations: string[]
}

export async function generateVoiceover(
  event: H3Event,
  input: GenerateVoiceoverInput,
): Promise<VoiceoverResult | null> {
  // Advisory guard: strip artist-mimicry phrasing from VO scripts. We do NOT
  // hard-block voiceover (it's spoken words, not a sound-alike track), but we
  // sanitize so a script can't smuggle "say this like <artist>".
  const guard = guardAudioPrompt(input.text)

  const tts = await textToSpeech(event, guard.sanitized, { lang: input.lang })
  if (!tts) return null

  return {
    audioBuffer: tts.audioBuffer,
    format: tts.format,
    sanitizedText: guard.sanitized,
    violations: guard.violations,
  }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `pnpm exec vitest run test/audio/voiceGen.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add server/utils/audio/voiceGen.ts test/audio/voiceGen.test.ts
git commit -m "feat(audio): voiceGen — guard + TTS orchestration"
```

---

## Task 6: `voiceover.post.ts` — synchronous generation endpoint

**Files:**
- Create: `server/api/agency/audio/voiceover.post.ts`

Orchestrates: `requireWriteAccess` → validate body (Zod) → `generateVoiceover` → `createVoiceAsset` → return `{ asset }`. Synchronous because TTS is fast.

- [ ] **Step 1: Write the implementation**

Create `server/api/agency/audio/voiceover.post.ts`:

```ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { generateVoiceover } from '~~/server/utils/audio/voiceGen'
import { createVoiceAsset } from '~~/server/utils/audio/assets'

const BodySchema = z.object({
  text: z.string().min(2).max(2000),
  title: z.string().max(120).nullish(),
  clientId: z.string().uuid().nullish(),
  lang: z.string().max(8).default('en'),
  voice: z.string().max(40).nullish(),
  channels: z.array(z.enum(['radio', 'tiktok', 'meta'])).default([]),
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const body = BodySchema.parse(await readBody(event))

  const generated = await generateVoiceover(event, { text: body.text, lang: body.lang })
  if (!generated) {
    throw createError({ statusCode: 503, statusMessage: 'Voice generation unavailable' })
  }

  const asset = await createVoiceAsset({
    createdBy: user.id,
    clientId: body.clientId ?? null,
    title: body.title ?? null,
    text: generated.sanitizedText,
    lang: body.lang,
    voice: body.voice ?? null,
    channels: body.channels,
    audio: generated.audioBuffer,
    format: generated.format,
  })

  return { asset, violations: generated.violations }
})
```

- [ ] **Step 2: Manually verify the endpoint against a running dev server**

Run (in one terminal): `pnpm dev`
Then (in another), with a valid session cookie in `$COOKIE`:
```bash
curl -s -X POST http://localhost:3000/api/agency/audio/voiceover \
  -H 'content-type: application/json' -H "cookie: $COOKIE" \
  -d '{"text":"Welcome to our summer sale, now on.","title":"Summer VO","channels":["tiktok"]}' | head -c 400
```
Expected: JSON `{ "asset": { "id": "...", "kind": "voiceover", "status": "ready", "streamUrl": "..." }, "violations": [] }`.
(If the AI binding is absent locally, expect `503` — that is correct graceful degradation; verify the same call returns an asset on a preview deploy where the `AI` binding exists.)

- [ ] **Step 3: Typecheck the new server modules introduce no errors**

Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | grep -E "server/(utils|api)/.*audio" || echo "NO AUDIO TYPE ERRORS"`
Expected: `NO AUDIO TYPE ERRORS`. (If `assets.ts`'s `~~/app/types` import errors, apply the inline-type fallback noted in Task 4, then re-run.)

- [ ] **Step 4: Commit**

```bash
git add server/api/agency/audio/voiceover.post.ts
git commit -m "feat(audio): synchronous voiceover generation endpoint"
```

---

## Task 7: `assets/index.get.ts` — list library endpoint

**Files:**
- Create: `server/api/agency/audio/assets/index.get.ts`

- [ ] **Step 1: Write the implementation**

Create `server/api/agency/audio/assets/index.get.ts`:

```ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { listAssets } from '~~/server/utils/audio/assets'

const QuerySchema = z.object({
  kind: z.enum(['voiceover', 'music']).optional(),
  clientId: z.string().uuid().optional(),
  limit: z.coerce.number().int().positive().max(200).optional(),
})

export default defineEventHandler(async (event) => {
  await requireWriteAccess(event)
  const q = QuerySchema.parse(getQuery(event))
  const assets = await listAssets({ kind: q.kind, clientId: q.clientId, limit: q.limit })
  return { assets }
})
```

- [ ] **Step 2: Manually verify against the running dev server**

Run:
```bash
curl -s "http://localhost:3000/api/agency/audio/assets?kind=voiceover" -H "cookie: $COOKIE" | head -c 300
```
Expected: `{ "assets": [ { "id": "...", "kind": "voiceover", "streamUrl": "..." } ] }` (the asset created in Task 6).

- [ ] **Step 3: Commit**

```bash
git add server/api/agency/audio/assets/index.get.ts
git commit -m "feat(audio): list audio assets endpoint"
```

---

## Task 8: Audio Studio UI — composable, components, page

**Files:**
- Create: `app/composables/useAudioStudio.ts`
- Create: `app/components/audio/VoiceoverForm.vue`
- Create: `app/components/audio/AssetLibrary.vue`
- Create: `app/pages/agency/audio/index.vue`

> **MANDATORY before editing the form:** invoke the `frontend-design` skill (per project CLAUDE.md) and apply its typography/hierarchy/spacing principles. Wrap every field in `UFormField`; use Nuxt UI v4 components only.

- [ ] **Step 1: Create the composable**

Create `app/composables/useAudioStudio.ts`:

```ts
import type { AudioAsset } from '~/types'

export function useAudioStudio() {
  const generating = ref(false)
  const toast = useToast()

  async function generateVoiceover(payload: {
    text: string; title?: string; clientId?: string | null; lang?: string; channels?: string[]
  }): Promise<AudioAsset | null> {
    generating.value = true
    try {
      const res = await $fetch<{ asset: AudioAsset; violations: string[] }>(
        '/api/agency/audio/voiceover', { method: 'POST', body: payload },
      )
      if (res.violations?.length) {
        toast.add({ title: 'Mimicry phrasing removed', description: res.violations.join(', '), color: 'warning' })
      }
      toast.add({ title: 'Voiceover ready', color: 'success' })
      return res.asset
    } catch (e: any) {
      toast.add({ title: 'Generation failed', description: e?.data?.statusMessage ?? 'Try again', color: 'error' })
      return null
    } finally {
      generating.value = false
    }
  }

  function listVoiceovers() {
    return useFetch<{ assets: AudioAsset[] }>('/api/agency/audio/assets', {
      query: { kind: 'voiceover' },
      default: () => ({ assets: [] }),
    })
  }

  return { generating, generateVoiceover, listVoiceovers }
}
```

- [ ] **Step 2: Create the VoiceoverForm component**

Create `app/components/audio/VoiceoverForm.vue`:

```vue
<script setup lang="ts">
import type { AudioAsset } from '~/types'
const emit = defineEmits<{ generated: [asset: AudioAsset] }>()
const { generating, generateVoiceover } = useAudioStudio()

const text = ref('')
const title = ref('')
const channels = ref<string[]>([])
const channelOptions = [
  { label: 'TikTok', value: 'tiktok' },
  { label: 'Meta', value: 'meta' },
  { label: 'Radio', value: 'radio' },
]

async function submit() {
  if (text.value.trim().length < 2) return
  const asset = await generateVoiceover({
    text: text.value.trim(),
    title: title.value.trim() || undefined,
    channels: channels.value,
  })
  if (asset) {
    emit('generated', asset)
    text.value = ''
    title.value = ''
  }
}
</script>

<template>
  <UCard>
    <div class="space-y-4">
      <UFormField label="Title" help="Optional — for finding it later in the library">
        <UInput v-model="title" placeholder="Summer sale promo" />
      </UFormField>
      <UFormField label="Script" required help="What the voice should say (max 2000 chars)">
        <UTextarea v-model="text" :rows="5" autoresize placeholder="Welcome to our summer sale…" />
      </UFormField>
      <UFormField label="Target channels" help="Where this voiceover will be used">
        <USelectMenu v-model="channels" multiple :items="channelOptions" value-key="value" placeholder="Select channels" />
      </UFormField>
      <div class="flex justify-end">
        <UButton :loading="generating" :disabled="text.trim().length < 2" icon="i-lucide-mic" @click="submit">
          Generate voiceover
        </UButton>
      </div>
    </div>
  </UCard>
</template>
```

- [ ] **Step 3: Create the AssetLibrary component**

Create `app/components/audio/AssetLibrary.vue`:

```vue
<script setup lang="ts">
import type { AudioAsset } from '~/types'
defineProps<{ assets: AudioAsset[]; loading?: boolean }>()
</script>

<template>
  <div class="space-y-3">
    <div v-if="loading" class="text-sm text-muted">Loading…</div>
    <div v-else-if="!assets.length" class="text-sm text-muted py-8 text-center">
      No voiceovers yet — generate one above.
    </div>
    <UCard v-for="a in assets" :key="a.id">
      <div class="flex items-center gap-4">
        <div class="min-w-0 flex-1">
          <p class="font-medium truncate">{{ a.title || 'Untitled voiceover' }}</p>
          <p class="text-xs text-muted truncate">{{ a.prompt }}</p>
          <div class="flex gap-1 mt-1">
            <UBadge v-for="c in a.channels" :key="c" size="xs" variant="subtle">{{ c }}</UBadge>
          </div>
        </div>
        <audio v-if="a.streamUrl" :src="a.streamUrl" controls class="h-9" />
      </div>
    </UCard>
  </div>
</template>
```

- [ ] **Step 4: Create the page**

Create `app/pages/agency/audio/index.vue`:

```vue
<script setup lang="ts">
import type { AudioAsset } from '~/types'
const { listVoiceovers } = useAudioStudio()
const { data, refresh } = listVoiceovers()

function onGenerated(_asset: AudioAsset) { refresh() }
</script>

<template>
  <div class="max-w-3xl mx-auto p-6 space-y-6">
    <div>
      <h1 class="text-2xl font-semibold">Audio Studio</h1>
      <p class="text-sm text-muted">Generate owned voiceover you can use across radio, TikTok and Meta — no clearance, no takedown risk.</p>
    </div>
    <AudioVoiceoverForm @generated="onGenerated" />
    <div>
      <h2 class="text-sm font-semibold uppercase tracking-wider text-muted mb-3">Library</h2>
      <AudioAssetLibrary :assets="data?.assets ?? []" />
    </div>
  </div>
</template>
```

- [ ] **Step 5: Verify the page renders and a round-trip works**

Run `pnpm dev`, open `http://localhost:3000/agency/audio`, type a script, click **Generate voiceover**.
Expected: a success toast, the new item appears in **Library** with a working `<audio>` player. (Requires the `AI` binding — use a preview deploy if local has no binding.)

- [ ] **Step 6: Commit**

```bash
git add app/composables/useAudioStudio.ts app/components/audio app/pages/agency/audio
git commit -m "feat(audio): Audio Studio page — voiceover form + library"
```

---

## Task 9: Banner Studio picker integration

**Files:**
- Modify: `app/components/banner/AssetsPanel.client.vue`

Add an "Audio Studio" section to the banner assets panel that lists `ready` voiceovers and, on click, adds an audio layer using the asset's `streamUrl` as `src`. Banner engine is otherwise untouched.

- [ ] **Step 1: Read the current AssetsPanel to find the existing tab/section structure and the `addLayer` access pattern**

Run: `sed -n '1,80p' app/components/banner/AssetsPanel.client.vue`
Expected: see how existing asset sections are rendered and how `useBannerStudio()` (specifically `addLayer`) is used. Match that structure for the new section.

- [ ] **Step 2: Add the Audio Studio section**

In `app/components/banner/AssetsPanel.client.vue`, within `<script setup>` add:

```ts
import type { AudioAsset } from '~/types'
const { addLayer } = useBannerStudio()
const { data: audioData } = useFetch<{ assets: AudioAsset[] }>('/api/agency/audio/assets', {
  query: { kind: 'voiceover' },
  default: () => ({ assets: [] }),
})

function addAudioLayer(a: AudioAsset) {
  if (!a.streamUrl) return
  addLayer({ type: 'audio', src: a.streamUrl, volume: 1, muted: false, loopAudio: false })
}
```

And in the template, add a section consistent with the existing panel sections:

```vue
<div class="space-y-2">
  <p class="text-[10px] font-semibold uppercase tracking-wider text-(--ui-text-muted)">Audio Studio</p>
  <p v-if="!audioData?.assets?.length" class="text-[11px] text-(--ui-text-dimmed)">No voiceovers yet.</p>
  <button
    v-for="a in audioData?.assets ?? []" :key="a.id" type="button"
    class="w-full text-left text-[11px] px-2 py-1.5 rounded bg-(--ui-bg) border border-(--ui-border) hover:bg-(--ui-bg-elevated) truncate"
    @click="addAudioLayer(a)"
  >
    🎙 {{ a.title || 'Untitled voiceover' }}
  </button>
</div>
```

> Match the exact prop shape `addLayer` expects from Step 1 — `type: 'audio'` is confirmed (`useBannerStudio.ts` filters on `l.type === 'audio'`). If `addLayer` requires additional required fields (e.g. `x`, `y`, `zIndex`), supply the same defaults the existing image/asset add path uses.

- [ ] **Step 3: Verify in the browser**

Open Banner Studio, open the assets panel, confirm the "Audio Studio" section lists the voiceover from Task 8, click it, and confirm an audio layer is added (visible in the timeline/layers and the inspector Audio panel shows the source).

- [ ] **Step 4: Commit**

```bash
git add app/components/banner/AssetsPanel.client.vue
git commit -m "feat(audio): add Audio Studio voiceovers to Banner Studio asset picker"
```

---

## Task 10: Front-facing sync + final verification

**Files:**
- Modify: `app/pages/features/index.vue`
- Modify: `app/components/MarketingNav.vue`

Per project CLAUDE.md, new platform features must be reflected on the public/marketing pages.

- [ ] **Step 1: Add the feature to the features index**

Read the existing structure first: `sed -n '1,60p' app/pages/features/index.vue` to find the category array shape. Add an entry under the most fitting category (Creative / Content), e.g.:

```
{ title: 'Audio Studio', description: 'Generate owned voiceover and music that runs legally across radio, TikTok and Meta — no clearance, no takedowns.', icon: 'i-lucide-mic' }
```

Match the exact object shape the file already uses (field names/icon convention) rather than the illustrative shape above.

- [ ] **Step 2: Add to MarketingNav mega menu if a Creative/Content category exists**

Read `app/components/MarketingNav.vue`, find the relevant category group, and add an "Audio Studio" link pointing at the feature entry, matching the existing link object shape. If there is no fitting category, skip this step (do not invent a new top-level nav category for one feature).

- [ ] **Step 3: Run the full audio test suite**

Run: `pnpm exec vitest run test/audio`
Expected: PASS — all tests from Tasks 3, 4, 5 (10 tests total).

- [ ] **Step 4: Run lint on the new/changed files**

Run: `pnpm exec eslint server/utils/audio server/api/agency/audio app/components/audio app/composables/useAudioStudio.ts`
Expected: no errors. (Per memory: eslint wants comma type-member delimiters — fix any such complaints inline.)

- [ ] **Step 5: Typecheck introduces no NEW errors**

Run: `NODE_OPTIONS='--max-old-space-size=16384' pnpm exec nuxt typecheck 2>&1 | grep -E "audio" || echo "NO AUDIO TYPE ERRORS"`
Expected: `NO AUDIO TYPE ERRORS`.

- [ ] **Step 6: Commit**

```bash
git add app/pages/features/index.vue app/components/MarketingNav.vue
git commit -m "docs(audio): surface Audio Studio on marketing features pages"
```

---

## Done criteria (Phase 1)

- [ ] Migration 147 applied; `audio_assets` exists.
- [ ] `pnpm exec vitest run test/audio` passes (guard, assets, voiceGen).
- [ ] A staff user can generate a voiceover at `/agency/audio`, hear it, and see it in the library.
- [ ] The voiceover is selectable in the Banner Studio asset picker and adds an audio layer.
- [ ] Artist-mimicry phrasing in a script is stripped and surfaced as a toast.
- [ ] No new TypeScript errors attributable to audio files; lint clean.
- [ ] Audio Studio appears on the marketing features page.

## Deferred to later phases (not in this plan)
- Music generation (Queue + `MusicJob` DO + `audio-jobs` Worker) — Phase 2, own spec/plan.
- FFmpeg per-channel mastering (render service) — Phase 3, own spec/plan, host chosen via spike.
- AI Gateway wiring, per-client budget caps/quotas, per-tenant rate limiting, retention/right-to-deletion, dedicated scoped stream route — portal phase (enterprise-by-surface).
