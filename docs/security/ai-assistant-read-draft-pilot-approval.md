# AI assistant read/draft pilot — independent security and privacy approval

Status: **UNSIGNED TEMPLATE — NOT APPROVED**

This document is an approval checklist and signature template. Its existence is not approval. It must not be self-signed by the implementer, operator, or an AI agent. Keep signatures and participant identities in the controlled approval system; link the approved record here rather than committing personal signatures to source control.

## Change record

| Field | Required value |
|---|---|
| Approval-system record URL / ID | `[external record required]` |
| Preview environment | `[required]` |
| Deployment SHA | `[required]` |
| Evidence window (`from` / `to`, maximum 31 days) | `[required]` |
| Environment operator | `[required]` |
| Rollback owner and contact path | `[required]` |
| Independent security/privacy approver | `[external approver required]` |
| Decision | `[APPROVED / APPROVED WITH CONDITIONS / REJECTED]` |
| Decision date and expiry/review date | `[required]` |

## Exact release scope

Record each release separately. Attach exact-version evaluation and UAT evidence; do not paste prompts, responses, traces, client data, credentials, or employee-level activity.

| Cohort | Pack key | Release ID | Pack version ID | Evaluation run ID | Gate passed | UAT evidence ID |
|---|---|---|---|---|---|---|
| Account management & production | `account_management_read_draft` | `[required]` | `[required]` | `[required]` | `[yes/no]` | `[required]` |
| Account management & production | `production_read_draft` | `[required]` | `[required]` | `[required]` | `[yes/no]` | `[required]` |
| Paid media | `paid_media_read_draft` | `[required]` | `[required]` | `[required]` | `[yes/no]` | `[required]` |
| Finance & bookkeeping | `finance_read_draft` | `[required]` | `[required]` | `[required]` | `[yes/no]` | `[required]` |
| Finance & bookkeeping | `bookkeeping_read_draft` | `[required]` | `[required]` | `[required]` | `[yes/no]` | `[required]` |

## Feature flags and rollback posture

The approver verifies deployed values from the target environment, not from a local `.env` file.

| Control | Required pilot value | Verified value / evidence |
|---|---|---|
| `AI_GOVERNED_CATALOG_MODE` | `pilot` | `[required]` |
| `AI_OBSERVE_ENABLED` | `false` | `[required]` |
| `AI_OBSERVE_PROACTIVE_ENABLED` | `false` | `[required]` |
| `PLATFORM_AGENT_THINK_TURNS_ENABLED` | `false` | `[required]` |
| Memory distillation | off | `[flag and evidence required]` |
| Portal writes | off | `[flag and evidence required]` |
| MCP and financial writes | off | `[flags and evidence required]` |
| Social/email/budget/action-specific writes | off | `[inventory and evidence required]` |

- [ ] Rollback owner can suspend releases and revoke memberships without a code deploy.
- [ ] Restoring catalog mode to `legacy` has an approved guarded preview deployment path.
- [ ] Revocation was tested and access disappeared immediately.
- [ ] Incident and privacy escalation paths are linked: `[required]`.

## Data and privacy review

### Data classes

- [ ] Account/production and paid-media sources are classified, scoped, and approved: `[evidence]`.
- [ ] Finance/bookkeeping confidential or restricted sources are explicitly approved: `[evidence]`.
- [ ] Client/tenant isolation is enforced from authenticated server scope and negative-tested: `[evidence]`.
- [ ] The packs provide read/draft assistance only and cannot perform a live mutation: `[evidence]`.

### Telemetry and retention

- [ ] Metrics response and stored evidence are prompt-free and response-free.
- [ ] Metrics exclude memories, email/contact data, names, user IDs, per-person activity, rankings, individual performance scores, raw traces/tokens, and credentials.
- [ ] Invocation metadata records only bounded operational fields needed for release evidence.
- [ ] Feedback is counted only when deterministically linked to an invocation, conversation, and release; unlinked feedback is not inferred.
- [ ] Retention period and deletion owner are documented: `[period / policy / owner required]`.
- [ ] Access to raw operational tables is limited and audited: `[evidence required]`.
- [ ] API responses are ADMIN-only and `Cache-Control: private, no-store`: `[evidence required]`.

### Employee notice and use limitation

Required statement:

> Assistant telemetry evaluates the safety and usefulness of the assistant release. It is not a hidden employee performance score and must not be used for employee ranking, productivity scoring, disciplinary action, compensation, promotion, or employment decisions.

- [ ] The notice containing the required statement was delivered before enrollment: `[notice ID/date required]`.
- [ ] Pilot selection used current department membership and a documented business reason, not assistant interaction volume, memory, ratings, or performance inference.
- [ ] Only aggregate cohort/release evidence is included in the approval packet.
- [ ] Participant questions, withdrawal, and access-revocation paths are documented: `[required]`.

## Security and UAT evidence

- [ ] Exact-version evaluation completed and passed for all five releases.
- [ ] Every failed, error, and human-review evaluation case was resolved or the release remained blocked.
- [ ] Representative UAT covered citations/freshness and one non-sensitive daily workflow per cohort.
- [ ] Cross-client and cross-tenant requests were denied without leaking existence or content.
- [ ] Denials were understandable and contained no sensitive detail.
- [ ] No write proposal or live side effect was produced by any read/draft pack.
- [ ] Scope violation count is zero for every release.
- [ ] Approval bypass count is zero for every release.
- [ ] Prohibited effect count is zero for every release.
- [ ] Each release has at least 20 non-fallback successful representative tasks.
- [ ] Useful feedback is at least 80% where 10 or more linked ratings exist; smaller denominators are disclosed without treating them as a threshold pass.
- [ ] P95 latency and cost per successful task are within each exact pack version budget.

Exceptions or conditions: `[none, or external issue/risk record required]`

## Independent decision and signature

I confirm that I am independent of implementation and pilot operation, reviewed the external evidence referenced above, verified the required employee-use limitation, and did not rely on this unsigned template as proof.

| Signature field | External value |
|---|---|
| Approver legal name | `[must be completed externally]` |
| Security/privacy role | `[must be completed externally]` |
| Organization | `[must be completed externally]` |
| Decision | `[APPROVED / APPROVED WITH CONDITIONS / REJECTED]` |
| External signature / attestation ID | `[must be completed externally]` |
| Signed timestamp and timezone | `[must be completed externally]` |
| Approval expiry / mandatory review date | `[must be completed externally]` |

Implementation acknowledgement (not approval): `[operator external attestation ID]`

Until the independent decision and signature fields are completed in the external approval system, broader activation is blocked.
