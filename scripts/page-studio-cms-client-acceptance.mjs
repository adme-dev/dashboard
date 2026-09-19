import assert from 'node:assert/strict'
import { createHash, randomBytes, randomUUID } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { chromium } from 'playwright'
import pg from 'pg'

// Deliberately limited to the existing synthetic staging site. Never point this
// at customer content. Credentials stay in memory; no browser traces are saved.
assert.equal(process.env.CMS_ACCEPTANCE_ALLOW_MUTATION, 'synthetic-only')
assert(process.env.CMS_ACCEPTANCE_CONNECTION_FILE)
assert(process.env.CMS_ACCEPTANCE_REPORT)
const connection = new URL((await readFile(process.env.CMS_ACCEPTANCE_CONNECTION_FILE, 'utf8')).trim())
assert.equal(connection.hostname, 'ep-raspy-water-a4v6q356-pooler.us-east-1.aws.neon.tech')
assert.equal(connection.pathname, '/neondb')
connection.searchParams.set('sslmode', 'verify-full')
const origin = 'https://preview.agency-dashboard-6cm.pages.dev'
const siteId = 'a27135dc-1374-475c-a56d-7e60310425bb'
const api = `${origin}/api/portal/page-studio/sites/${siteId}/content`
const run = randomUUID()
const users = ['editorA', 'editorB', 'viewer', 'unassigned'].map(name => ({ name, id: randomUUID() }))
const pool = new pg.Pool({ connectionString: connection.toString(), max: 1, connectionTimeoutMillis: 15000, statement_timeout: 20000 })
const query = (sql, args = []) => pool.query(sql, args)
const report = { run, siteId, origin, startedAt: new Date().toISOString(), cases: [], retired: false }
const pass = (label) => {
  report.cases.push({ label, passed: true })
  console.log(label)
}
const safeMessage = error => String(error.message).replace(/postgres(?:ql)?:\/\/\S+/g, '[database URI]').replace(/[A-Za-z0-9_-]{64,}/g, '[redacted]')
let browser, baseline, before, lastWritten, seeded = false, a

async function snapshot() {
  return (await query(`SELECT tenant_id,client_id,current_checkpoint_id,current_version_id,
    ARRAY(SELECT id FROM page_studio_checkpoints WHERE site_id=$1 ORDER BY id) AS checkpoints,
    ARRAY(SELECT id FROM page_studio_versions WHERE site_id=$1 ORDER BY id) AS versions
    FROM page_studio_sites WHERE id=$1`, [siteId])).rows[0]
}
async function content(context) {
  const response = await context.request.get(api)
  assert.equal(response.status(), 200, 'Read authenticated content')
  return response.json()
}
async function open(context) {
  const page = await context.newPage()
  page.setDefaultTimeout(20000)
  await page.goto(`${origin}/portal/page-studio/${siteId}/content`)
  await page.getByRole('heading', { name: 'Business content', exact: true }).waitFor()
  await page.getByLabel('Name', { exact: true }).waitFor()
  return page
}
async function save(page, expected) {
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url() === api && r.request().method() === 'PUT'),
    page.getByRole('button', { name: 'Save changes', exact: true }).click()
  ])
  assert.equal(response.status(), expected, 'CMS save HTTP status')
  const result = await response.json()
  if (expected === 200) {
    lastWritten = result
    await page.getByText(`Saved revision ${result.revision}`, { exact: true }).waitFor()
  }
  return result
}

try {
  before = await snapshot()
  assert(before?.current_checkpoint_id, 'Expected existing synthetic checkpoint')
  assert.equal(before.tenant_id, 'page-studio-staging')
  assert.equal(before.client_id, '10000000-0000-4000-8000-000000000001')
  report.before = before
  await query('BEGIN')
  for (const user of users) {
    await query(`INSERT INTO client_users(id,client_id,email,name,role,status,email_verified,email_notifications,notification_preferences)
      VALUES($1,$2,$3,$4,'manager','active',true,false,'{}')`,
    [user.id, before.client_id, `cms-${run}-${user.name}@example.invalid`, `Synthetic CMS ${user.name}`])
    if (user.name !== 'unassigned') {
      await query(`INSERT INTO page_studio_site_memberships(tenant_id,client_id,site_id,user_id,role)
        VALUES($1,$2,$3,$4,$5)`, [before.tenant_id, before.client_id, siteId, user.id, user.name === 'viewer' ? 'viewer' : 'editor'])
    }
  }
  await query('COMMIT')
  seeded = true
  report.users = users
  await writeFile(process.env.CMS_ACCEPTANCE_REPORT, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  const contexts = {}
  for (const user of users) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } })
    contexts[user.name] = context
    const magic = randomBytes(48).toString('base64url')
    await query(`INSERT INTO client_magic_link_tokens(client_user_id,token_hash,expires_at)
      VALUES($1,$2,NOW()+INTERVAL '10 minutes')`, [user.id, createHash('sha256').update(magic).digest('hex')])
    const login = await context.request.post(`${origin}/api/portal/auth/magic-link/verify`, { data: { token: magic } })
    assert.equal(login.status(), 200, `Synthetic ${user.name} magic link`)
    await query(`UPDATE client_sessions SET expires_at=LEAST(expires_at,NOW()+INTERVAL '30 minutes') WHERE client_user_id=$1`, [user.id])
  }
  a = contexts.editorA
  baseline = await content(a)
  assert.equal(baseline.canEdit, true)
  assert.equal(baseline.content.collections[0]?.id, 'cms_connection_acceptance', 'Only expected synthetic content')
  assert.equal(baseline.content.collections[0]?.records[0]?.title, 'Staging CMS saved entry')
  assert.equal(baseline.content.collections.length, 1)
  assert.equal(baseline.content.collections[0].records.length, 1)
  report.initialRevision = baseline.revision
  // Preserve the exact synthetic baseline before the first request that can write.
  report.baseline = baseline
  await writeFile(process.env.CMS_ACCEPTANCE_REPORT, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
  const [pageA, pageB, viewer] = await Promise.all([open(a), open(contexts.editorB), open(contexts.viewer)])
  assert.equal(await pageA.getByLabel('Name', { exact: true }).inputValue(), 'Staging CMS saved entry')
  assert.equal(await pageB.getByLabel('Name', { exact: true }).inputValue(), 'Staging CMS saved entry')
  await viewer.getByText('You have read-only access to this content.', { exact: true }).waitFor()
  assert(await viewer.getByLabel('Name', { exact: true }).isDisabled())
  for (const name of ['Save changes', 'Add entry', 'Add collection', 'Remove collection', 'Remove entry']) {
    assert(await viewer.getByRole('button', { name, exact: true }).isDisabled(), `Viewer ${name} disabled`)
  }
  const viewerState = await content(contexts.viewer)
  assert.equal(viewerState.canEdit, false)
  const denied = await contexts.viewer.request.put(api, { data: { expectedRevision: baseline.revision, collections: baseline.content.collections } })
  assert.equal(denied.status(), 403, 'Viewer cannot bypass UI with direct write')
  const unassigned = await contexts.unassigned.request.get(api)
  assert.equal(unassigned.status(), 403, 'Same-client user without membership is denied')
  assert.deepEqual(await content(a), baseline)
  pass('Client editors open content; viewer controls and direct writes are restricted; membership is required')

  const titleA = `Synthetic winner ${run}`
  const titleB = `Synthetic retained draft ${run}`
  await pageA.getByLabel('Name', { exact: true }).fill(titleA)
  await pageB.getByLabel('Name', { exact: true }).fill(titleB)
  await save(pageA, 200)
  await save(pageB, 409)
  await pageB.getByText('There is a newer saved version', { exact: true }).waitFor()
  assert.equal(await pageB.getByLabel('Name', { exact: true }).inputValue(), titleB)
  assert(await pageB.getByRole('button', { name: 'Save changes', exact: true }).isDisabled())
  assert.equal((await content(a)).content.collections[0].records[0].title, titleA)
  pass('Stale editor receives 409; local edits survive and the winning revision remains unchanged')

  await pageB.getByRole('button', { name: 'Reload', exact: true }).click()
  const modal = pageB.getByRole('dialog', { name: 'Reload saved content?' })
  await modal.waitFor()
  await modal.getByRole('button', { name: 'Keep editing', exact: true }).click()
  assert.equal(await pageB.getByLabel('Name', { exact: true }).inputValue(), titleB)
  await pageB.getByRole('button', { name: 'Reload', exact: true }).click()
  await modal.getByRole('button', { name: 'Reload saved content', exact: true }).click()
  await pageB.getByText(`Saved revision ${lastWritten.revision}`, { exact: true }).waitFor()
  assert.equal(await pageB.getByLabel('Name', { exact: true }).inputValue(), titleA)
  assert.equal(await pageB.getByText('There is a newer saved version', { exact: true }).count(), 0)
  await pageB.getByLabel('Name', { exact: true }).fill(titleB)
  await save(pageB, 200)
  const reopened = await open(contexts.editorB)
  assert.equal(await reopened.getByLabel('Name', { exact: true }).inputValue(), titleB)
  pass('Cancel reload preserves edits; confirmed reload clears conflict and allows a fresh save that survives reopen')

  await query(`UPDATE page_studio_site_memberships SET role='viewer' WHERE site_id=$1 AND user_id=$2`, [siteId, users[1].id])
  await pageB.getByLabel('Name', { exact: true }).fill(`Synthetic denied edit ${run}`)
  await save(pageB, 403)
  assert.equal((await content(a)).revision, lastWritten.revision)
  await pageB.getByRole('button', { name: 'Reload', exact: true }).click()
  await modal.getByRole('button', { name: 'Reload saved content', exact: true }).click()
  await pageB.getByText('You have read-only access to this content.', { exact: true }).waitFor()
  assert(await pageB.getByLabel('Name', { exact: true }).isDisabled())
  pass('Membership downgrade rejects an already-open editor save and reload adopts read-only access')
} catch (error) {
  // Error objects can contain auth requests. Keep diagnostics local and sanitized.
  report.failure = { name: error.name, message: safeMessage(error) }
  process.exitCode = 1
} finally {
  await query('ROLLBACK').catch(() => {})
  try {
    if (baseline && a) {
      const current = await content(a)
      if (JSON.stringify(current.content.collections) !== JSON.stringify(baseline.content.collections)) {
        // Reconcile even when a write committed but its response was lost. Only
        // this run's exact title edits by its owned actors may be restored.
        const candidate = structuredClone(baseline.content)
        const title = current.content.collections[0]?.records[0]?.title
        assert([`Synthetic winner ${run}`, `Synthetic retained draft ${run}`, `Synthetic denied edit ${run}`].includes(title),
          'Do not overwrite unrelated content during cleanup')
        candidate.collections[0].records[0].title = title
        assert(users.some(user => user.id === current.actorId), 'Restore only a write attributed to this run')
        assert.deepEqual(current.content, candidate, 'Do not overwrite unrelated fields during cleanup')
        const restored = await a.request.put(api, { data: { expectedRevision: current.revision, collections: baseline.content.collections } })
        assert.equal(restored.status(), 200, 'Restore synthetic baseline using normal revisioned write')
      }
      const after = await content(a)
      assert.deepEqual(after.content.collections, baseline.content.collections)
      report.finalRevision = after.revision
      report.contentRestored = true
    }
    report.after = await snapshot()
    assert.deepEqual(report.after, before, 'Page checkpoints and versions must remain untouched')
    if (report.contentRestored) pass('Page draft/version pointers and history are unchanged; synthetic CMS baseline restored')
  } catch (error) {
    report.cleanupFailure = safeMessage(error)
    process.exitCode = 1
  }
  try {
    if (seeded) {
      const ids = users.map(user => user.id)
      await query('BEGIN')
      await query(`UPDATE client_users SET status='deactivated' WHERE id=ANY($1::uuid[])`, [ids])
      await query(`UPDATE client_sessions SET expires_at=NOW() WHERE client_user_id=ANY($1::uuid[])`, [ids])
      await query(`UPDATE client_magic_link_tokens SET expires_at=NOW() WHERE client_user_id=ANY($1::uuid[])`, [ids])
      await query(`DELETE FROM page_studio_site_memberships WHERE site_id=$1 AND user_id=ANY($2::uuid[])`, [siteId, ids])
      await query('COMMIT')
      const remaining = (await query(`SELECT
        (SELECT count(*)::int FROM client_sessions WHERE client_user_id=ANY($1::uuid[]) AND expires_at>NOW()) AS sessions,
        (SELECT count(*)::int FROM client_magic_link_tokens WHERE client_user_id=ANY($1::uuid[]) AND expires_at>NOW()) AS links,
        (SELECT count(*)::int FROM client_users WHERE id=ANY($1::uuid[]) AND status<>'deactivated') AS users,
        (SELECT count(*)::int FROM page_studio_site_memberships WHERE user_id=ANY($1::uuid[])) AS memberships`, [ids])).rows[0]
      assert.deepEqual(remaining, { sessions: 0, links: 0, users: 0, memberships: 0 })
      report.remainingAuthority = remaining
      report.retired = true
    }
  } catch (error) {
    await query('ROLLBACK').catch(() => {})
    report.retirementFailure = safeMessage(error)
    process.exitCode = 1
  } finally {
    await browser?.close().catch((error) => {
      report.browserCleanupFailure = safeMessage(error)
      process.exitCode = 1
    })
    await pool.end()
    report.finishedAt = new Date().toISOString()
    await writeFile(process.env.CMS_ACCEPTANCE_REPORT, JSON.stringify(report, null, 2) + '\n', { mode: 0o600 })
    console.log(JSON.stringify(report))
  }
}
