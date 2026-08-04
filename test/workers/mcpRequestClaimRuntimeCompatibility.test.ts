import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { resolve } from 'node:path'
import { unstable_dev, type UnstableDevWorker } from 'wrangler'

import {
  digestMcpRequestBody,
  verifyMcpRequestClaim
} from '~~/shared/utils/mcpRequestClaim'

const SIGNING_SECRET = 'workerd-to-nitro-compatibility-secret'
const USER_ID = '11111111-1111-4111-8111-111111111111'

describe('MCP request claim Worker-runtime compatibility', () => {
  let worker: UnstableDevWorker

  beforeAll(async () => {
    worker = await unstable_dev(
      resolve(__dirname, '../fixtures/mcp-request-claim-worker.ts'),
      {
        config: resolve(__dirname, '../fixtures/mcp-request-claim-wrangler.toml'),
        experimental: { disableExperimentalWarning: true },
        local: true,
        vars: { SIGNING_SECRET }
      }
    )
  }, 30_000)

  afterAll(async () => {
    await worker?.stop()
  })

  it('verifies in Nitro/shared code an assertion minted by actual workerd Web Crypto', async () => {
    const body = {
      userId: USER_ID,
      tool: 'create_task',
      args: { title: 'Ship', clientId: '22222222-2222-4222-8222-222222222222' },
      idempotencyKey: `mcp:${'a'.repeat(64)}`
    }
    const response = await worker.fetch('https://worker.test/sign', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body)
    })
    const { assertion } = await response.json() as { assertion: string }

    await expect(verifyMcpRequestClaim(assertion, SIGNING_SECRET)).resolves.toMatchObject({
      uid: USER_ID,
      godMode: true,
      path: '/api/internal/mcp/call',
      toolName: 'create_task',
      bodyDigest: await digestMcpRequestBody(body)
    })
  }, 20_000)
})
