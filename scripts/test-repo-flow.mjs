#!/usr/bin/env node
/**
 * End-to-end integration test of the repo connection flow.
 * Exercises encryption / DB / decryption / GitHub API / R2 graphify
 * without the HTTP layer (which would need a dashboard session cookie).
 *
 * Usage:
 *   node --env-file=.env --env-file=.dev.vars scripts/test-repo-flow.mjs <PAT>
 */

import pg from 'pg'
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3'

const PAT = process.argv[2]
if (!PAT) {
  console.error('Usage: node --env-file=.env --env-file=.dev.vars scripts/test-repo-flow.mjs <PAT>')
  process.exit(1)
}

const REPO_URL = 'https://github.com/adme-dev/promotion-knoxgwmhaval'
const GRAPHIFY_PATH = 'graphify/promotion-knoxgwmhaval'
const BOARD_SLUG = 'drive-agent-engineering'
const DEFAULT_BRANCH = 'main'

const ALG = 'AES-GCM'
const IV_LEN = 12

function base64ToBytes(b64) {
  const bin = atob(b64)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function getKey() {
  const b64 = process.env.REPO_TOKEN_ENCRYPTION_KEY
  if (!b64) throw new Error('REPO_TOKEN_ENCRYPTION_KEY not set')
  const bytes = base64ToBytes(b64)
  if (bytes.length !== 32) throw new Error(`Key must be 32 bytes, got ${bytes.length}`)
  return crypto.subtle.importKey('raw', bytes, ALG, false, ['encrypt', 'decrypt'])
}

async function encryptToken(plaintext) {
  const key = await getKey()
  const iv = crypto.getRandomValues(new Uint8Array(IV_LEN))
  const data = new TextEncoder().encode(plaintext)
  const ct = await crypto.subtle.encrypt({ name: ALG, iv }, key, data)
  return { ciphertext: new Uint8Array(ct), iv }
}

async function decryptToken(ciphertext, iv) {
  const key = await getKey()
  const decrypted = await crypto.subtle.decrypt({ name: ALG, iv: new Uint8Array(iv) }, key, new Uint8Array(ciphertext))
  return new TextDecoder().decode(decrypted)
}

const log = (label, ok, detail = '') => {
  const mark = ok ? '✅' : '❌'
  console.log(`${mark} ${label}${detail ? ' — ' + detail : ''}`)
}

async function main() {
  // ─── 1. Encrypt PAT ────────────────────────────
  let encrypted
  try {
    encrypted = await encryptToken(PAT)
    log('Encrypt PAT', true, `${encrypted.ciphertext.length}B ciphertext + ${encrypted.iv.length}B IV`)
  } catch (e) {
    log('Encrypt PAT', false, e.message)
    process.exit(1)
  }

  // ─── 2. DB connection ──────────────────────────
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL })
  await client.connect()
  log('DB connect', true)

  // ─── 3. Resolve board id ───────────────────────
  const boardRow = await client.query('SELECT id FROM departments WHERE slug = $1', [BOARD_SLUG])
  if (!boardRow.rows[0]) {
    log('Resolve board', false, `slug ${BOARD_SLUG} not found`)
    await client.end()
    process.exit(1)
  }
  const boardId = boardRow.rows[0].id
  log('Resolve board', true, `${boardId}`)

  // ─── 4. UPSERT project_repos ───────────────────
  const ownerRow = await client.query('SELECT id FROM team_members ORDER BY created_at LIMIT 1')
  const ownerId = ownerRow.rows[0]?.id ?? null

  await client.query(
    `INSERT INTO project_repos (department_id, repo_url, default_branch, access_token_encrypted, token_iv, graphify_path, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (department_id, repo_url) DO UPDATE
       SET default_branch = EXCLUDED.default_branch,
           access_token_encrypted = EXCLUDED.access_token_encrypted,
           token_iv = EXCLUDED.token_iv,
           graphify_path = EXCLUDED.graphify_path,
           updated_at = NOW()`,
    [boardId, REPO_URL, DEFAULT_BRANCH, encrypted.ciphertext, encrypted.iv, GRAPHIFY_PATH, ownerId],
  )
  log('UPSERT project_repos', true)

  // ─── 5. Read back & decrypt ────────────────────
  const back = await client.query(
    'SELECT access_token_encrypted, token_iv FROM project_repos WHERE department_id = $1 AND repo_url = $2',
    [boardId, REPO_URL],
  )
  const decrypted = await decryptToken(back.rows[0].access_token_encrypted, back.rows[0].token_iv)
  log('Decrypt round-trip', decrypted === PAT, decrypted === PAT ? 'matches' : 'MISMATCH')

  // ─── 6. Hit GitHub API with decrypted token ────
  const ghRes = await fetch('https://api.github.com/repos/adme-dev/promotion-knoxgwmhaval', {
    headers: {
      Authorization: `Bearer ${decrypted}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'User-Agent': 'agency-dashboard-test',
    },
  })
  if (!ghRes.ok) {
    log('GitHub API', false, `${ghRes.status} ${await ghRes.text().then(t => t.slice(0, 200))}`)
  } else {
    const data = await ghRes.json()
    log('GitHub API', true, `repo ${data.full_name} · default_branch ${data.default_branch} · private ${data.private}`)
  }

  // ─── 7. R2 graphify read ───────────────────────
  const r2 = new S3Client({
    region: 'auto',
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  })
  try {
    const obj = await r2.send(
      new GetObjectCommand({
        Bucket: process.env.R2_BUCKET_NAME || 'agency-files',
        Key: `${GRAPHIFY_PATH}/graph.json`,
      }),
    )
    const bytes = await obj.Body.transformToByteArray()
    const graph = JSON.parse(new TextDecoder().decode(bytes))
    const node = graph.nodes.find((n) => n.label?.includes('VehicleChatAgent'))
    log('R2 graphify read', true, `${graph.nodes.length} nodes · VehicleChatAgent ${node ? 'present' : 'NOT FOUND'}`)
  } catch (e) {
    log('R2 graphify read', false, e.message)
  }

  await client.end()
  console.log('\n🎉 All foundation layers verified.')
}

main().catch((e) => {
  console.error('Fatal:', e)
  process.exit(1)
})
