import { randomUUID } from 'node:crypto'
import { Pool } from 'pg'
import { createRequire } from 'node:module'
const workerPg = createRequire(new URL('../../workers/audio-jobs/src/db.ts', import.meta.url))('pg')
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { dbMarkRenderRendering, dbMarkRenderProgress, dbMarkRenderDone, dbMarkRenderFailed } from '../../workers/audio-jobs/src/db'

import { runVideoCompositeJob, RenderPublicationUncertainError } from '../../workers/audio-jobs/src/videoCompositeRender'

const connection = process.env.VIDEO_HARDENING_DATABASE_URL
if (connection) {
  const url = new URL(connection)
  if (!['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname) || !url.port || url.pathname !== '/video_render_hardening_test' || url.search)
    throw new Error('Video hardening tests require an explicit isolated localhost video_render_hardening_test database')
}
const pool = connection ? new Pool({ connectionString: connection, max: 3 }) : null
const schema = 'video_attempt_' + randomUUID().replaceAll('-', '')
const jobId = randomUUID(), first = randomUUID(), second = randomUUID()
const previous = (globalThis as any).__HYPERDRIVE_CS
const progress = (attemptId: string, stage = 'encoding') => ({ attemptId, stage, done: 0, total: 1, formatKey: 'reels_9x16', updatedAt: new Date().toISOString() })
async function row() { return (await pool!.query(`SELECT * FROM "${schema}".media_render_jobs WHERE id=$1`, [jobId])).rows[0] }

describe.skipIf(!connection)('native PostgreSQL render attempt fences', () => {
  beforeAll(async () => {
    await pool!.query(`CREATE SCHEMA "${schema}"`)
    await pool!.query(`CREATE TABLE "${schema}".media_render_jobs (id uuid PRIMARY KEY, status text NOT NULL, progress jsonb, variants jsonb NOT NULL DEFAULT '{}', cost_cents integer, error text, updated_at timestamptz NOT NULL DEFAULT now())`)
    const scoped = new URL(connection!); scoped.searchParams.set('options', '-c search_path=' + schema)
    ;(globalThis as any).__HYPERDRIVE_CS = scoped.toString()
  })
  beforeEach(async () => {
    await pool!.query(`TRUNCATE "${schema}".media_render_jobs`)
    await pool!.query(`INSERT INTO "${schema}".media_render_jobs(id,status) VALUES($1,'queued')`, [jobId])
  })
  afterAll(async () => {
    ;(globalThis as any).__HYPERDRIVE_CS = previous
    if (pool) { await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`); await pool.end() }
  })
  it('rejects stale progress, failure and completion after another attempt takes ownership', async () => {
    await dbMarkRenderRendering(jobId, first)
    await dbMarkRenderProgress(jobId, progress(first))
    await dbMarkRenderRendering(jobId, second)
    await dbMarkRenderProgress(jobId, progress(first))
    expect((await row()).progress.attemptId).toBe(second)
    await dbMarkRenderFailed(jobId, 'old failure', first)
    expect((await row()).status).toBe('rendering')
    await expect(dbMarkRenderDone(jobId, { reels_9x16: 'old.mp4' }, 1, first)).rejects.toThrow(/attempt/i)
    expect((await row()).variants).toEqual({})
    await dbMarkRenderProgress(jobId, progress(second))
    await dbMarkRenderDone(jobId, { reels_9x16: 'new.mp4' }, 2, second)
    await dbMarkRenderProgress(jobId, { ...progress(second, 'done'), done: 1, formatKey: null })
    await dbMarkRenderProgress(jobId, progress(first))
    await dbMarkRenderProgress(jobId, progress(second))
    expect(await row()).toMatchObject({ status: 'done', variants: { reels_9x16: 'new.mp4' }, progress: { stage: 'done', attemptId: second } })
  })
  it('does not revive a completed job when a duplicate delivery claims it', async () => {
    await dbMarkRenderRendering(jobId, first)
    await dbMarkRenderDone(jobId, { reels_9x16: 'approved.mp4' }, 2, first)
    await dbMarkRenderRendering(jobId, second)
    await dbMarkRenderFailed(jobId, 'late failure', first)
    expect(await row()).toMatchObject({ status: 'done', variants: { reels_9x16: 'approved.mp4' }, progress: { attemptId: first } })
  })
  it('retains published bytes when PostgreSQL commits completion but its response is lost', async () => {
    const original = workerPg.Client.prototype.query
    let loseResponse = true
    const spy = vi.spyOn(workerPg.Client.prototype, 'query').mockImplementation(async function(this: any, ...args: any[]) {
      const result = await (original as any).apply(this, args)
      if (loseResponse && typeof args[0] === 'string' && args[0].includes("SET status='done'")) {
        loseResponse = false
        throw new Error('Connection terminated after commit')
      }
      return result
    } as any)
    const deps = {
      loadRenderInputs: async () => (await row()).status === 'done' ? { completed: true as const } : null,
      checkEligibility: vi.fn(), publishApproved: vi.fn(), discardOutput: vi.fn(),
      loadTimelineState: async () => ({}), markRendering: dbMarkRenderRendering,
      renderOne: vi.fn().mockResolvedValue({ key: 'retained.mp4' }),
      markDone: dbMarkRenderDone, markFailed: dbMarkRenderFailed, centsPerSec: 1,
    }
    const msg = { jobId, projectId: 'p', timelineId: 't', formats: ['reels_9x16'] }
    try {
      const outcome = await runVideoCompositeJob(msg, deps).then(() => 'resolved', e => e)
      expect(loseResponse).toBe(false)
      expect(outcome).toBeInstanceOf(RenderPublicationUncertainError)
      expect(await row()).toMatchObject({ status: 'done', variants: { reels_9x16: 'retained.mp4' } })
      expect(deps.discardOutput).not.toHaveBeenCalled()
      await runVideoCompositeJob(msg, deps)
      expect(deps.renderOne).toHaveBeenCalledOnce()
    } finally { spy.mockRestore() }
  })
  it('never lets tokenless legacy writers erase or bypass a video attempt fence', async () => {
    await dbMarkRenderRendering(jobId, first)
    await dbMarkRenderProgress(jobId, { stage: 'encoding', done: 0, total: 1 })
    expect((await row()).progress.attemptId).toBe(first)
    await dbMarkRenderFailed(jobId, 'unfenced error')
    await dbMarkRenderDone(jobId, { radio: 'foreign.mp3' }, 2)
    expect(await row()).toMatchObject({ status: 'rendering', variants: {}, progress: { attemptId: first } })
    await dbMarkRenderFailed(jobId, 'owned error', first)
    await dbMarkRenderRendering(jobId)
    expect((await row()).status).toBe('failed')
  })
  it('rejects a delayed earlier-format advisory write within the same attempt', async () => {
    await dbMarkRenderRendering(jobId, first)
    await dbMarkRenderProgress(jobId, { ...progress(first), sequence: 2, formatKey: 'square_1x1' })
    await dbMarkRenderProgress(jobId, { ...progress(first, 'capturing'), sequence: 1, formatKey: 'reels_9x16' })
    expect((await row()).progress).toMatchObject({ sequence: 2, formatKey: 'square_1x1', stage: 'encoding' })
  })
  it('retains legacy audio status writes without an attempt token', async () => {
    await dbMarkRenderRendering(jobId)
    await dbMarkRenderProgress(jobId, { stage: 'rendering', done: 0, total: 1 })
    await dbMarkRenderDone(jobId, { radio: 'audio.mp3' }, 2)
    await dbMarkRenderProgress(jobId, { stage: 'done', done: 1, total: 1 })
    expect(await row()).toMatchObject({ status: 'done', variants: { radio: 'audio.mp3' }, progress: { stage: 'done' } })
  })
})
