# Account-manager social workflow R&D

The October 2026 probe starts with DriveAgent product, its Social Media Content brief and the existing approved 24-second video. DriveAgent product and DriveAgent News remain separate clients.

## Brief-entry repairs

Categories return counts; available templates are loaded from the templates endpoint and filtered by category ID. Client choices from the clients endpoint are passed through the renderer to client fields. Submission promotes the selected client field to the brief's top-level client ID, preserves `content_brief_title`, and displays the returned `referenceNumber`.

Regression coverage: `test/app/briefIntake.test.ts`, plus the existing brief conversion, notification and utility checks. The client fixture matches the actual array response from `/api/agency/clients`.

## Customer approval is a distinct handoff

Where the brief requires customer sign-off, the job must have an internal review followed by a client-portal decision on the same creative/copy version. Revisions reopen review. Keep delivery pending until the required reviewer has approved the current payload. Do not approve on a customer's behalf during a simulation.

The current general portal approval endpoints store `client_approvals` against projects/tasks and record the customer's response. They do not automatically reconcile those decisions into a general social post. The social approval gate currently checks client approval for `metadata.source === 'mcp_news'`; that condition does not cover imported product videos. The bridge and version binding remain design work, not functionality claimed by this brief-entry repair.

Neither DriveAgent client had an active portal user/approver at inspection. No portal invitation or client email is sent by this repair. The R&D deliverable remains draft, with client approval and the product Page connection explicitly pending.

## Remaining automation gaps

- Social Media Content has no configured project-template mapping.
- The project-template editor has no task-authoring UI in the inspected flow.
- The brief conversion dialog does not select a project template.
- Task-to-post handoff and provider-receipt reconciliation need stable links and duplicate protection.
- AI scheduling summaries must reflect saved status: the draft-creation endpoint always creates a draft even if a requested date is supplied.

Run the existing interfaces to expose these boundaries; do not insert workflow records directly into the database to make the demonstration appear automatic.
