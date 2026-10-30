import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import { Ledger } from './ledger.mjs';
import { workers, platforms, dynamicIdentities, r2, d1 } from './costs.mjs';

const url = new URL(process.env.R07_DATABASE_TEST_URL);
assert.equal(url.hostname, '127.0.0.1');
assert.equal(url.pathname, '/studio_builder_r07');
const require = createRequire(resolve(process.env.R07_DASHBOARD_ROOT, 'package.json'));
const { Pool } = require('pg');
const pool = new Pool({ connectionString: url.href, max: 20 });
const ledger = new Ledger(pool);
before(() => ledger.install());
after(() => pool.end());
let sequence = 0;
async function fixture(policy = {}) {
  const account = `tenant/client/preview/${++sequence}`;
  await ledger.create(account, { limit: 100, slots: 20, enabled: true, expires: null, ...policy });
  return account;
}
const request = (id = 'attempt-1', amount = 40, period = '2026-09') => ({ id, amount, period, digest: `sha256-fixture-${id}` });
const receipt = (id = 'receipt-1', actual = 25) => ({ provider: 'synthetic-account', id, actual });
const rejected = async (promise, reason) => assert.rejects(promise, new RegExp(reason));

test('concurrent reservations cannot overspend a shared budget', async () => {
  const account = await fixture();
  const results = await Promise.allSettled(Array.from({ length: 20 }, (_, i) => ledger.reserve(account, request(`attempt-${i}`, 30))));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 3);
  assert.equal((await ledger.read(account)).periods['2026-09'].held, 90);
});
test('concurrency is shared across billing periods', async () => {
  const account = await fixture({ slots: 1 });
  await ledger.reserve(account, request());
  await rejected(ledger.reserve(account, request('next', 40, '2026-10')), 'concurrency');
});
test('concurrent duplicate admission creates one hold', async () => {
  const account = await fixture();
  await Promise.all(Array.from({ length: 12 }, () => ledger.reserve(account, request())));
  const state = await ledger.read(account);
  assert.equal(Object.keys(state.jobs).length, 1);
  assert.equal(state.periods['2026-09'].held, 40);
});
test('operation identity cannot be reused for a changed budget or digest', async () => {
  const account = await fixture();
  await ledger.reserve(account, request());
  await rejected(ledger.reserve(account, request('attempt-1', 41)), 'identity_conflict');
  await rejected(ledger.reserve(account, { ...request(), digest: 'changed' }), 'identity_conflict');
});
test('a second delivery cannot start an already running attempt', async () => {
  const account = await fixture();
  await ledger.reserve(account, request());
  await ledger.start(account, 'attempt-1');
  await rejected(ledger.start(account, 'attempt-1'), 'not_queued');
});
test('concurrent duplicate final receipts charge exactly once and release the remainder', async () => {
  const account = await fixture();
  await ledger.reserve(account, request());
  await ledger.start(account, 'attempt-1');
  await Promise.all(Array.from({ length: 12 }, () => ledger.settle(account, 'attempt-1', receipt('duplicate'))));
  assert.deepEqual((await ledger.read(account)).periods['2026-09'], { held: 0, spent: 25 });
});
test('receipt replay with changed usage rolls back without changing balances', async () => {
  const account = await fixture();
  await ledger.reserve(account, request());
  await ledger.start(account, 'attempt-1');
  await ledger.settle(account, 'attempt-1', receipt('conflict'));
  await rejected(ledger.settle(account, 'attempt-1', receipt('conflict', 26)), 'receipt_conflict');
  assert.equal((await ledger.read(account)).periods['2026-09'].spent, 25);
});
test('a provider receipt cannot be charged to two accounts', async () => {
  const a = await fixture(); const b = await fixture();
  for (const account of [a, b]) {
    await ledger.reserve(account, request());
    await ledger.start(account, 'attempt-1');
  }
  const results = await Promise.allSettled([a, b].map(account => ledger.settle(account, 'attempt-1', receipt('cross-account'))));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 1);
  const states = await Promise.all([a, b].map(account => ledger.read(account)));
  assert.equal(states.reduce((n, state) => n + state.periods['2026-09'].spent, 0), 25);
  assert.equal(states.reduce((n, state) => n + state.periods['2026-09'].held, 0), 40);
});
test('queued cancellation refunds only work that has not started', async () => {
  const account = await fixture({ slots: 1 });
  await ledger.reserve(account, request());
  await ledger.cancel(account, 'attempt-1');
  await ledger.cancel(account, 'attempt-1');
  await ledger.reserve(account, request('replacement', 100));
  assert.equal((await ledger.read(account)).periods['2026-09'].held, 100);
});
test('running cancellation retains money and the slot until trusted terminal settlement', async () => {
  const account = await fixture({ slots: 1 });
  await ledger.reserve(account, request());
  await ledger.start(account, 'attempt-1');
  await ledger.cancel(account, 'attempt-1');
  await rejected(ledger.reserve(account, request('retry')), 'concurrency');
  assert.equal((await ledger.read(account)).periods['2026-09'].held, 40);
  await ledger.settle(account, 'attempt-1', receipt('cancelled', 12));
  await ledger.reserve(account, request('retry'));
  assert.equal((await ledger.read(account)).periods['2026-09'].spent, 12);
});
test('settlement without execution is rejected', async () => {
  const account = await fixture();
  await ledger.reserve(account, request());
  await rejected(ledger.settle(account, 'attempt-1', receipt('never-started')), 'not_running');
});
test('downgrade revokes queued execution while retaining the reservation for cancellation', async () => {
  const account = await fixture();
  await ledger.reserve(account, request());
  await ledger.policy(account, { enabled: false });
  await rejected(ledger.start(account, 'attempt-1'), 'disabled');
  await rejected(ledger.reserve(account, request('new')), 'disabled');
  assert.equal((await ledger.read(account)).periods['2026-09'].held, 40);
  await ledger.cancel(account, 'attempt-1');
});
test('a policy revision change requires deliberate re-admission even after upgrade', async () => {
  const account = await fixture();
  await ledger.reserve(account, request());
  await ledger.policy(account, { limit: 200 });
  await rejected(ledger.start(account, 'attempt-1'), 'stale_policy');
});
test('lowering a cap below committed usage blocks new work', async () => {
  const account = await fixture();
  await ledger.reserve(account, request());
  await ledger.policy(account, { limit: 30 });
  await rejected(ledger.reserve(account, request('new', 1)), 'budget');
});
test('package expiry denies admission but accepts late usage for already running work', async () => {
  const account = await fixture();
  await ledger.reserve(account, request());
  await ledger.start(account, 'attempt-1');
  await ledger.policy(account, { expires: '2000-01-01T00:00:00Z' });
  await rejected(ledger.reserve(account, request('new')), 'expired');
  await ledger.settle(account, 'attempt-1', receipt('late', 30));
  assert.equal((await ledger.read(account)).periods['2026-09'].spent, 30);
});
test('actual provider overrun is retained and freezes further admission', async () => {
  const account = await fixture();
  await ledger.reserve(account, request());
  await ledger.start(account, 'attempt-1');
  await ledger.settle(account, 'attempt-1', receipt('overrun', 140));
  const state = await ledger.read(account);
  assert.equal(state.periods['2026-09'].spent, 140);
  assert.equal(state.frozen, true);
  await rejected(ledger.reserve(account, request('next', 1, '2026-10')), 'frozen');
});
test('late settlement belongs to its original period', async () => {
  const account = await fixture();
  await ledger.reserve(account, request());
  await ledger.start(account, 'attempt-1');
  await ledger.reserve(account, request('next', 40, '2026-10'));
  await ledger.settle(account, 'attempt-1', receipt('rollover', 20));
  assert.deepEqual((await ledger.read(account)).periods, { '2026-09': { held: 0, spent: 20 }, '2026-10': { held: 40, spent: 0 } });
});
test('a new model attempt consumes another reservation after failed work was billed', async () => {
  const account = await fixture();
  await ledger.reserve(account, request());
  await ledger.start(account, 'attempt-1');
  await ledger.settle(account, 'attempt-1', receipt('failed-generation', 40));
  await ledger.reserve(account, request('attempt-2', 60));
  await rejected(ledger.reserve(account, request('attempt-3', 1)), 'budget');
});
test('independent account budgets and persisted state survive a new ledger instance', async () => {
  const a = await fixture(); const b = await fixture();
  await ledger.reserve(a, request('same', 100));
  await new Ledger(pool).reserve(b, request('same', 100));
  assert.equal((await new Ledger(pool).read(a)).periods['2026-09'].held, 100);
});
test('invalid and fractional monetary units never create holds', async () => {
  const account = await fixture();
  for (const amount of [-1, 0, 1.5, Number.MAX_SAFE_INTEGER, NaN]) {
    await rejected(ledger.reserve(account, request('invalid', amount)), 'amount');
  }
  assert.deepEqual((await ledger.read(account)).periods, {});
});
test('parallel admission enforces slots independently of monetary headroom', async () => {
  const account = await fixture({ slots: 2, limit: 1000 });
  const results = await Promise.allSettled(Array.from({ length: 12 }, (_, i) => ledger.reserve(account, request(`slot-${i}`, 1, i % 2 ? '2026-09' : '2026-10'))));
  assert.equal(results.filter(r => r.status === 'fulfilled').length, 2);
});
test('start racing with cancellation either never starts or retains the full hold', async () => {
  const account = await fixture();
  await ledger.reserve(account, request());
  await Promise.allSettled([ledger.start(account, 'attempt-1'), ledger.cancel(account, 'attempt-1')]);
  const state = await ledger.read(account);
  const status = state.jobs['attempt-1'].status;
  assert.ok(['cancelled', 'cancel_requested'].includes(status));
  assert.equal(state.periods['2026-09'].held, status === 'cancelled' ? 0 : 40);
});
test('queued work observes a committed downgrade after waiting for the account lock', async () => {
  const account = await fixture();
  await ledger.reserve(account, request());
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM r07_accounts WHERE id = $1 FOR UPDATE', [account]);
    const denied = rejected(ledger.start(account, 'attempt-1'), 'disabled');
    await client.query("UPDATE r07_accounts SET state = jsonb_set(state, '{policy,enabled}', 'false') WHERE id = $1", [account]);
    await client.query('COMMIT');
    await denied;
    assert.equal((await ledger.read(account)).jobs['attempt-1'].status, 'queued');
  } finally { await client.query('ROLLBACK'); client.release(); }
});
test('replaying cancelled admission cannot authorize another execution', async () => {
  const account = await fixture();
  await ledger.reserve(account, request());
  await ledger.cancel(account, 'attempt-1');
  assert.equal((await ledger.reserve(account, request())).status, 'cancelled');
  await rejected(ledger.start(account, 'attempt-1'), 'not_queued');
});
test('invalid policy changes roll back the existing version', async () => {
  const account = await fixture();
  await rejected(ledger.policy(account, { limit: -1 }), 'amount');
  assert.equal((await ledger.read(account)).policy.revision, 1);
});
test('cost model reproduces the official WFP 100M-request example', () => {
  assert.equal(platforms({ requests: 100e6, cpuMs: 1e9, scripts: 1200 }), 71.8);
});
test('Workers shared included usage is subtracted once', () => {
  assert.equal(workers({ requests: 20e6, cpuMs: 40e6 }), 8.2);
  assert.equal(workers({ requests: 0, cpuMs: 0 }), 5);
});
test('Dynamic Worker costs use billable worker-days after provider inclusion', () => {
  assert.equal(dynamicIdentities(2000), 4);
  assert.equal(dynamicIdentities(0), 0);
});
test('R2 rounds chargeable storage and operations up to billing units', () => {
  assert.equal(r2({ gbMonths: 10, classA: 1e6, classB: 10e6 }), 0);
  assert.equal(r2({ gbMonths: 10.1, classA: 1e6 + 1, classB: 10e6 + 1 }), 4.875);
});
test('D1 uses row counts and storage above the account inclusion', () => {
  assert.equal(d1({ reads: 26e9, writes: 60e6, gbMonths: 10 }), 14.75);
});
