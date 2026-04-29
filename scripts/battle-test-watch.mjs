#!/usr/bin/env node
/**
 * Battle test for the Watch / Notification system.
 *
 * Runs end-to-end against the .env DATABASE_URL and RESEND_API_KEY:
 *   1. Sanity-check the schema (all Phase A→E2 columns/tables)
 *   2. Insert a notification with reason + importance_score + metadata
 *   3. Read it back and verify the shape
 *   4. Call Resend directly to send a real assignment email to Paul
 *   5. Insert a board_subscription with snooze + verify the snooze filter
 *      excludes it from getSubscribers (replicating the SQL)
 *   6. Insert a keyword_subscription, simulate a matching notification
 *   7. Clean up the test rows
 *
 * Usage:  node --env-file=.env scripts/battle-test-watch.mjs
 */

import { Pool } from '@neondatabase/serverless'
import { Resend } from 'resend'

const DB = process.env.DATABASE_URL
if (!DB) { console.error('Missing DATABASE_URL'); process.exit(1) }
const RESEND_KEY = process.env.RESEND_API_KEY
if (!RESEND_KEY) { console.warn('[warn] RESEND_API_KEY missing — email step will be skipped') }

const PAUL_ID = '6a5d2e15-315c-4790-b64e-5e3e17001c8e'
const CLARA_ID = 'e6f47bf3-591c-4f70-874c-a98a42f006e3'
const TASK_ID = '8e8dd0f1-1290-456c-9d06-1ab1275a3fb9'
const BOARD_ID = '6ad66282-bf44-4662-9e90-dfa07c87e7fe'

const pool = new Pool({ connectionString: DB })

// ── helpers ────────────────────────────────────────────────────────
let pass = 0, fail = 0
function check(label, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${label}`) }
  else { fail++; console.log(`  ❌ ${label}${detail ? ' — ' + detail : ''}`) }
}

const insertedNotificationIds = []
const insertedSubIds = []
const insertedKeywordIds = []

// ── 1. Schema sanity ───────────────────────────────────────────────
async function schemaSanity() {
  console.log('\n── 1. Schema sanity ──')
  const cols = await pool.query(`
    SELECT table_name, column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND (
      (table_name = 'notifications' AND column_name IN ('reason','importance_score'))
      OR (table_name = 'board_subscriptions' AND column_name = 'snooze_until')
      OR (table_name = 'team_members' AND column_name IN ('auto_subscribe_on_participation','auto_ack_assignments','quiet_hours'))
    )
  `)
  const set = new Set(cols.rows.map(r => `${r.table_name}.${r.column_name}`))
  check('notifications.reason', set.has('notifications.reason'))
  check('notifications.importance_score', set.has('notifications.importance_score'))
  check('board_subscriptions.snooze_until', set.has('board_subscriptions.snooze_until'))
  check('team_members.auto_subscribe_on_participation', set.has('team_members.auto_subscribe_on_participation'))
  check('team_members.auto_ack_assignments', set.has('team_members.auto_ack_assignments'))
  check('team_members.quiet_hours', set.has('team_members.quiet_hours'))

  const tables = await pool.query(`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('board_visits','keyword_subscriptions','board_subscriptions')
  `)
  const tset = new Set(tables.rows.map(r => r.tablename))
  check('board_subscriptions table', tset.has('board_subscriptions'))
  check('board_visits table', tset.has('board_visits'))
  check('keyword_subscriptions table', tset.has('keyword_subscriptions'))
}

// ── 2. Notification round-trip ─────────────────────────────────────
async function notificationRoundTrip() {
  console.log('\n── 2. Notification INSERT with reason+importance ──')
  const r = await pool.query(`
    INSERT INTO notifications (user_id, type, title, message, link, actor_id, metadata, reason, importance_score)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    RETURNING id, reason, importance_score, metadata
  `, [
    PAUL_ID,
    'task_assigned',
    'Battle test — assignment',
    'Clara assigned you to "Smoke test"',
    `/agency/tasks/${TASK_ID}`,
    CLARA_ID,
    JSON.stringify({ taskId: TASK_ID, taskTitle: 'Battle test', source: 'battle-test-watch' }),
    'assigned',
    0.80,
  ])
  const row = r.rows[0]
  insertedNotificationIds.push(row.id)
  check('notification inserted', !!row.id)
  check('reason persisted', row.reason === 'assigned')
  check('importance_score persisted', row.importance_score === 0.8)
  check('metadata JSON intact', row.metadata?.taskId === TASK_ID)

  // Sort-by-importance query — the same the API runs.
  const sorted = await pool.query(`
    SELECT id, importance_score
    FROM notifications WHERE user_id = $1
    ORDER BY COALESCE(importance_score, 0.4) DESC, created_at DESC
    LIMIT 5
  `, [PAUL_ID])
  check('sort-by-importance returns rows', sorted.rows.length > 0)
  const ourRow = sorted.rows.find(r => insertedNotificationIds.includes(r.id))
  check('our 0.8 row appears in top-5', !!ourRow)
}

// ── 3. Subscription with snooze ────────────────────────────────────
async function subscriptionSnooze() {
  console.log('\n── 3. Snoozed subscription excluded by getSubscribers SQL ──')
  // Insert a board-level sub for Paul that is snoozed for 1h
  const futureSnooze = new Date(Date.now() + 60 * 60_000)
  const sub = await pool.query(`
    INSERT INTO board_subscriptions (user_id, board_id, item_id, column_id, events, notify_inapp, notify_email, is_muted, snooze_until)
    VALUES ($1, $2, NULL, NULL, '{}', true, false, false, $3)
    ON CONFLICT (user_id, board_id, COALESCE(item_id, '00000000-0000-0000-0000-000000000000'::uuid), COALESCE(column_id, '00000000-0000-0000-0000-000000000000'::uuid))
    DO UPDATE SET snooze_until = EXCLUDED.snooze_until, updated_at = NOW()
    RETURNING id, snooze_until
  `, [PAUL_ID, BOARD_ID, futureSnooze])
  insertedSubIds.push(sub.rows[0].id)
  check('snooze persisted to row', !!sub.rows[0].snooze_until)

  // The exact filter from getSubscribers — board-level scope only
  // (item_id IS NULL AND column_id IS NULL) so item-level subs from
  // auto-subscribe don't pollute the result.
  const matched = await pool.query(`
    SELECT bs.user_id, bs.snooze_until
    FROM board_subscriptions bs
    WHERE bs.board_id = $1
      AND bs.is_muted = false
      AND (bs.snooze_until IS NULL OR bs.snooze_until <= NOW())
      AND bs.item_id IS NULL AND bs.column_id IS NULL
      AND bs.user_id = $2
  `, [BOARD_ID, PAUL_ID])
  check('snoozed board-level sub excluded from dispatch query', matched.rows.length === 0)

  // Reverse: clear the snooze and verify it now matches
  await pool.query(`UPDATE board_subscriptions SET snooze_until = NULL WHERE id = $1`, [sub.rows[0].id])
  const matched2 = await pool.query(`
    SELECT bs.user_id
    FROM board_subscriptions bs
    WHERE bs.board_id = $1 AND bs.is_muted = false
      AND (bs.snooze_until IS NULL OR bs.snooze_until <= NOW())
      AND bs.item_id IS NULL AND bs.column_id IS NULL
      AND bs.user_id = $2
  `, [BOARD_ID, PAUL_ID])
  check('cleared snooze restores dispatch eligibility', matched2.rows.length === 1)
}

// ── 4. Keyword subscription ────────────────────────────────────────
async function keywordRoundTrip() {
  console.log('\n── 4. Keyword subscription ILIKE match ──')
  const kw = await pool.query(`
    INSERT INTO keyword_subscriptions (user_id, keyword)
    VALUES ($1, $2)
    ON CONFLICT (user_id, LOWER(keyword)) DO UPDATE SET keyword = EXCLUDED.keyword
    RETURNING id, keyword
  `, [PAUL_ID, 'battle-test-keyword'])
  insertedKeywordIds.push(kw.rows[0].id)
  check('keyword inserted', !!kw.rows[0].id)

  // Simulate findKeywordMatches — text contains the keyword
  const haystack = 'This message mentions battle-test-keyword in the body'
  const matches = await pool.query(`SELECT user_id, keyword FROM keyword_subscriptions WHERE user_id = $1`, [PAUL_ID])
  const matched = matches.rows.find(r => haystack.toLowerCase().includes(r.keyword.toLowerCase()))
  check('ILIKE-style match finds the keyword', !!matched)
}

// ── 5. Real email via Resend ───────────────────────────────────────
async function realEmail() {
  console.log('\n── 5. Real email to paul@adme.net.au via Resend ──')
  if (!RESEND_KEY) {
    check('SKIPPED — no RESEND_API_KEY', false, 'set RESEND_API_KEY to enable')
    return
  }
  const resend = new Resend(RESEND_KEY)
  const fromEmail = process.env.EMAIL_FROM || 'noreply@adme.net.au'
  const appName = process.env.APP_NAME || 'XeroFlow Agency'
  const appUrl = process.env.APP_URL || 'https://app.xeroflow.com.au'
  const taskUrl = `${appUrl}/agency/tasks/${TASK_ID}`
  // Inlined renderEmailTemplate output to mirror the new shared template
  // exactly, so this script reproduces what the live notification path sends.
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
  <meta name="color-scheme" content="light only">
  <meta name="supported-color-schemes" content="light only">
</head>
<body style="margin:0;padding:0;background-color:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,'Helvetica Neue',Arial,sans-serif;color:#111111;">
  <div style="max-width:560px;margin:0 auto;padding:48px 24px;">
    <div style="text-align:center;margin-bottom:48px;">
      <div style="display:inline-block;width:40px;height:40px;background:#111111;border-radius:10px;line-height:40px;text-align:center;">
        <span style="color:#ffffff;font-size:14px;font-weight:700;letter-spacing:-0.02em;">XF</span>
      </div>
    </div>
    <div style="background:#ffffff;border:1px solid #e0e0e0;border-radius:20px;padding:48px 40px;text-align:center;">
      <h1 style="margin:0 0 12px;color:#111111;font-size:28px;font-weight:500;letter-spacing:-0.03em;line-height:1.25;">
        You've been assigned a task
      </h1>
      <div style="margin:0 0 32px;color:#666666;font-size:16px;line-height:1.6;text-align:left;">
        <p style="margin:0 0 16px;color:#333333;font-size:15px;line-height:1.5;">Hi Paul,</p>
        <p style="margin:0 0 16px;"><strong>Clara Padalini</strong> assigned you to:</p>
        <p style="margin:0 0 8px;font-size:18px;font-weight:600;color:#111111;letter-spacing:-0.01em;">Smoke test — page loads, no console errors</p>
        <p style="margin:16px 0 0;font-size:14px;color:#999999;">This is a battle-test email confirming the Watch / Notifications email path is healthy after Phase A → E2.</p>
      </div>
      <div style="margin:0 0 28px;">
        <a href="${taskUrl}" style="display:inline-block;background-color:#111111;color:#ffffff !important;padding:14px 36px;text-decoration:none;border-radius:100px;font-size:16px;font-weight:600;letter-spacing:-0.01em;border:2px solid #111111;">
          View task
        </a>
      </div>
      <div style="height:1px;background:#e0e0e0;margin:0 0 24px;"></div>
      <p style="margin:0;color:#999999;font-size:13px;line-height:1.6;">
        Or copy this link into your browser:<br>
        <a href="${taskUrl}" style="color:#666666;text-decoration:underline;word-break:break-all;">${taskUrl}</a>
      </p>
    </div>
    <div style="text-align:center;margin-top:32px;">
      <p style="margin:0 0 4px;color:#999999;font-size:12px;">You received this because you have an account at ${appName} (paul@adme.net.au).</p>
      <p style="margin:0;color:#bbbbbb;font-size:12px;">
        <a href="${appUrl}/settings/notifications" style="color:#bbbbbb;text-decoration:underline;">Manage notification preferences</a>
        · Generated by battle-test-watch.mjs at ${new Date().toISOString()}
      </p>
    </div>
  </div>
</body>
</html>`
  try {
    const result = await resend.emails.send({
      from: fromEmail,
      to: 'paul@adme.net.au',
      subject: '🧪 Battle test — task assignment notification',
      html,
    })
    check('Resend.emails.send returned', !!result.data?.id, result.error?.message || JSON.stringify(result.error || {}))
    if (result.data?.id) console.log(`     Resend message ID: ${result.data.id}`)
  } catch (err) {
    check('Resend.emails.send', false, String(err?.message || err))
  }
}

// ── cleanup ─────────────────────────────────────────────────────────
async function cleanup() {
  console.log('\n── 6. Cleanup ──')
  if (insertedNotificationIds.length) {
    await pool.query(`DELETE FROM notifications WHERE id = ANY($1::uuid[])`, [insertedNotificationIds])
    console.log(`  🧹 deleted ${insertedNotificationIds.length} notification(s)`)
  }
  if (insertedSubIds.length) {
    await pool.query(`DELETE FROM board_subscriptions WHERE id = ANY($1::uuid[])`, [insertedSubIds])
    console.log(`  🧹 deleted ${insertedSubIds.length} subscription(s)`)
  }
  if (insertedKeywordIds.length) {
    await pool.query(`DELETE FROM keyword_subscriptions WHERE id = ANY($1::uuid[])`, [insertedKeywordIds])
    console.log(`  🧹 deleted ${insertedKeywordIds.length} keyword(s)`)
  }
}

// ── runner ─────────────────────────────────────────────────────────
async function main() {
  console.log('🧪 Watch system battle test')
  try {
    await schemaSanity()
    await notificationRoundTrip()
    await subscriptionSnooze()
    await keywordRoundTrip()
    await realEmail()
  } catch (err) {
    console.error('\n💥 Unhandled:', err)
    fail++
  } finally {
    await cleanup()
    await pool.end()
  }
  console.log(`\n── Result ──\n  Passed: ${pass}\n  Failed: ${fail}`)
  process.exit(fail > 0 ? 1 : 0)
}

main()
