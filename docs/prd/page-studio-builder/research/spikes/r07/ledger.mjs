// Research-only state machine. Trusted synthetic inputs; no API or provider adapter.
// One locked JSON row makes races observable without proposing a production schema.
function check(condition, reason) { if (!condition) throw new Error(reason); }
function money(value, minimum = 0) {
  check(Number.isSafeInteger(value) && value >= minimum && value <= 1e12, 'invalid_amount');
}
function validatePolicy(policy) {
  money(policy.limit);
  check(Number.isSafeInteger(policy.slots) && policy.slots >= 0 && policy.slots <= 100, 'invalid_slots');
  check(typeof policy.enabled === 'boolean', 'invalid_enabled');
  check(policy.expires === null || Number.isFinite(Date.parse(policy.expires)), 'invalid_expiry');
}
function authorize(state, now) {
  check(!state.frozen, 'frozen');
  check(state.policy.enabled, 'disabled');
  check(state.policy.expires === null || Date.parse(state.policy.expires) > now, 'expired');
}
const active = job => ['queued', 'running', 'cancel_requested'].includes(job.status);

export class Ledger {
  constructor(pool) { this.pool = pool; }
  async install() {
    const { rows: [db] } = await this.pool.query('SELECT current_database() AS name, inet_server_addr()::text AS host');
    check(db.name === 'studio_builder_r07' && db.host === '127.0.0.1/32', 'disposable_database_required');
    await this.pool.query(`
      CREATE TABLE r07_accounts (id text PRIMARY KEY, state jsonb NOT NULL);
      CREATE TABLE r07_receipts (provider text NOT NULL, id text NOT NULL, facts jsonb NOT NULL, PRIMARY KEY(provider, id));
    `);
  }
  async create(account, policy) {
    validatePolicy(policy);
    const state = { policy: { ...policy, revision: 1 }, frozen: false, periods: {}, jobs: {} };
    await this.pool.query('INSERT INTO r07_accounts VALUES ($1, $2)', [account, state]);
  }
  async read(account) {
    const { rows: [row] } = await this.pool.query('SELECT state FROM r07_accounts WHERE id = $1', [account]);
    check(row, 'account_missing');
    return row.state;
  }
  async transaction(account, operation) {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const { rows: [row] } = await client.query('SELECT state FROM r07_accounts WHERE id = $1 FOR UPDATE', [account]);
      check(row, 'account_missing');
      const { rows: [clock] } = await client.query('SELECT clock_timestamp() AS now');
      const result = await operation(row.state, client, clock.now.getTime());
      await client.query('UPDATE r07_accounts SET state = $2 WHERE id = $1', [account, row.state]);
      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally { client.release(); }
  }
  async policy(account, patch) {
    return this.transaction(account, state => {
      const next = { ...state.policy, ...patch, revision: state.policy.revision + 1 };
      validatePolicy(next);
      state.policy = next;
    });
  }
  async reserve(account, input) {
    money(input.amount, 1);
    check(/^[a-zA-Z0-9-]{1,100}$/.test(input.id), 'invalid_id');
    check(/^\d{4}-(0[1-9]|1[0-2])$/.test(input.period), 'invalid_period');
    check(typeof input.digest === 'string' && input.digest.length > 0 && input.digest.length <= 200, 'invalid_digest');
    const request = { id: input.id, amount: input.amount, period: input.period, digest: input.digest };
    return this.transaction(account, (state, _client, now) => {
      // A duplicate is only a receipt lookup. Neither admission nor start authority.
      const existing = state.jobs[request.id];
      if (existing) {
        check(Object.keys(request).every(key => existing.request[key] === request[key]), 'identity_conflict');
        return existing;
      }
      authorize(state, now);
      check(Object.values(state.jobs).filter(active).length < state.policy.slots, 'concurrency');
      const budget = state.periods[request.period] ?? { held: 0, spent: 0 };
      check(budget.spent + budget.held + request.amount <= state.policy.limit, 'budget');
      budget.held += request.amount;
      state.periods[request.period] = budget;
      const job = { request, revision: state.policy.revision, status: 'queued' };
      state.jobs[request.id] = job;
      return job;
    });
  }
  async start(account, id) {
    return this.transaction(account, (state, _client, now) => {
      authorize(state, now);
      const job = state.jobs[id];
      check(job?.status === 'queued', 'not_queued');
      check(job.revision === state.policy.revision, 'stale_policy');
      job.status = 'running';
      return job;
    });
  }
  async cancel(account, id) {
    return this.transaction(account, state => {
      const job = state.jobs[id];
      check(job, 'job_missing');
      if (job.status === 'queued') {
        state.periods[job.request.period].held -= job.request.amount;
        job.status = 'cancelled';
      } else if (job.status === 'running') job.status = 'cancel_requested';
      return job;
    });
  }
  async settle(account, id, receipt) {
    money(receipt.actual);
    check(typeof receipt.provider === 'string' && receipt.provider.length > 0 && receipt.provider.length <= 100, 'invalid_provider');
    check(typeof receipt.id === 'string' && receipt.id.length > 0 && receipt.id.length <= 200, 'invalid_receipt');
    const facts = { account, job: id, actual: receipt.actual };
    return this.transaction(account, async (state, client) => {
      // Accounting must still work after access expires. Caller must be trusted.
      const job = state.jobs[id];
      check(job, 'job_missing');
      const { rows: [existing] } = await client.query('SELECT facts FROM r07_receipts WHERE provider = $1 AND id = $2', [receipt.provider, receipt.id]);
      if (existing) {
        check(existing.facts.account === account && existing.facts.job === id && existing.facts.actual === receipt.actual, 'receipt_conflict');
        return job;
      }
      check(['running', 'cancel_requested'].includes(job.status), 'not_running');
      const inserted = await client.query('INSERT INTO r07_receipts VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [receipt.provider, receipt.id, facts]);
      check(inserted.rowCount === 1, 'receipt_conflict');
      const budget = state.periods[job.request.period];
      check(Number.isSafeInteger(budget.spent + receipt.actual), 'amount_overflow');
      budget.held -= job.request.amount;
      budget.spent += receipt.actual;
      if (receipt.actual > job.request.amount) state.frozen = true;
      job.status = 'settled';
      job.receipt = { provider: receipt.provider, id: receipt.id };
      return job;
    });
  }
}
