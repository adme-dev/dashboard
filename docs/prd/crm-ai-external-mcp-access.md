# XeroFlow CRM External AI and MCP Access

Status: Architecture and product requirements
Last updated: 2026-07-24
Parent PRD: `docs/prd/crm-ai-customer-platform-prd.md`

## 1. Purpose

Allow a client to use XeroFlow CRM safely from an existing AI application or
agent harness, including:

- ChatGPT.
- Claude.
- Groq-backed applications.
- Other MCP-compatible enterprise or custom harnesses.

XeroFlow will host a protected remote MCP server. External applications call
allowlisted XeroFlow tools; they never receive direct database access,
communications-provider credentials or unrestricted internal APIs.

## 2. Current ecosystem position

OpenAI documents remote MCP applications in ChatGPT developer mode, including
write actions for supported Business, Enterprise and Edu configurations. This
capability is currently described as beta and availability differs by plan:

https://help.openai.com/en/articles/12584461-developer-mode-apps-and-full-mcp-connectors-in-chatgpt-beta

Anthropic documents MCP support across Claude products, Claude Code, Claude
Desktop and its Messages API:

https://docs.anthropic.com/en/docs/agents-and-tools/mcp

Groq documents remote MCP support through its Responses API and currently
labels the capability beta:

https://console.groq.com/docs/tool-use/remote-mcp

The MCP authorization specification requires protected-resource discovery,
OAuth-based authorization, resource-bound tokens, PKCE and protection against
token passthrough:

https://modelcontextprotocol.io/specification/2025-06-18/basic/authorization

XeroFlow compatibility must be tested against supported product plans and
current implementations before each integration is marked generally
available.

## 3. Access modes

### 3.1 User-delegated connection

A CRM user connects XeroFlow to an approved AI application and authorizes
specific scopes. Tool calls execute as that user and cannot exceed the user's
client membership or role.

### 3.2 Client service connection

A client administrator authorizes a server-side harness. The connection uses
a dedicated service principal with explicit client, tool and scope policy.

Service connections must not impersonate an unrestricted administrator.

### 3.3 XeroFlow internal AI

XeroFlow's built-in AI assistant uses the same domain services and policy
engine but does not need to call the public MCP endpoint. This avoids
unnecessary network overhead while preserving behavioral parity.

## 4. Authorization architecture

The remote MCP server acts as an OAuth protected resource.

Required controls:

- HTTPS only.
- Protected Resource Metadata discovery.
- Authorization Server Metadata discovery.
- Authorization code with PKCE for user-delegated access.
- Exact redirect URI validation.
- Audience-bound access tokens.
- Short-lived access tokens.
- Refresh-token rotation where applicable.
- Resource and scope validation on every request.
- Client, user and tenant binding.
- Immediate grant and token revocation.
- No inbound access-token passthrough to databases or provider APIs.

An MCP token identifies authorization to use the XeroFlow MCP resource. Any
downstream provider request uses XeroFlow's separately managed provider
credential after policy checks.

## 5. Proposed scopes

Read scopes:

- `crm.contacts.read`
- `crm.opportunities.read`
- `crm.pipeline.read`
- `crm.tasks.read`
- `crm.appointments.read`
- `crm.conversations.read`
- `crm.products.read`
- `analytics.read`

Mutation scopes:

- `crm.notes.write`
- `crm.tasks.write`
- `crm.appointments.write`
- `crm.assignment.write`
- `crm.pipeline.write`

Communications scopes:

- `communications.sms.send`
- `communications.email.send`
- `communications.call.start`

Administrative scopes:

- `crm.settings.read`
- `crm.settings.write`
- `billing.usage.read`

Administrative and paid-action scopes require separate grants and must not be
included by default.

## 6. Initial MCP tool catalog

### 6.1 Read-only tools

- `search_contacts`
- `get_contact`
- `list_opportunities`
- `get_opportunity`
- `get_pipeline`
- `list_tasks`
- `list_appointments`
- `get_conversation`
- `search_products`
- `get_product`
- `get_product_availability`
- `get_campaign_attribution`
- `get_usage_summary`

### 6.2 Low-risk mutation tools

- `create_note`
- `create_task`
- `complete_task`

### 6.3 Controlled mutation tools

- `assign_opportunity`
- `update_opportunity_stage`
- `schedule_appointment`
- `reschedule_appointment`
- `cancel_appointment`

### 6.4 Paid or communications tools

- `send_sms`
- `send_email`
- `start_call`

### 6.5 Excluded tools

The initial MCP server must not expose:

- Raw SQL.
- Arbitrary HTTP requests.
- Provider credentials.
- Bulk personal-data export.
- User or tenant impersonation.
- Plan or price modification.
- Secret management.
- Unrestricted automation creation.

## 7. Tool policy

Every tool call passes through:

1. Protocol and schema validation.
2. Token and audience validation.
3. User or service-principal validation.
4. Client and tenant validation.
5. Scope validation.
6. Role authorization.
7. Client MCP tool policy.
8. Entitlement validation.
9. Consent validation where applicable.
10. Human approval policy.
11. Usage authorization for paid actions.
12. Idempotency validation.
13. Domain service execution.
14. Audit and usage recording.

External harness approval features are helpful but are not XeroFlow's
authorization boundary. XeroFlow enforces its own policy even when a harness
requests execution without approval.

## 8. Approval modes

Per client and tool:

- Disabled.
- Read only.
- Always require human approval.
- Require approval based on arguments or risk.
- Automatically execute within policy.

Default policy:

- Read-only tools may execute after authorization.
- Notes and tasks may be enabled without per-call approval.
- Stage changes, assignment and appointments require approval initially.
- Communications always require consent and usage authorization.
- Calls and bulk-like actions require approval initially.

## 9. Tenant isolation

The client ID is derived from the authorization grant, not accepted as a
trusted tool argument.

Agency users require an explicit, audited client-access grant. A tool cannot
switch clients by changing an argument.

Repository queries must enforce the same tenant boundary used by web and
mobile APIs.

## 10. Data minimization and egress

External LLM applications may receive data returned by MCP tools. Therefore:

- Return only fields required for the task.
- Mask or omit unnecessary contact details.
- Avoid returning full conversation history when a summary is sufficient.
- Paginate and cap search results.
- Prevent broad enumeration.
- Classify each tool's possible data egress.
- Show administrators which external application is connected.
- Record when sensitive fields are returned.
- Allow a client to disable specific fields or tools.

Clients must understand that returned data is handled under the external AI
provider's account, product and data policies.

## 11. Prompt injection and untrusted content

CRM notes, messages, emails and product descriptions are untrusted content.

Controls:

- Mark untrusted fields in tool descriptions and results.
- Never treat record content as system policy.
- Keep tool authorization outside model reasoning.
- Restrict tool chaining for high-risk operations.
- Require fresh confirmation for sensitive mutations.
- Detect abnormal enumeration and repeated denied actions.
- Allow immediate connection suspension.

## 12. Entitlements and billing

Proposed entitlement:

- `external_mcp_access`

Optional limits:

- Connected external applications.
- Monthly MCP tool calls.
- Read versus write tools.
- Analytics access.
- Communications access.

Cost policy:

- A client using its own ChatGPT, Claude or Groq account pays that provider's
  model cost directly.
- XeroFlow may meter MCP access as a product feature.
- XeroFlow always meters paid downstream actions such as SMS, voice, email or
  premium data calls.
- If XeroFlow proxies inference, XeroFlow meters and prices the model usage.

## 13. Audit model

Record:

- MCP connection.
- External application or harness.
- User or service principal.
- Client.
- Tool and version.
- Scope.
- Correlation ID.
- Arguments classification and bounded safe representation.
- Approval request and approver.
- Policy decisions.
- Result classification.
- Error.
- Usage reservation and reconciliation references.
- Timestamp and duration.

Do not store external model chain-of-thought. Store only operational tool
requests, approvals, policy decisions and outcomes required for audit.

## 14. Reliability

- Rate-limit by connection, user, client and tool.
- Use idempotency keys for all mutations.
- Return stable structured errors.
- Do not retry non-idempotent writes without an idempotency key.
- Use durable jobs for long-running operations.
- Expose processing status where execution is asynchronous.
- Add connection and harness health monitoring.
- Track tool latency, denial, error and abandonment rates.

## 15. User experience

Client administrator settings:

- Connect an AI application.
- Review requested scopes.
- Select allowed tools.
- Configure approval policy.
- View connection owner and last activity.
- Review tool-call audit.
- View MCP usage.
- Revoke access.

User approval experience:

- Show the requesting application.
- Show the proposed action.
- Show affected contact, opportunity or product.
- Show estimated paid usage where relevant.
- Allow approve or deny.
- Record the decision.

## 16. Compatibility matrix

| Harness | Intended support | Current consideration |
|---|---|---|
| ChatGPT | Remote MCP read and approved write tools | Full write-capable MCP availability varies by ChatGPT plan and is documented as beta. |
| Claude | Remote MCP through supported Claude products or API | Validate OAuth and tool behavior in each targeted Claude surface. |
| Groq | Remote MCP through supported tool-capable models | Groq remote MCP is currently documented as beta. |
| Custom harness | Standards-compliant remote MCP client | Must pass OAuth, schema, approval and error compatibility tests. |

## 17. Delivery sequence

1. Authorization and protected-resource metadata.
2. Connection and grant administration.
3. Read-only CRM and product tools.
4. Audit, rate limits and revocation.
5. ChatGPT, Claude and Groq compatibility tests.
6. Low-risk mutation tools.
7. Approval workflow.
8. Appointment and pipeline tools.
9. Paid communications tools.
10. MCP usage packaging and reporting.

## 18. Acceptance criteria

- A connected user can access only clients and records already available to
  that user.
- A tool argument cannot switch the authorized tenant.
- Revocation blocks subsequent calls.
- Read-only grants cannot invoke mutation tools.
- A write tool cannot bypass required approval.
- Communications cannot bypass consent, entitlement or spending limits.
- Provider and database credentials are never returned.
- Tool retries do not duplicate mutations.
- ChatGPT, Claude, Groq and a reference standards client pass the supported
  compatibility suite.
- Audit records identify the external harness and human or service actor.
- Customer-paid LLM usage is distinguished from XeroFlow-paid provider usage.
