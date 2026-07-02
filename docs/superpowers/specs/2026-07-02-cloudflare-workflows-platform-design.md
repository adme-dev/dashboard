# Cloudflare Workflows Platform Design

Date: 2026-07-02

## Goal

Introduce Cloudflare Workflows as a reusable durable orchestration layer for the dashboard, starting with social publishing but keeping the pattern suitable for other long-running application workflows.

## Source Notes

- Cloudflare Workflows run durable multi-step applications on Workers, with retries, sleeps, external-event waits, and built-in observability: https://developers.cloudflare.com/workflows/
- A Workflow is implemented by extending `WorkflowEntrypoint` and defining `run(event, step)`: https://developers.cloudflare.com/workflows/build/workers-api/
- Workflow configuration uses `[[workflows]]` with `name`, `binding`, and `class_name`: https://developers.cloudflare.com/workflows/get-started/guide/
- `step.sleepUntil` supports scheduling work at a specific timestamp: https://developers.cloudflare.com/workflows/build/sleeping-and-retrying/
- Pages must call a separate Worker that contains Workflow definitions, preferably through service bindings: https://developers.cloudflare.com/workflows/build/call-workflows-from-pages/

## Architecture

Create a standalone `workers/agency-workflows` Worker. It owns Workflow definitions and exposes a small authenticated control surface:

- `GET /health` for readiness.
- `POST /workflows/start` for starting supported workflow instances.
- `GET /workflows/status?workflow=...&instanceId=...` for inspecting known instances.

The Pages app remains the authentication, authorization, and database authority. Workflow steps call back into explicit Pages internal endpoints with a shared secret. That avoids duplicating Nitro server utilities inside the Worker and keeps provider writes scoped to existing server-side guards.

The Worker should not be exposed on `workers.dev` by default. Pages should invoke it through a service binding once the trigger endpoint is ready; any public route should be added explicitly with the same shared-secret control surface.

## First Workflow

`SocialPublishingWorkflow` accepts:

- `postId`
- `clientId`
- `scheduledAt`
- `trigger`
- `requestedBy`

It normalizes the payload, sleeps until `scheduledAt` when the timestamp is in the future, and then calls a Pages internal publishing callback with retry and timeout settings.

This first slice does not replace the existing `social-dispatch-cron` worker. Workflow starts are disabled unless `AGENCY_WORKFLOWS_ENABLED=true`, so production behavior stays on the existing idempotent cron dispatcher until the Workflow route is manually verified.

## Expansion Model

Future workflows should live in the same Worker when they share the platform-level control plane:

- lead delivery and retry orchestration
- scheduled social/email reports
- creative asset generation and approval waits
- onboarding or client lifecycle sequences
- finance approval waits and guarded execution

Each workflow gets its own typed payload contract and a deterministic instance-id strategy so retries do not create duplicate orchestration.

## Rollout

1. Deploy the Worker with starts disabled.
2. Set `WORKFLOW_SERVICE_SECRET` and `WORKFLOW_CALLBACK_SECRET` as Worker secrets.
3. Add a Pages service binding once the Pages trigger endpoint is ready.
4. Manually start one social publishing workflow in a test tenant.
5. Add the Pages cutover flag only after status, callback, audit, and idempotency evidence is available.
