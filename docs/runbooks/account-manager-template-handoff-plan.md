# Organic social job template implementation

Status: implementation plan following the live manual probe; not a claim of installed automation.

## Product decision

Reuse Social Media Content intake and the existing project-template model. Add a dedicated private six-stage Organic social video template. Allow an account manager to choose the job template during conversion, with the current template mapping as its default. Do not change global auto-conversion for other agency clients as part of the DriveAgent example.

DriveAgent product and DriveAgent News remain separate clients. Use the existing product brand kit, creative and Planner draft. This example authorizes no paid campaign or new video generation. Internal intake approval and customer publishing approval remain separate decisions.

## First complete slice: reusable task authoring and conversion

1. Add supported task authoring to the existing project-template detail screen: title, description/acceptance criteria, board, priority, estimated hours, due offset/duration, and prerequisites. Reuse Nuxt UI form conventions. Start with a flat task graph; do not replace existing phased templates.
2. Add authenticated, validated task create/update endpoints. Require template edit authority. All referenced prerequisites must belong to the same template; reject self-dependencies and cycles. Use transactions and fresh read-after-write responses. Preserve existing task IDs when editing and reject ambiguous concurrent changes.
3. Show task count and graph summary before conversion. Require a template with tasks for this workflow. Leave a deliberate project-only option explicit for existing users who need it.
4. Acquire a brief row lock and check its latest status and conversion linkage inside the transaction. A retry/concurrent request must not create a second project. Use the same conversion function for explicit and automatic conversion.
5. Create tasks in a first pass and map template task IDs to new task IDs. In a second pass, create prerequisites/parent links using the new IDs. Preserve brief/project/client provenance, board, due offsets and criteria. Do not describe prerequisites as a security boundary for publication: server-side publishing approval remains required.
6. Expose existing brief-template mapping in its editor, with explicit manual-versus-automatic conversion controls. Do not automatically enable it globally for this client-specific probe.
7. Author the dedicated template through supported controls, then verify a controlled brief conversion creates exactly six linked tasks with the intended dependency graph. Mark the original six tasks as manually created evidence; do not rewrite their history.

## Subsequent slices

- Task-to-Planner: an idempotent handoff keyed by client/task/deliverable; connect the existing product draft explicitly after matching client/creative. Retrying opens that draft. Propagate brief objective, audience, CTA and approved claims into structured post context.
- Customer portal: request approval of a versioned copy/media/channel payload. Authorized approver must belong to the same client and have approval permission. Reject/revise leaves publication blocked; edits invalidate sign-off. The scheduler and publish executor enforce the same gate.
- Delivery: store provider receipt/permalink before marking the delivery task complete. Failed/partial publication remains visible. Idempotent receipt processing cannot complete another client's task or bypass reporting.
- Closeout: actual metrics plus measurement window; no fabricated audience results or completion. Template/client/publishing-procedure versions are recorded for reproducibility.

## Evidence and acceptance

Existing example: SOC-26-0007 / project 3abc7881-3176-4c5c-8049-58314e36fe9b / product draft ef0bd231-020f-4e81-be02-87c1f59c7903. No automatic tasks resulted from its conversion.

Required tests: cross-template dependency rejection; cycle rejection; correct six-task mapping; concurrent/retried conversion; immediate mutation freshness; exact client isolation; idempotent draft handoff; approval revision invalidation; provider failure/success reconciliation; no job closure before reporting. Browser verify the full account-manager path and portal role boundaries.

Live completion still needs the correct product Facebook Page and designated customer approver. These are separate from the engineering work above.
