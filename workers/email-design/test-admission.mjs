import assert from 'node:assert/strict'
import { createHmac } from 'node:crypto'
import { resolve } from 'node:path'
import { Miniflare } from 'miniflare'
import { DESIGN_ACTION_LIMITS } from '../../shared/emailRendering/designActions.ts'
import { MAX_RENDER_REQUEST_BYTES } from '../../shared/emailRendering/bounds.ts'

const origin = 'https://email-design.test'
const draftUrl = `${origin}/api/email/design/drafts/not-a-uuid`
const saveUrl = `${origin}/api/email/design/drafts/d0000000-0000-4000-8000-000000000001`
const templateUrl = `${origin}/api/email/templates/d0000000-0000-4000-8000-000000000001`
const legacyBodyLimit = MAX_RENDER_REQUEST_BYTES + DESIGN_ACTION_LIMITS.envelopeBytes
const validSecret = 'synthetic-miniflare-secret'
const validBindings = {
  EMAIL_DESIGN_ENVIRONMENT: 'staging',
  JWT_SECRET: validSecret,
  FIGFLOW_EDM_DRAFT_SAVES_ENABLED: 'true'
}
const environmentHeader = { 'x-xeroflow-email-design-environment': 'staging' }

async function deadline(promise, milliseconds, label) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Deadline exceeded: ${label}`)), milliseconds)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}

async function scenario(name, bindings, run) {
  const worker = new Miniflare({
    modules: true,
    scriptPath: resolve('dist/worker.mjs'),
    compatibilityDate: '2026-07-08',
    compatibilityFlags: ['nodejs_compat'],
    bindings
  })
  try {
    await deadline(run(worker), 15_000, name)
    console.log(`ok ${name}`)
  } finally {
    await deadline(worker.dispose(), 5_000, `${name} disposal`)
  }
}

async function expectStatus(response, status, message) {
  assert.equal(response.status, status)
  assert.match(await response.text(), new RegExp(message))
}

function canonicalToken(secret) {
  const json = JSON.stringify({
    userId: '10000000-0000-4000-8000-000000000001',
    jti: 'synthetic-token',
    iat: Date.now(),
    exp: Date.now() + 60_000
  })
  const payload = Buffer.from(json).toString('base64')
  const signature = createHmac('sha256', secret).update(json).digest('base64')
  return `${payload}.${signature}`
}

await scenario('disabled flag remains closed', {
  EMAIL_DESIGN_ENVIRONMENT: 'staging',
  JWT_SECRET: validSecret
}, async (worker) => {
  const response = await worker.dispatchFetch(draftUrl, { headers: environmentHeader })
  await expectStatus(response, 404, 'not_found')
})

for (const [name, bindings, headers, status, message] of [
  [
    'missing environment',
    { JWT_SECRET: validSecret },
    environmentHeader,
    503,
    'email_design_environment_unavailable'
  ],
  [
    'invalid environment',
    { ...validBindings, EMAIL_DESIGN_ENVIRONMENT: 'development' },
    environmentHeader,
    503,
    'email_design_environment_unavailable'
  ],
  [
    'environment header mismatch',
    validBindings,
    { 'x-xeroflow-email-design-environment': 'production' },
    403,
    'email_design_environment_mismatch'
  ]
]) {
  await scenario(name, bindings, async (worker) => {
    const response = await worker.dispatchFetch(draftUrl, { headers })
    await expectStatus(response, status, message)
  })
}

for (const [name, secret] of [
  ['missing JWT secret', undefined],
  ['canonical insecure JWT fallback', 'your-secret-key-change-in-production']
]) {
  const bindings = { ...validBindings }
  if (secret === undefined) delete bindings.JWT_SECRET
  else bindings.JWT_SECRET = secret
  await scenario(name, bindings, async (worker) => {
    const response = await worker.dispatchFetch(draftUrl, { headers: environmentHeader })
    await expectStatus(response, 503, 'email_design_secret_unavailable')
  })
}

await scenario('oversized chunked body is rejected before Nitro auth', validBindings, async (worker) => {
  let sent = 0
  const body = new ReadableStream({
    pull(controller) {
      if (sent > DESIGN_ACTION_LIMITS.envelopeBytes) {
        controller.close()
        return
      }
      const size = Math.min(65_536, DESIGN_ACTION_LIMITS.envelopeBytes + 1 - sent)
      controller.enqueue(new Uint8Array(size))
      sent += size
    }
  })
  const response = await worker.dispatchFetch(saveUrl, {
    method: 'PATCH',
    headers: {
      ...environmentHeader,
      'content-type': 'application/json',
      'origin': 'https://app.xeroflow.io'
    },
    body,
    duplex: 'half'
  })
  await expectStatus(response, 413, 'design_request_too_large')
})

await scenario('missing token reaches canonical auth denial', validBindings, async (worker) => {
  const response = await worker.dispatchFetch(draftUrl, { headers: environmentHeader })
  await expectStatus(response, 401, 'design_session_invalid')
})

await scenario('configured JWT key reaches DB boundary and wrong key is denied', validBindings, async (worker) => {
  const wrong = await worker.dispatchFetch(draftUrl, {
    headers: {
      ...environmentHeader,
      authorization: `Bearer ${canonicalToken('wrong-synthetic-secret')}`
    }
  })
  await expectStatus(wrong, 401, 'design_session_invalid')

  const correct = await worker.dispatchFetch(draftUrl, {
    headers: {
      ...environmentHeader,
      authorization: `Bearer ${canonicalToken(validSecret)}`
    }
  })
  await expectStatus(correct, 503, 'design_read_unavailable')
})

await scenario('legacy template routes need no draft flag and preserve auth denial', {
  EMAIL_DESIGN_ENVIRONMENT: 'staging',
  JWT_SECRET: validSecret
}, async (worker) => {
  const patched = await worker.dispatchFetch(templateUrl, {
    method: 'PATCH',
    headers: {
      ...environmentHeader,
      'content-type': 'application/json',
      'origin': 'https://app.xeroflow.io'
    },
    body: '{}'
  })
  await expectStatus(patched, 401, 'Unauthorized')

  const deleted = await worker.dispatchFetch(templateUrl, {
    method: 'DELETE',
    headers: environmentHeader
  })
  await expectStatus(deleted, 401, 'Unauthorized')
})

await scenario('legacy PATCH above the draft envelope reaches canonical auth', validBindings, async (worker) => {
  const response = await worker.dispatchFetch(templateUrl, {
    method: 'PATCH',
    headers: {
      ...environmentHeader,
      'content-type': 'application/json',
      'origin': 'https://app.xeroflow.io'
    },
    body: new Uint8Array(DESIGN_ACTION_LIMITS.envelopeBytes + 1)
  })
  await expectStatus(response, 401, 'Unauthorized')
})

await scenario('legacy PATCH above the combined ceiling is rejected before auth', validBindings, async (worker) => {
  let sent = 0
  const body = new ReadableStream({
    pull(controller) {
      if (sent > legacyBodyLimit) {
        controller.close()
        return
      }
      const size = Math.min(65_536, legacyBodyLimit + 1 - sent)
      controller.enqueue(new Uint8Array(size))
      sent += size
    }
  })
  const response = await worker.dispatchFetch(templateUrl, {
    method: 'PATCH',
    headers: {
      ...environmentHeader,
      'content-type': 'application/json',
      'origin': 'https://app.xeroflow.io'
    },
    body,
    duplex: 'half'
  })
  await expectStatus(response, 413, 'design_request_too_large')
})
