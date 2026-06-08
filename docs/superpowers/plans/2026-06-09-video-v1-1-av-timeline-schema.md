# Video V1.1 — AV Timeline Schema Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend the Media Studio timeline contract + gateway + create-endpoint so an AV timeline (video + overlay + audio tracks) validates, persists, and round-trips — with zero regression to shipped audio projects and no SQL migration.

**Architecture:** Flat multitrack extension. The timeline shape lives in `media_timelines.state` (JSONB), so this is a pure-contract change (`server/utils/audio/timelineSchema.ts`) + a surgical gateway delta (`projects.ts`) + create-endpoint delta. Audio stays `schema_version 1 / media_type 'audio'`; AV is the new `schema_version 2 / media_type 'av'` superset. `migrateTimeline` dispatches both.

**Tech Stack:** TypeScript, Zod, Vitest. Tests live under `test/audio/` and are collected by the repo's default `vitest.config.ts` (`include: ['test/**']`).

**Spec:** `docs/superpowers/specs/2026-06-09-video-v1-1-av-timeline-schema-design.md`

**Worktree:** branch `worktree-video-studio-v1` (off `main`), worktree `.claude/worktrees/video-studio-v1`. Run all commands from the worktree root.

**Run a test file:** `pnpm exec vitest run test/audio/<file>.test.ts`

---

## Task 1: AV clip union + track kinds + TimelineState v2 (contract shapes)

**Files:**
- Modify: `server/utils/audio/timelineSchema.ts`
- Test: `test/audio/timelineSchema.test.ts` (extend)

- [ ] **Step 1: Write failing tests (append to the existing describe blocks)**

Append to `test/audio/timelineSchema.test.ts`:
```ts
describe('AV timeline (schema_version 2) parse', () => {
  function rawAv(overrides: Record<string, any> = {}) {
    return {
      schema_version: 2,
      media_type: 'av',
      tracks: [
        { id: 'vid', name: 'Video', kind: 'video', clips: [
          { type: 'video', id: 'v1', r2_key: 'media/org/f1.mp4', timeline_start_sec: 0, duration_sec: 8, base_source: 'uploaded_footage' },
          { type: 'video', id: 'v2', r2_key: 'media/org/s1.jpg', timeline_start_sec: 8, duration_sec: 5, base_source: 'still_kenburns', kenburns: { zoom_from: 1, zoom_to: 1.2 } }
        ] },
        { id: 'ovl', name: 'Overlay', kind: 'overlay', clips: [
          { type: 'overlay', id: 'o1', timeline_start_sec: 0, duration_sec: 13, gsap_project_id: 'banner-123' }
        ] },
        { id: 'vo', name: 'VO', kind: 'voiceover', clips: [
          { id: 'c1', r2_key: 'audio/org/a1.mp3', timeline_start_sec: 0, source_out_sec: 13 }
        ] }
      ],
      ...overrides
    }
  }

  it('parses an AV document and applies defaults', () => {
    const s = TimelineStateSchema.parse(rawAv())
    expect(s.schema_version).toBe(2)
    expect(s.media_type).toBe('av')
    expect(s.fps).toBe(30)
    expect(s.width).toBe(1080)
    expect(s.height).toBe(1920)
    const vid = s.tracks[0]
    expect(vid.kind).toBe('video')
    expect((vid.clips[0] as any).type).toBe('video')
    expect((vid.clips[0] as any).audio_mode).toBe('mute')   // default
    expect((vid.clips[1] as any).base_source).toBe('still_kenburns')
    expect((s.tracks[1].clips[0] as any).opacity).toBe(1)   // overlay default
  })

  it('treats an audio clip with no explicit type as type "audio"', () => {
    const s = TimelineStateSchema.parse(rawAv())
    const voClip = s.tracks[2].clips[0] as any
    expect(voClip.type).toBe('audio')
    expect(voClip.gain_db).toBe(0)
  })
})

describe('Backward compatibility (schema_version 1 audio unchanged)', () => {
  it('parses a v1 audio document exactly as before', () => {
    const s = TimelineStateSchema.parse(rawTimeline())   // existing helper at top of file
    expect(s.schema_version).toBe(1)
    expect(s.media_type).toBe('audio')
    expect(s.fps).toBe(30)            // new defaulted field, harmless for audio
    const clip = s.tracks[0].clips[0] as any
    expect(clip.type).toBe('audio')   // injected default, no behavior change
    expect(clip.fade_curve).toBe('linear')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run test/audio/timelineSchema.test.ts`
Expected: the new `AV timeline` tests FAIL (e.g. `kind`/`type` enum rejects `'video'`, missing `fps`).

- [ ] **Step 3: Implement the contract shapes**

In `server/utils/audio/timelineSchema.ts`:

(a) Replace the existing `ClipSchema` (lines 11–22) with the discriminated union + a backward-compat preprocess:
```ts
const FadeCurve = z.enum(['linear', 'exp', 'log'])

export const AudioClipSchema = z.object({
  type: z.literal('audio'),
  id: z.string().min(1),
  asset_id: z.string().nullable().default(null),
  r2_key: z.string().min(1),
  timeline_start_sec: z.number(),
  source_in_sec: z.number().default(0),
  source_out_sec: z.number().nullable().default(null),
  gain_db: z.number().default(0),
  fade_in_sec: z.number().default(0),
  fade_out_sec: z.number().default(0),
  fade_curve: FadeCurve.default('linear')
})

export const KenBurnsSchema = z.object({
  zoom_from: z.number().default(1),
  zoom_to: z.number().default(1.1),
  pan_from: z.tuple([z.number(), z.number()]).default([0, 0]),
  pan_to: z.tuple([z.number(), z.number()]).default([0, 0])
})

export const VideoClipSchema = z.object({
  type: z.literal('video'),
  id: z.string().min(1),
  asset_id: z.string().nullable().default(null),
  r2_key: z.string().min(1),
  timeline_start_sec: z.number(),
  source_in_sec: z.number().default(0),
  source_out_sec: z.number().nullable().default(null),
  duration_sec: z.number(),
  base_source: z.enum(['uploaded_footage', 'still_kenburns']),
  kenburns: KenBurnsSchema.nullable().default(null),
  audio_mode: z.enum(['mute', 'source', 'duck_under_vo']).default('mute')
})

export const OverlayClipSchema = z.object({
  type: z.literal('overlay'),
  id: z.string().min(1),
  timeline_start_sec: z.number(),
  duration_sec: z.number(),
  gsap_project_id: z.string().min(1),
  opacity: z.number().default(1)
})

// Legacy audio clips have no `type`; inject 'audio' before discriminating so
// shipped v1 documents parse unchanged.
export const ClipSchema = z.preprocess(
  (v) => (v && typeof v === 'object' && !Array.isArray(v) && !('type' in (v as any)))
    ? { ...(v as any), type: 'audio' }
    : v,
  z.discriminatedUnion('type', [AudioClipSchema, VideoClipSchema, OverlayClipSchema])
)
```

(b) Extend `TrackSchema.kind` (line 27):
```ts
  kind: z.enum(['voiceover', 'music', 'sfx', 'video', 'overlay']),
```

(c) Extend `TimelineStateSchema` (lines 45–52):
```ts
export const TimelineStateSchema = z.object({
  schema_version: z.union([z.literal(1), z.literal(2)]).default(1),
  media_type: z.enum(['audio', 'av']).default('audio'),
  sample_rate: z.number().int().positive().default(48000),
  fps: z.number().int().positive().default(30),
  width: z.number().int().positive().default(1080),
  height: z.number().int().positive().default(1920),
  duration_sec: z.number().default(0),
  tracks: z.array(TrackSchema).default([]),
  ducking: z.array(DuckingRuleSchema).default([])
})
```

(d) Update the exported `Clip` type (line 54) — it is now the union:
```ts
export type AudioClip = z.infer<typeof AudioClipSchema>
export type VideoClip = z.infer<typeof VideoClipSchema>
export type OverlayClip = z.infer<typeof OverlayClipSchema>
export type Clip = z.infer<typeof ClipSchema>
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run test/audio/timelineSchema.test.ts`
Expected: PASS — all AV + backward-compat tests green, existing audio tests still green.

- [ ] **Step 5: Commit**

```bash
git add server/utils/audio/timelineSchema.ts test/audio/timelineSchema.test.ts
git commit -m "feat(video): AV clip union + video/overlay track kinds + TimelineState v2"
```

---

## Task 2: validateTimeline + computeDuration for AV

**Files:**
- Modify: `server/utils/audio/timelineSchema.ts`
- Test: `test/audio/timelineSchema.test.ts` (extend)

- [ ] **Step 1: Write failing tests**

Append to `test/audio/timelineSchema.test.ts` (reuse the `rawAv` helper — move it to module scope if needed, or redefine):
```ts
describe('validateTimeline (AV semantics)', () => {
  const baseAv = () => TimelineStateSchema.parse({
    schema_version: 2, media_type: 'av',
    tracks: [
      { id: 'vid', name: 'Video', kind: 'video', clips: [
        { type: 'video', id: 'v1', r2_key: 'm/f.mp4', timeline_start_sec: 0, duration_sec: 5, base_source: 'uploaded_footage' }
      ] },
      { id: 'ovl', name: 'Overlay', kind: 'overlay', clips: [
        { type: 'overlay', id: 'o1', timeline_start_sec: 0, duration_sec: 5, gsap_project_id: 'b1' }
      ] }
    ]
  })

  it('accepts a well-formed AV timeline', () => {
    expect(validateTimeline(baseAv()).ok).toBe(true)
  })

  it('rejects a clip whose type does not match its track kind', () => {
    const s = baseAv()
    ;(s.tracks[0].clips[0] as any).type = 'overlay'   // overlay clip on a video track
    const r = validateTimeline(s)
    expect(r.ok).toBe(false)
  })

  it('rejects a still_kenburns video clip with no kenburns params', () => {
    const s = baseAv()
    ;(s.tracks[0].clips[0] as any).base_source = 'still_kenburns'
    ;(s.tracks[0].clips[0] as any).kenburns = null
    expect(validateTimeline(s).ok).toBe(false)
  })

  it('rejects a non-positive duration_sec on a video/overlay clip', () => {
    const s = baseAv()
    ;(s.tracks[0].clips[0] as any).duration_sec = 0
    expect(validateTimeline(s).ok).toBe(false)
  })
})

describe('computeDuration (AV)', () => {
  it('uses timeline_start + duration_sec for video/overlay clips', () => {
    const s = TimelineStateSchema.parse({
      schema_version: 2, media_type: 'av',
      tracks: [
        { id: 'vid', name: 'V', kind: 'video', clips: [
          { type: 'video', id: 'v1', r2_key: 'm/f.mp4', timeline_start_sec: 10, duration_sec: 5, base_source: 'uploaded_footage' }
        ] },
        { id: 'ovl', name: 'O', kind: 'overlay', clips: [
          { type: 'overlay', id: 'o1', timeline_start_sec: 0, duration_sec: 8, gsap_project_id: 'b1' }
        ] }
      ]
    })
    expect(computeDuration(s)).toBe(15)   // max(10+5, 0+8)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run test/audio/timelineSchema.test.ts`
Expected: the new `validateTimeline (AV semantics)` and `computeDuration (AV)` tests FAIL.

- [ ] **Step 3: Implement the semantics**

In `validateTimeline` (inside the per-track loop, alongside the existing clip checks), add AV rules. Insert after the existing `trackIds.add(track.id)` / before the clip loop, and inside the clip loop:
```ts
  const expectedClipType: Record<string, 'audio' | 'video' | 'overlay'> = {
    voiceover: 'audio', music: 'audio', sfx: 'audio', video: 'video', overlay: 'overlay'
  }
```
Then inside the `for (const clip of track.clips)` loop, after the dup-id check, add:
```ts
      const want = expectedClipType[track.kind]
      const got = (clip as any).type ?? 'audio'
      if (want && got !== want) {
        errors.push(`clip ${clip.id}: type "${got}" does not match track kind "${track.kind}"`)
      }
      if (got === 'video') {
        const c = clip as any
        if (c.duration_sec <= 0) errors.push(`clip ${clip.id}: duration_sec must be > 0`)
        if (c.base_source === 'still_kenburns' && !c.kenburns) {
          errors.push(`clip ${clip.id}: still_kenburns requires kenburns params`)
        }
      }
      if (got === 'overlay') {
        const c = clip as any
        if (c.duration_sec <= 0) errors.push(`clip ${clip.id}: duration_sec must be > 0`)
      }
```
(Keep the existing audio-clip checks — guard them so they only run for audio clips: wrap the `timeline_start_sec`/`source_in_sec`/`source_out_sec` checks in `if (got === 'audio') { ... }`, since video clips also have those fields but overlay clips do not.)

In `computeDuration`, replace the clip loop body:
```ts
    for (const clip of track.clips) {
      const c = clip as any
      const type = c.type ?? 'audio'
      let clipEnd: number
      if (type === 'audio') {
        const end = c.source_out_sec ?? sourceDurations[c.id] ?? null
        clipEnd = end == null ? c.timeline_start_sec : c.timeline_start_sec + (end - c.source_in_sec)
      } else {
        clipEnd = c.timeline_start_sec + c.duration_sec   // video + overlay
      }
      if (clipEnd > max) max = clipEnd
    }
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run test/audio/timelineSchema.test.ts`
Expected: PASS — all tests green (AV semantics + existing audio).

- [ ] **Step 5: Commit**

```bash
git add server/utils/audio/timelineSchema.ts test/audio/timelineSchema.test.ts
git commit -m "feat(video): validateTimeline + computeDuration handle video/overlay clips"
```

---

## Task 3: migrateTimeline v2 + emptyAvTimeline seed

**Files:**
- Modify: `server/utils/audio/timelineSchema.ts`
- Test: `test/audio/timelineSchema.test.ts` (extend)

- [ ] **Step 1: Write failing tests**

```ts
describe('migrateTimeline + emptyAvTimeline', () => {
  it('passes through schema_version 2 unchanged', () => {
    const s = emptyAvTimeline()
    expect(migrateTimeline(s)).toEqual(s)
  })
  it('still passes through schema_version 1', () => {
    const s = TimelineStateSchema.parse(rawTimeline())
    expect(migrateTimeline(s).schema_version).toBe(1)
  })
  it('emptyAvTimeline seeds a valid AV project with Video/Overlay/VO/Music lanes', () => {
    const s = emptyAvTimeline()
    expect(s.schema_version).toBe(2)
    expect(s.media_type).toBe('av')
    expect(s.tracks.map(t => t.kind)).toEqual(['video', 'overlay', 'voiceover', 'music'])
    expect(validateTimeline(s).ok).toBe(true)
  })
})
```
(Add `emptyAvTimeline` to the import at the top of the test file.)

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run test/audio/timelineSchema.test.ts`
Expected: FAIL — `emptyAvTimeline` not exported; `migrateTimeline` rejects version 2.

- [ ] **Step 3: Implement**

In `migrateTimeline`, add the version-2 case:
```ts
export function migrateTimeline(state: TimelineState): TimelineState {
  switch (state.schema_version) {
    case 1:
      return state
    case 2:
      return state
    default:
      throw new Error(`Unsupported timeline schema_version: ${(state as any).schema_version}`)
  }
}
```

Add the seed helper (after `migrateTimeline`):
```ts
/** A blank AV project: Video + Overlay + VO + Music lanes, no clips. Pure. */
export function emptyAvTimeline(): TimelineState {
  return TimelineStateSchema.parse({
    schema_version: 2,
    media_type: 'av',
    tracks: [
      { id: 'video', name: 'Video', kind: 'video', clips: [] },
      { id: 'overlay', name: 'Overlay', kind: 'overlay', clips: [] },
      { id: 'vo', name: 'Voiceover', kind: 'voiceover', clips: [] },
      { id: 'music', name: 'Music', kind: 'music', clips: [] }
    ]
  })
}
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run test/audio/timelineSchema.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add server/utils/audio/timelineSchema.ts test/audio/timelineSchema.test.ts
git commit -m "feat(video): migrateTimeline v2 case + emptyAvTimeline seed"
```

---

## Task 4: Gateway — createProject accepts mediaType + schema_version

**Files:**
- Modify: `server/utils/audio/projects.ts`
- Test: `test/audio/mediaProjects.test.ts` (extend)

- [ ] **Step 1: Write failing tests**

Append to `test/audio/mediaProjects.test.ts`:
```ts
describe('createProject (AV)', () => {
  it('persists media_type "av" and schema_version 2 for an AV project', async () => {
    // The transaction mock runs the callback with a fake db whose query()
    // returns a row each call; capture the SQL + params.
    const calls: Array<{ sql: string; params: any[] }> = []
    const fakeDb = { query: vi.fn(async (sql: string, params: any[]) => {
      calls.push({ sql, params })
      return { rows: [{ ...projectRow, media_type: 'av' }] }
    }) }
    transactionMock.mockImplementation(async (cb: any) => cb(fakeDb))

    await createProject({
      createdBy: 'u1', clientId: null, title: 'Vid', mediaType: 'av',
      initialState: { schema_version: 2, media_type: 'av', tracks: [], ducking: [] } as any
    })

    const projInsert = calls.find(c => c.sql.includes('INSERT INTO media_projects'))!
    const tlInsert = calls.find(c => c.sql.includes('INSERT INTO media_timelines'))!
    expect(projInsert.params).toContain('av')          // media_type param
    expect(tlInsert.params).toContain(2)               // schema_version param
  })

  it('still persists media_type "audio" and schema_version 1 by default', async () => {
    const calls: Array<{ sql: string; params: any[] }> = []
    const fakeDb = { query: vi.fn(async (sql: string, params: any[]) => {
      calls.push({ sql, params }); return { rows: [projectRow] }
    }) }
    transactionMock.mockImplementation(async (cb: any) => cb(fakeDb))

    await createProject({
      createdBy: 'u1', clientId: null, title: 'Aud',
      initialState: { schema_version: 1, media_type: 'audio', tracks: [], ducking: [] } as any
    })
    const projInsert = calls.find(c => c.sql.includes('INSERT INTO media_projects'))!
    const tlInsert = calls.find(c => c.sql.includes('INSERT INTO media_timelines'))!
    expect(projInsert.params).toContain('audio')
    expect(tlInsert.params).toContain(1)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run test/audio/mediaProjects.test.ts`
Expected: FAIL — `mediaType` not on the input type; INSERTs use hardcoded `'audio'`/`1`, so the `'av'`/`2` params are absent.

- [ ] **Step 3: Implement the gateway delta**

In `server/utils/audio/projects.ts`:

(a) Extend `CreateProjectInput` (the interface ending at line 44):
```ts
  initialState: TimelineState
  mediaType?: 'audio' | 'av'
}
```

(b) In `createProject`, parametrize the two INSERTs:
```ts
  const mediaType = input.mediaType ?? 'audio'
  const schemaVersion = input.initialState.schema_version

  return transaction(async (db) => {
    const projRes = await db.query(
      `INSERT INTO media_projects (id, client_id, created_by, title, media_type, status)
       VALUES ($1, $2, $3, $4, $5, 'draft') RETURNING *`,
      [projectId, input.clientId, input.createdBy, input.title, mediaType]
    )
    const tlRes = await db.query(
      `INSERT INTO media_timelines (id, project_id, version, state, schema_version, created_by)
       VALUES ($1, $2, 1, $3, $4, $5) RETURNING *`,
      [timelineId, projectId, JSON.stringify(state), schemaVersion, input.createdBy]
    )
    const updRes = await db.query(
      `UPDATE media_projects SET current_timeline_id = $1, updated_at = now()
       WHERE id = $2 RETURNING *`,
      [timelineId, projectId]
    )
    return { project: mapProjectRow(updRes.rows[0]), timeline: mapTimelineRow(tlRes.rows[0]) }
  })
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run test/audio/mediaProjects.test.ts`
Expected: PASS — AV + audio createProject tests green, existing gateway tests still green.

- [ ] **Step 5: Commit**

```bash
git add server/utils/audio/projects.ts test/audio/mediaProjects.test.ts
git commit -m "feat(video): gateway createProject threads mediaType + schema_version"
```

---

## Task 5: Create endpoint accepts AV projects

**Files:**
- Modify: `server/api/agency/audio/projects/index.post.ts`
- Test: `test/audio/mediaProjectsApi.test.ts` (extend)

- [ ] **Step 1: Write failing test**

Append a test inside `test/audio/mediaProjectsApi.test.ts` (it already imports `createH` and mocks `createProject` as `mockCreateProject`):
```ts
describe('POST /agency/audio/projects (AV)', () => {
  it('creates an AV project, passing mediaType through and seeding an AV timeline', async () => {
    mockCreateProject.mockResolvedValue({ project: { id: 'p9', media_type: 'av' }, timeline: { id: 't9' } })
    const res = await createH({ body: { title: 'Vid', mediaType: 'av' } } as any)
    expect(mockCreateProject).toHaveBeenCalledTimes(1)
    const arg = mockCreateProject.mock.calls[0][0]
    expect(arg.mediaType).toBe('av')
    expect(arg.initialState.media_type).toBe('av')          // seeded empty AV timeline
    expect(arg.initialState.tracks.map((t: any) => t.kind)).toContain('video')
    expect(res.project.id).toBe('p9')
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `pnpm exec vitest run test/audio/mediaProjectsApi.test.ts`
Expected: FAIL — `mediaType` is dropped (not in BodySchema), and the seed is an empty audio timeline (no video track).

- [ ] **Step 3: Implement the endpoint delta**

Replace `server/api/agency/audio/projects/index.post.ts` body handling:
```ts
import { z } from 'zod'
import { requireWriteAccess } from '~~/server/utils/auth'
import { createProject } from '~~/server/utils/audio/projects'
import { TimelineStateSchema, validateTimeline, emptyAvTimeline } from '~~/server/utils/audio/timelineSchema'

const BodySchema = z.object({
  title: z.string().max(200).nullish(),
  clientId: z.string().uuid().nullish(),
  mediaType: z.enum(['audio', 'av']).default('audio'),
  initialState: z.unknown().optional()
})

export default defineEventHandler(async (event) => {
  const user = await requireWriteAccess(event)
  const body = BodySchema.parse(await readBody(event))

  // Seed: explicit state, else an empty AV timeline for AV projects / empty audio for audio.
  const seed = body.initialState ?? (body.mediaType === 'av' ? emptyAvTimeline() : {})

  const parsed = TimelineStateSchema.safeParse(seed)
  if (!parsed.success) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid timeline', data: { errors: parsed.error.issues.map(i => i.message) } })
  }
  const check = validateTimeline(parsed.data)
  if (check.ok === false) {
    throw createError({ statusCode: 400, statusMessage: 'Invalid timeline', data: { errors: check.errors } })
  }

  const { project, timeline } = await createProject({
    createdBy: user.id,
    clientId: body.clientId ?? null,
    title: body.title ?? null,
    mediaType: body.mediaType,
    initialState: parsed.data
  })

  setResponseStatus(event, 201)
  return { project, timeline }
})
```

- [ ] **Step 4: Run to verify pass**

Run: `pnpm exec vitest run test/audio/mediaProjectsApi.test.ts`
Expected: PASS — AV create test green, existing endpoint tests still green.

- [ ] **Step 5: Run the full audio suite + typecheck-changed (regression gate)**

Run: `pnpm exec vitest run test/audio/`
Expected: all audio tests green (0 regressions).

Run: `pnpm exec nuxt typecheck 2>&1 | grep -E "timelineSchema|projects.ts|index.post" || echo "no new errors in changed files"`
Expected: no new errors attributable to the changed files. (Note: the widened `Track.kind` union may surface non-exhaustive `switch` warnings in SP1/SP2 audio code that switches on kind — if so, add a `default`/no-op branch for `video`/`overlay` there, since audio code never receives those kinds. The repo runs `typescript.strict: false`.)

- [ ] **Step 6: Commit**

```bash
git add server/api/agency/audio/projects/index.post.ts test/audio/mediaProjectsApi.test.ts
git commit -m "feat(video): create endpoint accepts AV projects + seeds AV timeline"
```

---

## Done criteria (V1.1)

- [ ] `pnpm exec vitest run test/audio/` is fully green (AV + zero audio regression).
- [ ] An AV `TimelineState` validates, `computeDuration` is correct, and `createProject({ mediaType: 'av' })` stores `media_type='av'` + `schema_version=2`.
- [ ] Shipped audio projects remain `schema_version 1 / media_type 'audio'`; an existing audio fixture parses unchanged.
- [ ] No new typecheck errors in the changed files (handle any widened-union `switch` exhaustiveness in SP1/SP2 with a no-op `video`/`overlay` branch).
- [ ] No SQL migration added.
