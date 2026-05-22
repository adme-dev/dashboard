/**
 * OfficeRoom WS lifecycle — smoke test (Phase 1a scope).
 *
 * Spins up the office-room worker via wrangler's unstable_dev and verifies
 * the upgrade handshake. Per the plan, full WS behavioural testing (join /
 * snapshot / move / leave) is deferred to the manual UAT in Task 20 — the
 * Miniflare WS client story is rough as of 2026-05 and not worth blocking
 * Phase 1a on.
 *
 * If this test flakes in CI, demote to .skip and rely on the UAT checklist.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { unstable_dev, type UnstableDevWorker } from 'wrangler'
import { resolve } from 'node:path'

describe('OfficeRoom WS upgrade handshake', () => {
  let worker: UnstableDevWorker

  beforeAll(async () => {
    worker = await unstable_dev(
      resolve(__dirname, '../../../workers/office-room/src/index.ts'),
      {
        config: resolve(__dirname, '../../../workers/office-room/wrangler.toml'),
        experimental: { disableExperimentalWarning: true },
        local: true,
      },
    )
  }, 30_000)

  afterAll(async () => {
    await worker?.stop()
  })

  it('rejects non-WebSocket requests with 404 (no route match)', async () => {
    const res = await worker.fetch('http://example.com/not-an-office-path')
    expect(res.status).toBe(404)
  })

  it('responds with 426 when /office/:id is hit without an Upgrade header', async () => {
    // The default fetch handler routes /office/:id into the DO, which then
    // requires the WS upgrade header. Without it the DO returns 426.
    const res = await worker.fetch('http://example.com/office/test-office')
    expect(res.status).toBe(426)
  })
})
