# Neon Lakebase CRM Search Pilot

This is a local, operator-run CRM-search evaluation. It is intentionally
fail-closed and requires a separate non-production Neon project and database.
Do not use a production Neon project, endpoint, or database for this pilot.

## Scope and safety boundary

Create a gitignored `.env.lakebase-pilot` file locally with the values named in
`.env.example`. Do not add the file to git, Cloudflare, Nuxt, Wrangler, or any
other deployed configuration. `LAKEBASE_PILOT_MODE` must remain `off`; the pilot
does not enable application hybrid search.

Every pilot command resolves the same target before it acts. It refuses a target
for a production project or production database before any pilot operation,
including when the pilot and production project IDs are equal
(`production_project_targeted`), when the pilot database matches the configured
production database or endpoint (`production_database_targeted`), when the
database host and endpoint disagree, or when a mutation lacks
`LAKEBASE_PILOT_CONFIRM_NON_PRODUCTION_PROJECT=1`.
Treat any blocked result as a stop condition: correct the isolated pilot
configuration and rerun preflight. Do not work around a refusal.

Cloudflare Vectorize, production migrations, Cloudflare deployments, and
production application search configuration are untouched by this pilot.

## Required operator sequence

Load the local operator file and execute the following sequence in order. Do not
skip either preflight. The enable command may request a Neon endpoint restart;
after it returns, obtain and record the Neon wake/restart confirmation before
the second preflight.

```bash
set -a
source .env.lakebase-pilot
set +a
pnpm pilot:lakebase:preflight
pnpm pilot:lakebase:enable
# Record the Neon wake/restart confirmation here.
pnpm pilot:lakebase:preflight
pnpm pilot:lakebase:setup
pnpm pilot:lakebase:evaluate -- --runs 20
```

The required command order is preflight, enable, wake/restart confirmation,
preflight, setup, then evaluate. Stop on any non-zero exit status. The setup
and teardown commands are mutation-protected and must only operate on the
separate non-production pilot project and database.

### Cold-start-labelled evidence

To label a scale-to-zero measurement, wait at least five minutes with no pilot
connections. This is an operator idle assertion;
it is not a command to suspend, restart, wake, or otherwise control compute.
Then run:

```bash
pnpm pilot:lakebase:evaluate -- --runs 20 --cold-start
```

`--cold-start` records the operator assertion only. It does not suspend or
restart compute.

## Evaluation decision

Retain the generated redacted JSON and Markdown evidence before any teardown.
The BM25 gate blocks for cross-client leakage, soft-delete leakage, query
failures, or a Precision@5 regression. It passes only when either:

- MRR improvement is `>= 0.10` and Precision@5 is not worse; or
- p95 improvement is `>= 0.30` and Precision@5 and MRR do not regress.

A pass means review eligibility only (`eligible_for_hybrid_review`), never
automatic hybrid activation or a production change.

## Recovery evidence

If Task 7 stops fail-closed with unresolved publication-recovery directories or
locks (for example `.evaluation.publish-recovery.*` or `.evaluation.lock`),
inspect and preserve evidence, then report the condition. Do not delete broadly:
keep output directories, recovery directories, and locks intact rather than
forcing another evaluation.

## Teardown

Teardown is allowed only after evidence retention and exact target
re-verification: reload the same `.env.lakebase-pilot`, confirm the pilot
project ID, endpoint ID, database host, and distinct production project ID, then
run a final successful `pnpm pilot:lakebase:preflight`. Only then run:

```bash
pnpm pilot:lakebase:teardown
```

Teardown removes only the `lakebase_pilot` schema. It never removes the Neon
project, endpoint, or database. Preserve the retained evidence after teardown.
