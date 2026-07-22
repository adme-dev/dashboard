# AI evaluation approval store migration 274

## Purpose

Migration 274 adds append-only pricing, execution-plan, cost-approval, and revocation evidence for governed AI evaluations. It does not call, enqueue, or schedule a model. An approval is evidence only; the separate admission guard must still load exact, unrevoked artifacts and issue a bounded simulation envelope.

## Apply and verify

Apply `server/database/migrations/274_ai_evaluation_approval_store.sql` through the normal production migration path. Verify that all five `ai_eval_*` tables exist, their append-only triggers are enabled, and no rows were created by the migration.

Before trusting an approval, load it by the exact evaluation run ID, plan digest, rate-card ID, and approval ID. Reject missing, expired, mismatched, or revoked artifacts. Approval creation must use the database clock and cannot exceed the rate-card validity window.

## Dormant rollback

The application remains safe if these tables are present but unused. The preferred rollback is therefore dormant rollback: stop creating or loading artifacts and deploy the previous application version. No feature flag or data cleanup is required because this migration does not activate execution.

Do not delete approval evidence, rate cards, execution plans, or revocations during rollback. Preserve them for audit and forward-fix the schema or service. Dropping these append-only records would destroy the evidence needed to explain past approvals.

## Forward path

The next slice may add protected administration endpoints for rate-card registration, plan preview, approval, and revocation. Those endpoints must not import or invoke a model executor. Actual evaluation execution remains a separate, explicitly approved workflow.
