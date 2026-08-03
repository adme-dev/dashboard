# AI assistant company rollout readiness

Use the readiness gate before enrolling a company-wide AI assistant pilot or enforcing governed assistant coverage.

```bash
pnpm readiness:ai-assistants -- --gate pilot --json
pnpm readiness:ai-assistants -- --gate enforced --json
```

The command exits `0` only when the selected gate passes. It exits `1` when the gate is blocked and prints stable blocker codes. `--json` emits the same bounded readiness contract used by `GET /api/admin/ai/governance/rollout`.

## Gate requirements

- Pilot: at least one evaluated pack release in `pilot` state and at least one active, unrevoked pilot member assigned to that release.
- Enforcement: every active employee belongs to an organizational department with an evaluated active pack release. Every active organizational department also requires a ready owner and an active evaluated release.

The response contains only employee IDs, display names, roles, department summaries, and deterministic blocker codes. It deliberately excludes email addresses, assistant prompts, memories, messages, tokens, credentials, and client or vendor data. The admin endpoint requires `ADMIN` permission and sends `Cache-Control: private, no-store`.

## Common blocker codes

- `employee:<uuid>:no_department` — add the active employee to an organizational department.
- `employee:<uuid>:no_mapped_pack` — create and map a governed capability pack for one of the employee's organizational departments.
- `employee:<uuid>:no_evaluated_release` — complete and pass evaluation for a mapped release.
- `department:<uuid>:owner_not_ready` — assign an active department manager who is an explicit member of that department.
- `department:<uuid>:no_mapped_pack`, `release_draft`, `evaluation_gate_failed`, `release_suspended`, or `release_retired` — correct the governed pack release state or its exact evaluation evidence.
- `no_evaluated_pilot_release` or `no_eligible_pilot_membership` — create a passed pilot release and enroll an active, unrevoked member.

If a query returns more than the supported 100 departments, employees, releases, or pilot memberships, the gate fails closed with an `*_unbounded` code. Reduce or paginate the organization before relying on this initial completion gate.
