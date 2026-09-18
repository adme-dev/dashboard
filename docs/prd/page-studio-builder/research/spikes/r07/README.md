# R07 quota and cost experiment

Research only. No application endpoint, migration, Cloudflare operation, invoice,
customer plan, or production authorization is installed by these files.

## Run

Requires Node 24, PostgreSQL tools on PATH, and an installed Dashboard checkout
providing its existing `pg` dependency. The runner creates a fresh loopback-only
cluster and database `studio_builder_r07`, then stops it even if tests fail. It
never loads `.env`. Synthetic cluster files/logs remain under the printed temp
directory for inspection; there are no customer records or credentials.

```sh
R07_DASHBOARD_ROOT=/absolute/path/to/installed/dashboard \
  bash docs/prd/page-studio-builder/research/spikes/r07/run-local.sh
```

Use `R07_PORT` if the default 55457 is occupied. Never point the test directly at
a shared database: `install()` intentionally requires the disposable database
name and loopback server address and creates new tables without `IF NOT EXISTS`.
An existing schema causes failure rather than data reset.

## Scope

- `ledger.mjs`: real PostgreSQL transactions, account row locks and a globally
  unique provider receipt key. Integer USD micro-units are illustrative;
  fixtures use small synthetic amounts, not proposed allowances.
- `experiment.test.mjs`: budget/concurrency races, request and receipt replay,
  cancellation, downgrade/expiry, late settlement, retries and overrun handling;
  separate official-price arithmetic checks.
- `costs.mjs`: selected account-wide USD list-price estimates. Dynamic Worker
  input is **billable** worker-days after provider inclusion, not raw identities.

The JSON account row deliberately keeps this experiment small. It is not a
scalable ledger schema. Inputs represent a trusted broker; there is no actor
authentication, tenancy discovery, provider receipt authentication, or binding
of periods to a real billing calendar. The database is a concurrency experiment,
not a decision to move CMS content out of D1.

The experiment does not prove provider exactly-once execution, recovery after
a lost commit acknowledgement, restart of the PostgreSQL process, running-job
revocation, or that runtime CPU limits enforce an invoice ceiling. A second
Ledger object proves persisted database state only. Policy patch replay is not
idempotent; production needs an immutable policy-change event ID.

See [R07 report](../../R07-packages-costs.md) for the implementation contract,
source rates, limitations and product decisions.
