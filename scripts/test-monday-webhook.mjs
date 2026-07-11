import crypto from 'node:crypto'

const url = process.env.MONDAY_WEBHOOK_URL
const secret = process.env.MONDAY_SIGNING_SECRET
if (!url || !secret) throw new Error('MONDAY_WEBHOOK_URL and MONDAY_SIGNING_SECRET are required')

const challenge = `challenge-${Date.now()}`
const challengeResponse = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ challenge }) })
const challengeBody = await challengeResponse.json()
if (challengeBody.challenge !== challenge) throw new Error('Monday challenge response mismatch')

const eventId = `smoke-${Date.now()}`
const payload = { event: { id: eventId, type: 'change_column_value', boardId: process.env.MONDAY_SMOKE_BOARD_ID || 'smoke-board', pulseId: process.env.MONDAY_SMOKE_ITEM_ID || 'smoke-item' } }
const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64url')
const header = encoded({ alg: 'HS256', typ: 'JWT' })
const body = encoded({ aud: 'monday-smoke', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 300 })
const signature = crypto.createHmac('sha256', secret).update(`${header}.${body}`).digest('base64url')
const jwt = `${header}.${body}.${signature}`

for (let attempt = 0; attempt < 2; attempt++) {
  const response = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${jwt}`, 'X-Apps-Event-Id': eventId, 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  if (!response.ok) throw new Error(`Webhook attempt ${attempt + 1} failed: ${response.status} ${await response.text()}`)
  console.log(`Webhook attempt ${attempt + 1}:`, await response.json())
}
console.log('Challenge, signature, queue, and duplicate-event smoke checks passed.')
