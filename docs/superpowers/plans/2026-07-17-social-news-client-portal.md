# Plan: Social News Publishing → Client Portal

## Objective

Expose MCP news-based social drafts to the correct client in the existing portal approval workflow without bypassing account scoping, package limits, internal approval policy, or publish controls.

## Tasks

### Phase 1 — Portal-safe content projection

- [x] Add a portal read endpoint for news-backed social posts, scoped by authenticated `clientId` and portal permissions.
- [x] Return source title/URL, immutable attribution, platform variants, target accounts, schedule, package usage, and approval state.
- [x] Add contract tests proving cross-client posts and agency-only metadata are never exposed.

### Phase 2 — Client approval actions

- [x] Add portal approve, reject, and revision-request actions for news-backed drafts.
- [x] Reuse the existing approval/audit spine; portal approval must never publish directly.
- [x] Record `approved`, `rejected`, and revision feedback in news feedback provenance.
- [x] Enforce package, account, and approval gates server-side on every action.

### Phase 3 — Portal UI

- [x] Add a News & Social Content section to the portal approvals view.
- [x] Show per-platform previews, source attribution, AI-rewrite indicator, target accounts, schedule, and package/SLA status.
- [x] Provide approve, request changes, and reject actions with confirmation and visible audit status.

### Phase 4 — End-to-end verification

- [x] Run unit and route-isolation tests.
- [ ] Verify an agency-created MCP news draft appears only in the matching client portal.
- [ ] Verify portal approve/revision/reject state transitions in agency Approvals and feedback reporting.
- [x] Verify no action publishes without the existing internal approval and dispatch gates.
- [ ] Run the full social suite, typecheck/build gates, production deployment, and authenticated browser UAT.

## Definition of done

- A client can review the news-derived draft in their portal and request changes or approve it.
- No client can see another client’s news, posts, accounts, packages, evidence, or budgets.
- Portal actions remain approval-safe and auditable.
- Production UAT and release evidence are recorded in the handoff.
