# CRM, Communications, AI and Billing Implementation Checklist

Status: Reference backlog
PRD: `docs/prd/crm-ai-customer-platform-prd.md`
Last updated: 2026-07-24

Ordered delivery backlog:
`docs/prd/crm-ai-incremental-delivery-task-list.md`

AI phone receptionist rollout:
`docs/prd/crm-ai-phone-receptionist-rollout.md`

## Status legend

- `TODO`: Not yet implemented or not yet verified.
- `VERIFY`: Some implementation may exist, but it must be checked against the
  PRD.
- `BLOCKED`: Requires a product, provider or compliance decision.
- `DONE`: Implemented and accepted against the listed requirement.

## Priority legend

- `P0`: Foundation, security, data integrity or cost control.
- `P1`: Required for the first operational CRM release.
- `P2`: Expansion after the operational foundation.

## A. Architecture and research

| ID | Priority | Status | Requirement |
|---|---:|---|---|
| ARC-001 | P0 | TODO | Audit the existing canonical lead, attribution, CRM and billing schemas. |
| ARC-002 | P0 | TODO | Inspect `/Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt` for reusable voice, Twilio, SMS, email and AI patterns. |
| ARC-003 | P0 | TODO | Document provider-independent communication and AI tool interfaces. |
| ARC-004 | P0 | TODO | Create an ADR for CRM domain boundaries and tenant ownership. |
| ARC-005 | P0 | TODO | Create an ADR for durable domain events and background jobs. |
| ARC-006 | P0 | TODO | Define versioned API contracts for contacts, opportunities, activities and conversations. |
| ARC-007 | P0 | TODO | Define actor types: human, agency, automation, AI and integration. |

## B. Lead identity and reconciliation

| ID | Priority | Status | Requirement |
|---|---:|---|---|
| LEAD-001 | P0 | VERIFY | Track website `form_submit` as intent rather than a confirmed lead. |
| LEAD-002 | P0 | VERIFY | Emit or store `generate_lead` only after confirmed provider acceptance. |
| LEAD-003 | P0 | VERIFY | Generate a stable browser event ID before form submission. |
| LEAD-004 | P0 | VERIFY | Inject the browser event ID into supported website form payloads. |
| LEAD-005 | P0 | VERIFY | Accept the browser event ID through provider confirmation webhooks. |
| LEAD-006 | P0 | VERIFY | Persist first-touch and last-touch attribution. |
| LEAD-007 | P0 | VERIFY | Persist UTM values, click IDs, landing page and referrer. |
| LEAD-008 | P0 | VERIFY | Persist campaign, ad group/ad set, ad and creative identifiers. |
| LEAD-009 | P0 | VERIFY | Deduplicate provider retries using stable provider lead or event IDs. |
| LEAD-010 | P0 | VERIFY | Reuse contacts by deterministic normalized email and phone. |
| LEAD-011 | P0 | VERIFY | Preserve separate opportunities for distinct enquiries. |
| LEAD-012 | P1 | TODO | Add bounded fallback reconciliation for events without a shared identifier. |
| LEAD-013 | P1 | VERIFY | Show unmatched submissions and match method in a reconciliation dashboard. |
| LEAD-014 | P1 | VERIFY | Alert when website submissions have no confirmed provider leads. |
| LEAD-015 | P1 | TODO | Distinguish historic unmatched records from current integration failures. |

## C. Client CRM modes and settings

| ID | Priority | Status | Requirement |
|---|---:|---|---|
| MODE-001 | P0 | VERIFY | Store an agency-controlled CRM operating mode per client. |
| MODE-002 | P0 | TODO | Support capture-only mode. |
| MODE-003 | P0 | TODO | Support capture plus lightweight CRM mode. |
| MODE-004 | P0 | TODO | Support full CRM mode. |
| MODE-005 | P1 | TODO | Support external CRM delivery mode. |
| MODE-006 | P0 | VERIFY | Prevent request-level provider flags from enabling CRM promotion. |
| MODE-007 | P1 | TODO | Add agency UI for mode and integration policy. |
| MODE-008 | P1 | TODO | Add client-visible explanation of the active operating mode. |

## D. Contacts and opportunities

| ID | Priority | Status | Requirement |
|---|---:|---|---|
| CRM-001 | P0 | TODO | Create or align the canonical contact model. |
| CRM-002 | P0 | TODO | Add deterministic contact identifiers. |
| CRM-003 | P0 | TODO | Create or align the canonical opportunity model. |
| CRM-004 | P0 | TODO | Relate multiple opportunities to one contact. |
| CRM-005 | P1 | TODO | Add configurable pipelines and stages. |
| CRM-006 | P1 | TODO | Preserve canonical stage categories for reporting. |
| CRM-007 | P1 | TODO | Add opportunity value, probability and expected close date. |
| CRM-008 | P1 | TODO | Add product, vehicle, brand and location context. |
| CRM-009 | P1 | TODO | Add loss reasons. |
| CRM-010 | P1 | TODO | Build contact list and detail views. |
| CRM-011 | P1 | TODO | Build pipeline board and opportunity detail views. |
| CRM-012 | P1 | TODO | Add duplicate review and safe merge workflow. |

## E. Activities, tasks and customer timeline

| ID | Priority | Status | Requirement |
|---|---:|---|---|
| ACT-001 | P0 | TODO | Define a unified immutable activity event contract. |
| ACT-002 | P1 | TODO | Add contact and opportunity timeline queries. |
| ACT-003 | P1 | TODO | Add notes with actor and timestamp. |
| ACT-004 | P1 | TODO | Add assigned tasks, due dates, priority and outcomes. |
| ACT-005 | P1 | TODO | Add appointments and calendar integration seam. |
| ACT-006 | P1 | TODO | Add overdue and upcoming work queues. |
| ACT-007 | P1 | TODO | Include website, webhook, communication and stage events. |
| ACT-008 | P1 | TODO | Include automation, AI and external delivery events. |

## E2. Product catalog and inquiry matching

| ID | Priority | Status | Requirement |
|---|---:|---|---|
| SKU-001 | P0 | VERIFY | Audit the existing dealer vehicle feed tables, sync jobs and source identifiers. |
| SKU-002 | P0 | TODO | Define a generic client-scoped product catalog contract. |
| SKU-003 | P0 | TODO | Add catalog source, product, identifier, location and sync-run records. |
| SKU-004 | P0 | TODO | Support SKU, dealer stock ID, source product ID and VIN identifiers. |
| SKU-005 | P0 | TODO | Enforce client and catalog-source boundaries during matching. |
| SKU-006 | P0 | TODO | Add idempotent API, webhook and feed ingestion adapters. |
| SKU-007 | P1 | TODO | Add product availability, price, URL, media and structured attributes. |
| SKU-008 | P1 | TODO | Add available, reserved, sold, removed and unknown inventory states. |
| SKU-009 | P0 | TODO | Capture SKU, stock ID, VIN, product URL and metadata in website tracking. |
| SKU-010 | P0 | TODO | Carry product identifiers through supported confirmation webhooks. |
| SKU-011 | P0 | TODO | Add deterministic product matching precedence. |
| SKU-012 | P1 | TODO | Add bounded metadata fallback matching with confidence. |
| SKU-013 | P0 | TODO | Store immutable inquiry-time product snapshots. |
| SKU-014 | P0 | TODO | Relate one or more product interests to a lead and opportunity. |
| SKU-015 | P1 | TODO | Mark one product interest as primary. |
| SKU-016 | P1 | TODO | Add unmatched-product reconciliation queue. |
| SKU-017 | P1 | TODO | Add feed freshness and synchronization health alerts. |
| SKU-018 | P1 | TODO | Preserve sold and removed products for historical enquiries. |
| SKU-019 | P1 | TODO | Add product or vehicle cards to web lead and opportunity workspaces. |
| SKU-020 | P1 | TODO | Add product or vehicle cards and current stock state to mobile. |
| SKU-021 | P1 | TODO | Add product and inventory filters to CRM queues and reports. |
| SKU-022 | P1 | TODO | Add enquiry and outcome reporting by SKU, stock ID, vehicle and location. |
| SKU-023 | P2 | TODO | Add AI tools for product lookup, availability and authorized alternatives. |
| SKU-024 | P0 | TODO | Prevent AI from presenting snapshot availability as current availability. |
| SKU-025 | P1 | TODO | Add product feed entitlement and API usage metering where applicable. |

## F. Assignment, routing and SLA

| ID | Priority | Status | Requirement |
|---|---:|---|---|
| SLA-001 | P1 | TODO | Add owner and team assignment. |
| SLA-002 | P1 | TODO | Add round-robin routing. |
| SLA-003 | P1 | TODO | Add brand, location, source and enquiry-type routing. |
| SLA-004 | P1 | TODO | Add business-hours-aware routing. |
| SLA-005 | P1 | TODO | Add overflow and unassigned queues. |
| SLA-006 | P1 | TODO | Calculate time to assignment and first response. |
| SLA-007 | P1 | TODO | Add warning and breach thresholds. |
| SLA-008 | P1 | TODO | Add reminder, escalation and reassignment actions. |
| SLA-009 | P1 | TODO | Add manager SLA dashboard and alerts. |

## G. Communications

| ID | Priority | Status | Requirement |
|---|---:|---|---|
| COMMS-001 | P0 | TODO | Define provider-independent conversation and message models. |
| COMMS-002 | P0 | TODO | Define communication provider adapter contracts. |
| COMMS-003 | P0 | TODO | Add consent, suppression and communication preference checks. |
| COMMS-004 | P1 | TODO | Implement two-way Twilio SMS. |
| COMMS-005 | P1 | TODO | Process Twilio delivery and inbound message webhooks idempotently. |
| COMMS-006 | P1 | TODO | Meter SMS by billable segment. |
| COMMS-007 | P1 | TODO | Implement outbound email through the selected adapter. |
| COMMS-008 | P1 | TODO | Process email delivery, bounce, complaint and reply events. |
| COMMS-009 | P1 | TODO | Add templates and merge fields. |
| COMMS-010 | P1 | TODO | Build the unified conversations workspace. |
| COMMS-011 | P2 | TODO | Implement inbound and outbound Twilio voice. |
| COMMS-012 | P2 | TODO | Add call recording, transcription and voicemail policy. |
| COMMS-013 | P2 | TODO | Add human transfer and escalation. |
| COMMS-014 | P0 | TODO | Implement a provider-neutral voice, messaging and number contract. |
| COMMS-015 | P0 | TODO | Add Twilio and Telnyx provider account records and encrypted credentials. |
| COMMS-016 | P0 | TODO | Add explicit provider routing by client, channel, number and region. |
| COMMS-017 | P0 | TODO | Normalize Twilio and Telnyx webhook events into canonical communication events. |
| COMMS-018 | P0 | TODO | Normalize provider cost and usage into the shared usage ledger. |
| COMMS-019 | P1 | TODO | Implement Twilio ConversationRelay and Media Streams evaluation adapters. |
| COMMS-020 | P1 | TODO | Implement Telnyx AI Assistant and media-streaming evaluation adapters. |
| COMMS-021 | P1 | TODO | Add provider capability and health registry. |
| COMMS-022 | P1 | TODO | Add active-passive failover for new outbound work. |
| COMMS-023 | P1 | TODO | Preserve number and conversation affinity for inbound traffic. |
| COMMS-024 | P1 | TODO | Add provider migration and number-porting workflow. |
| COMMS-025 | P0 | TODO | Run the Australian Twilio versus Telnyx voice AI pilot. |
| COMMS-026 | P0 | TODO | Record provider selection evidence for latency, quality, delivery and total cost. |

## H. Automation engine

| ID | Priority | Status | Requirement |
|---|---:|---|---|
| AUTO-001 | P0 | TODO | Define versioned trigger, condition and action contracts. |
| AUTO-002 | P1 | TODO | Add durable automation definitions and runs. |
| AUTO-003 | P1 | TODO | Add delays and business-hours behavior. |
| AUTO-004 | P1 | TODO | Add idempotency, retries and dead-letter handling. |
| AUTO-005 | P1 | TODO | Add lead assignment and SLA actions. |
| AUTO-006 | P1 | TODO | Add task, tag, notification and stage actions. |
| AUTO-007 | P1 | TODO | Add communication actions with entitlement and consent checks. |
| AUTO-008 | P2 | TODO | Add approved AI workflow actions. |
| AUTO-009 | P1 | TODO | Build automation management and execution history UI. |

## I. AI receptionist

| ID | Priority | Status | Requirement |
|---|---:|---|---|
| AI-001 | P0 | TODO | Define AI agent, run and tool-call records. |
| AI-002 | P0 | TODO | Bind every AI run to one client and approved context. |
| AI-003 | P0 | TODO | Implement server-authorized CRM tool contracts. |
| AI-004 | P0 | TODO | Enforce entitlement, consent and usage inside every paid tool. |
| AI-005 | P0 | TODO | Add suggest, approval, automatic and disabled action modes. |
| AI-006 | P0 | TODO | Add human handoff and emergency stop. |
| AI-007 | P1 | TODO | Add client knowledge, tone, hours and qualification settings. |
| AI-008 | P1 | TODO | Add AI-generated conversation summaries and extracted intent. |
| AI-009 | P1 | TODO | Add SMS qualification and appointment workflows. |
| AI-010 | P2 | TODO | Add voice receptionist workflows. |
| AI-011 | P0 | TODO | Record model, token usage, tool outcomes and audit references. |
| AI-012 | P0 | TODO | Add prompt injection and untrusted-content defenses. |
| AI-013 | P1 | TODO | Create per-client AI evaluation fixtures. |
| AI-014 | P1 | TODO | Add AI handoff, failure and outcome reporting. |

## I2. AI phone receptionist

| ID | Priority | Status | Requirement |
|---|---:|---|---|
| PHONE-001 | P0 | TODO | Create a separate client-scoped AI phone receptionist feature flag. |
| PHONE-002 | P0 | TODO | Keep inbound and outbound AI call permissions separate. |
| PHONE-003 | P0 | TODO | Provision a dedicated non-production test number. |
| PHONE-004 | P0 | TODO | Define human transfer, voicemail and provider-failure fallback. |
| PHONE-005 | P0 | TODO | Add agency and client emergency kill switches. |
| PHONE-006 | P0 | TODO | Add per-call, concurrent-call and monthly spending limits. |
| PHONE-007 | P0 | BLOCKED | Complete Australian AI, call-recording and disclosure policy review. |
| PHONE-008 | P0 | TODO | Define transcript, recording and retention policy. |
| PHONE-009 | P0 | TODO | Add Twilio and Telnyx receptionist evaluation deployments. |
| PHONE-010 | P0 | TODO | Run inbound calls through a synthetic test suite. |
| PHONE-011 | P1 | TODO | Pilot after-hours information-only calls. |
| PHONE-012 | P1 | TODO | Add consented lead capture with caller confirmation. |
| PHONE-013 | P0 | TODO | Require idempotent lead creation from call outcomes. |
| PHONE-014 | P1 | TODO | Add human handoff notifications to web and mobile. |
| PHONE-015 | P1 | TODO | Add read-only product and vehicle availability lookup. |
| PHONE-016 | P1 | TODO | Add read-only appointment availability lookup. |
| PHONE-017 | P1 | TODO | Add approval-controlled appointment booking. |
| PHONE-018 | P1 | TODO | Add call summaries and suggested follow-up tasks. |
| PHONE-019 | P0 | TODO | Add call-level audit, provider usage and actual-cost reconciliation. |
| PHONE-020 | P0 | TODO | Monitor latency, interruption, transfer, completion and failure rates. |
| PHONE-021 | P1 | TODO | Add client-specific greeting, hours, qualification and escalation configuration. |
| PHONE-022 | P0 | TODO | Prohibit outbound AI calling until separately approved. |
| PHONE-023 | P0 | BLOCKED | Define outbound calling consent, use cases and compliance policy. |
| PHONE-024 | P1 | TODO | Canary with one internal or low-risk client and a separate number. |
| PHONE-025 | P0 | TODO | Prove disabling the receptionist restores normal human or voicemail routing. |

## J. Paywall and entitlements

| ID | Priority | Status | Requirement |
|---|---:|---|---|
| PAY-001 | P0 | TODO | Define plans, features and entitlement records. |
| PAY-002 | P0 | TODO | Add client entitlement overrides. |
| PAY-003 | P0 | TODO | Add trial, active, grace, capped, overdue, suspended and cancelled states. |
| PAY-004 | P0 | TODO | Enforce entitlements on server mutations and paid actions. |
| PAY-005 | P0 | TODO | Preserve lead capture during billing restrictions. |
| PAY-006 | P1 | TODO | Add portal navigation and UI gating from entitlements. |
| PAY-007 | P1 | TODO | Add clear upgrade and entitlement-denied UX. |
| PAY-008 | P0 | BLOCKED | Select the subscription billing provider. |
| PAY-009 | P1 | BLOCKED | Decide self-service versus agency-approved upgrades. |
| PAY-010 | P1 | TODO | Add billing webhook mapping and idempotency. |

## J2. External AI and MCP access

| ID | Priority | Status | Requirement |
|---|---:|---|---|
| MCP-001 | P0 | TODO | Define the XeroFlow protected remote MCP server boundary. |
| MCP-002 | P0 | TODO | Implement MCP OAuth protected-resource metadata and authorization discovery. |
| MCP-003 | P0 | TODO | Require OAuth authorization code flow with PKCE for user connections. |
| MCP-004 | P0 | TODO | Validate token audience, expiry, scopes, user and client binding. |
| MCP-005 | P0 | TODO | Prohibit inbound token passthrough to downstream services. |
| MCP-006 | P0 | TODO | Define read, write, communications, analytics and administrative scopes. |
| MCP-007 | P0 | TODO | Define per-client and per-user MCP tool policies. |
| MCP-008 | P0 | TODO | Implement read-only contact, opportunity, pipeline, task and product tools. |
| MCP-009 | P1 | TODO | Implement create-note and create-task mutation tools. |
| MCP-010 | P1 | TODO | Implement assignment and pipeline-stage mutation tools. |
| MCP-011 | P1 | TODO | Implement appointment tools. |
| MCP-012 | P1 | TODO | Implement communication tools with consent, entitlement and usage checks. |
| MCP-013 | P0 | TODO | Require configurable approval for write and high-impact tools. |
| MCP-014 | P0 | TODO | Return minimum necessary data from every tool. |
| MCP-015 | P0 | TODO | Add tool-call idempotency and correlation IDs. |
| MCP-016 | P0 | TODO | Audit harness, user, client, tool, policy decision and outcome. |
| MCP-017 | P0 | TODO | Add connection, grant and token revocation. |
| MCP-018 | P0 | TODO | Add rate limits, anomaly controls and abuse alerts. |
| MCP-019 | P0 | TODO | Add prompt-injection and data-egress protections. |
| MCP-020 | P1 | TODO | Add client administrator connection and tool-policy UI. |
| MCP-021 | P1 | TODO | Add MCP entitlement and usage meter. |
| MCP-022 | P1 | TODO | Distinguish customer-paid LLM inference from XeroFlow-proxied inference. |
| MCP-023 | P1 | TODO | Validate ChatGPT remote MCP compatibility and plan limitations. |
| MCP-024 | P1 | TODO | Validate Claude MCP compatibility. |
| MCP-025 | P1 | TODO | Validate Groq remote MCP compatibility and beta limitations. |
| MCP-026 | P1 | TODO | Publish safe connection instructions and supported tool catalog. |
| MCP-027 | P0 | TODO | Add tenant-isolation, authorization, approval and revocation acceptance tests. |

## K. Usage metering and cost control

| ID | Priority | Status | Requirement |
|---|---:|---|---|
| USAGE-001 | P0 | TODO | Create immutable usage meter and ledger records. |
| USAGE-002 | P0 | TODO | Record provider cost, customer price, markup and margin. |
| USAGE-003 | P0 | TODO | Add globally unique usage idempotency keys. |
| USAGE-004 | P0 | TODO | Implement estimated usage reservations before paid actions. |
| USAGE-005 | P0 | TODO | Reconcile reservations with actual provider usage. |
| USAGE-006 | P0 | TODO | Add monthly soft and hard spending limits. |
| USAGE-007 | P0 | TODO | Add agency emergency stop. |
| USAGE-008 | P1 | TODO | Meter AI input and output tokens. |
| USAGE-009 | P1 | TODO | Meter SMS segments. |
| USAGE-010 | P1 | TODO | Meter email sends. |
| USAGE-011 | P2 | TODO | Meter voice and transcription minutes. |
| USAGE-012 | P2 | TODO | Meter number rental, storage and recording retention. |
| USAGE-013 | P1 | TODO | Add usage threshold notifications. |
| USAGE-014 | P1 | TODO | Build client and agency usage dashboards. |
| USAGE-015 | P1 | TODO | Add usage export and Xero invoicing seam. |
| USAGE-016 | P0 | TODO | Normalize Twilio and Telnyx rates into comparable billable units. |
| USAGE-017 | P1 | TODO | Report cost and margin by communications provider. |

## L. Provider and external CRM integrations

| ID | Priority | Status | Requirement |
|---|---:|---|---|
| INT-001 | P0 | VERIFY | Verify the website tracking and confirmation webhook path. |
| INT-002 | P0 | VERIFY | Verify Meta lead ads webhook behavior and deduplication. |
| INT-003 | P1 | BLOCKED | Confirm the available Google lead-form integration path. |
| INT-004 | P1 | TODO | Define inbound external CRM webhook contract. |
| INT-005 | P1 | TODO | Define outbound canonical lead delivery contract. |
| INT-006 | P1 | TODO | Store external contact, opportunity and delivery identifiers. |
| INT-007 | P1 | TODO | Synchronize contacted, qualified, won and lost outcomes. |
| INT-008 | P1 | TODO | Add retry and dead-letter processing for delivery failures. |
| INT-009 | P1 | TODO | Add integration health and credential alerts. |

## M. Analytics and reporting

| ID | Priority | Status | Requirement |
|---|---:|---|---|
| REPORT-001 | P1 | VERIFY | Report form intents separately from confirmed leads. |
| REPORT-002 | P1 | TODO | Report assignment, contacted, qualified, appointment, won and lost. |
| REPORT-003 | P1 | TODO | Report median response time and SLA breach rate. |
| REPORT-004 | P1 | TODO | Report cost per confirmed lead. |
| REPORT-005 | P1 | TODO | Report cost per qualified lead. |
| REPORT-006 | P1 | TODO | Report cost per appointment and sale. |
| REPORT-007 | P1 | TODO | Report campaign revenue and closed-loop ROAS. |
| REPORT-008 | P1 | TODO | Report first-touch, last-touch and assisted attribution. |
| REPORT-009 | P1 | TODO | Report attribution coverage and reconciliation health. |
| REPORT-010 | P1 | TODO | Add lead velocity and stage progression trends. |

## N. Security, privacy and compliance

| ID | Priority | Status | Requirement |
|---|---:|---|---|
| SEC-001 | P0 | TODO | Prove tenant isolation for every CRM repository and endpoint. |
| SEC-002 | P0 | TODO | Add role-based authorization for CRM and billing actions. |
| SEC-003 | P0 | TODO | Audit agency access to client CRM data. |
| SEC-004 | P0 | TODO | Encrypt provider credentials and sensitive secrets. |
| SEC-005 | P0 | TODO | Add signed access for recordings and attachments. |
| SEC-006 | P0 | TODO | Add consent source, timestamp and scope. |
| SEC-007 | P0 | TODO | Enforce email and SMS suppression below automation and AI. |
| SEC-008 | P0 | BLOCKED | Complete jurisdiction review for voice recording disclosure. |
| SEC-009 | P1 | TODO | Add configurable transcript and recording retention. |
| SEC-010 | P1 | TODO | Add contact data export and deletion workflows. |
| SEC-011 | P0 | TODO | Add abuse controls to public lead and webhook ingestion. |
| SEC-012 | P0 | TODO | Prevent sensitive personal data from entering operational logs. |

## O. Reliability and observability

| ID | Priority | Status | Requirement |
|---|---:|---|---|
| OPS-001 | P0 | TODO | Add correlation and causation IDs across events and jobs. |
| OPS-002 | P0 | TODO | Measure webhook receipt and processing latency. |
| OPS-003 | P0 | TODO | Measure deduplication and reconciliation rates. |
| OPS-004 | P0 | TODO | Monitor queue depth, age, retries and dead letters. |
| OPS-005 | P1 | TODO | Monitor communication delivery failures. |
| OPS-006 | P1 | TODO | Monitor AI tool failures and handoffs. |
| OPS-007 | P0 | TODO | Monitor usage reservation and reconciliation discrepancies. |
| OPS-008 | P0 | TODO | Alert on client and agency spending thresholds. |
| OPS-009 | P1 | TODO | Build integration health dashboard. |

## P. Portal user experience

| ID | Priority | Status | Requirement |
|---|---:|---|---|
| UX-001 | P1 | TODO | Add CRM Overview navigation. |
| UX-002 | P1 | TODO | Add Leads and Contacts navigation. |
| UX-003 | P1 | TODO | Add Pipeline navigation. |
| UX-004 | P1 | TODO | Add Conversations navigation. |
| UX-005 | P1 | TODO | Add Tasks and Appointments navigation. |
| UX-006 | P1 | TODO | Add Automations navigation. |
| UX-007 | P2 | TODO | Add AI Receptionist navigation. |
| UX-008 | P1 | TODO | Add Reports and Integration Health navigation. |
| UX-009 | P1 | TODO | Add Usage and Billing navigation. |
| UX-010 | P0 | TODO | Respect CRM mode, role and entitlements for every item. |
| UX-011 | P1 | TODO | Build a unified lead workspace. |
| UX-012 | P1 | TODO | Show attribution, SLA, conversation, timeline and duplicate state together. |

## Q. Dealer mobile application

| ID | Priority | Status | Requirement |
|---|---:|---|---|
| MOB-001 | P0 | TODO | Audit the existing dealer mobile application and its current API contracts. |
| MOB-002 | P0 | TODO | Align mobile with the canonical CRM, event, entitlement and usage APIs. |
| MOB-003 | P0 | TODO | Add client-scoped device and push-token registration. |
| MOB-004 | P0 | TODO | Store session material using platform secure storage. |
| MOB-005 | P0 | TODO | Add device revocation and local data clearing. |
| MOB-006 | P1 | TODO | Implement assigned lead inbox and filtering. |
| MOB-007 | P1 | TODO | Implement contact and opportunity detail. |
| MOB-008 | P1 | TODO | Implement pipeline stage and assignment updates. |
| MOB-009 | P1 | TODO | Implement customer timeline, notes and tasks. |
| MOB-010 | P1 | TODO | Implement appointments and upcoming-work view. |
| MOB-011 | P1 | TODO | Implement conversation threads and permitted call, SMS and email actions. |
| MOB-012 | P1 | TODO | Add new lead, reply, SLA, task and appointment push notifications. |
| MOB-013 | P1 | TODO | Add minimal-data push payloads and secure record fetch after open. |
| MOB-014 | P1 | TODO | Add deep links for leads, conversations, tasks, appointments and AI handoffs. |
| MOB-015 | P1 | TODO | Add offline-safe cache for recent assigned work. |
| MOB-016 | P1 | TODO | Add idempotent mobile mutation outbox. |
| MOB-017 | P0 | TODO | Enforce server-side entitlements and usage authorization for mobile actions. |
| MOB-018 | P1 | TODO | Add capture-only, read-only and paywall states. |
| MOB-019 | P2 | TODO | Add AI summary, suggested response and qualification state. |
| MOB-020 | P2 | TODO | Add AI approval, human handoff and conversation takeover. |
| MOB-021 | P0 | TODO | Add privacy-safe crash reporting and mobile API observability. |
| MOB-022 | P1 | TODO | Add staging and production environment configuration. |
| MOB-023 | P1 | TODO | Configure universal/app links and push credentials. |
| MOB-024 | P1 | TODO | Define forced and recommended app upgrade policy. |
| MOB-025 | P0 | BLOCKED | Confirm supported operating systems, mobile framework and release ownership. |
| MOB-026 | P0 | BLOCKED | Decide whether app-store commerce is required. |
| MOB-027 | P0 | TODO | Complete app-store privacy, account deletion and data export requirements. |

## R. Product decisions

| ID | Priority | Status | Decision |
|---|---:|---|---|
| DEC-001 | P0 | BLOCKED | Select the subscription billing provider. |
| DEC-002 | P0 | BLOCKED | Decide whether Xero invoices subscriptions, usage, or both. |
| DEC-003 | P0 | BLOCKED | Define package allowances, overages and agency markup defaults. |
| DEC-004 | P1 | BLOCKED | Select the initial email provider and inbound reply strategy. |
| DEC-005 | P1 | BLOCKED | Select the first external CRM integrations. |
| DEC-006 | P1 | BLOCKED | Define default CRM mode for existing clients. |
| DEC-007 | P1 | BLOCKED | Define default AI approval policy. |
| DEC-008 | P1 | BLOCKED | Define recording and transcript retention defaults. |
| DEC-009 | P0 | BLOCKED | Confirm the existing mobile framework, supported operating systems and release owner. |
| DEC-010 | P0 | BLOCKED | Decide whether mobile subscriptions require app-store commerce. |
| DEC-011 | P1 | BLOCKED | Define mobile offline data retention. |
| DEC-012 | P0 | BLOCKED | Select default voice and messaging providers after the Australian pilot. |
| DEC-013 | P1 | BLOCKED | Decide which clients require active-passive communications redundancy. |
| DEC-014 | P0 | BLOCKED | Confirm the authoritative existing dealer vehicle feeds and identifier mapping. |
| DEC-015 | P1 | BLOCKED | Define product feed freshness and sold-stock retention defaults. |
| DEC-016 | P1 | BLOCKED | Decide whether external MCP access is included in CRM Pro or sold as an add-on. |
| DEC-017 | P0 | BLOCKED | Define default external MCP write-action approval policy. |
| DEC-018 | P1 | BLOCKED | Select officially supported external AI applications and plans. |
| DEC-019 | P0 | BLOCKED | Approve AI phone disclosure, recording and retention policy. |
| DEC-020 | P0 | BLOCKED | Define the first receptionist pilot client, number and business hours. |
| DEC-021 | P0 | BLOCKED | Approve any future outbound AI calling use case. |

## Recommended execution order

1. Complete `ARC`, `SEC`, `PAY-001` through `PAY-005`, and `USAGE-001`
   through `USAGE-007`.
2. Implement `CRM`, `ACT`, `MODE` and `SLA`.
3. Audit vehicle feeds and implement canonical product-interest matching.
4. Complete lead reconciliation and closed-loop reporting.
5. Integrate the existing mobile application with the CRM foundation.
6. Implement the shared conversation model and SMS/email.
7. Add mobile communication actions, push and deep links.
8. Implement automation.
9. Implement AI SMS workflows and mobile handoff.
10. Implement external read-only MCP access, then approved mutation tools.
11. Implement AI voice workflows.
12. Complete commercial expansion and additional providers.

## First implementation slice

The first shippable slice should include:

- Client CRM mode.
- Server-side entitlement service.
- Usage ledger and spending limits.
- Canonical contacts and opportunities.
- Product-interest contract and exact SKU or stock-ID matching.
- Default pipeline stages.
- Activity timeline.
- Assignment and first-response SLA.
- Lead-to-contact/opportunity promotion.
- Portal contact, pipeline and lead workspace.
- Mobile-ready APIs, device registration and entitlement response.
- Audit and tenant-isolation coverage.

This slice establishes the contracts required by communications, automation
and AI without allowing unmetered paid provider activity.

## Industry receptionist configuration and knowledge

- [ ] `PHONE-IND-001` Define the versioned industry-template schema and lifecycle.
- [ ] `PHONE-IND-002` Implement platform, industry, client, location, and temporary override resolution.
- [ ] `PHONE-IND-003` Prevent lower-level configuration from expanding permissions without approval.
- [ ] `PHONE-IND-004` Implement per-location prerequisite and readiness evaluation.
- [ ] `PHONE-IND-005` Define required business, hours, routing, escalation, service, booking, compliance, and budget settings.
- [ ] `PHONE-IND-006` Implement tenant-isolated knowledge collections and location scoping.
- [ ] `PHONE-IND-007` Implement knowledge draft, review, approval, publication, supersession, archive, and expiry states.
- [ ] `PHONE-IND-008` Record knowledge owner, source, approver, version, applicability, effective date, review date, and expiry.
- [ ] `PHONE-IND-009` Preserve source attribution, freshness, and retrieval diagnostics for every grounded response.
- [ ] `PHONE-IND-010` Prefer live structured systems for inventory, availability, price, booking, and customer facts.
- [ ] `PHONE-IND-011` Implement runtime action-policy decisions: allow, confirm, handoff, and deny.
- [ ] `PHONE-IND-012` Audit policy inputs, decisions, tool calls, confirmations, failures, and handoffs.
- [ ] `PHONE-IND-013` Build the industry setup, readiness, knowledge approval, and change-preview administration UI.
- [ ] `PHONE-IND-014` Build a test-call sandbox showing transcript, sources, policy decisions, and tool results.
- [ ] `PHONE-IND-015` Create the first complete automotive dealer industry template.
- [ ] `PHONE-IND-016` Support stock ID, VIN, vehicle, location, and campaign attribution matching for automotive calls.
- [ ] `PHONE-IND-017` Add automotive sales, test-drive, trade-in, service, parts, and dealership routing intents.
- [ ] `PHONE-IND-018` Enforce automotive finance, valuation, pricing, delivery, discount, and availability boundaries.
- [ ] `PHONE-IND-019` Build normal, ambiguous, adversarial, emergency, privacy, outage, and handoff evaluation suites per industry.
- [ ] `PHONE-IND-020` Require named business approval and evaluation thresholds before enabling each location.
- [ ] `PHONE-IND-021` Monitor knowledge freshness, unanswered intents, unsafe attempts, handoffs, costs, lead conversion, and booking integrity.
- [ ] `PHONE-IND-022` Convert reviewed production failures into regression evaluation cases.

## Automotive reference architecture adoption

- [ ] `AUTO-RND-001` Define the trusted `ExecutionContext` used by HTTP, jobs, webhooks, AI tools, mobile, and MCP.
- [ ] `AUTO-RND-002` Ensure models and external callers cannot select tenant or location scope when identity can provide it.
- [ ] `AUTO-RND-003` Define canonical CRM, product-interest, immutable product-snapshot, conversation, handoff, consent, and attribution records.
- [ ] `AUTO-RND-004` Define the generic product-catalog adapter and automotive vehicle-feed adapter.
- [ ] `AUTO-RND-005` Implement vehicle matching by signed product ID, provider ID, stock number, VIN, URL, and controlled fuzzy fallback.
- [ ] `AUTO-RND-006` Implement a schema-versioned canonical event envelope with correlation, causation, browser, provider, and idempotency identifiers.
- [ ] `AUTO-RND-007` Implement a transactional outbox, independent delivery attempts, retry classification, dead-letter handling, replay, and reconciliation.
- [ ] `AUTO-RND-008` Centralize consent-to-destination policy rather than copying rules across producers and consumers.
- [ ] `AUTO-RND-009` Implement per-destination configuration, health, circuit breaker, kill switch, and failure isolation.
- [ ] `AUTO-RND-010` Implement the stateful handoff lifecycle with queue ownership, SLA, acknowledgement, escalation, resolution, and CRM outcome.
- [ ] `AUTO-RND-011` Make lead claiming and assignment atomic at the server boundary.
- [ ] `AUTO-RND-012` Define versioned web and mobile API contracts and mobile-specific authentication and offline behavior.
- [ ] `AUTO-RND-013` Implement generated knowledge as draft content with source attribution, approval, precedence, freshness, and publication controls.
- [ ] `AUTO-RND-014` Implement entitlement check, usage reservation, execution, actual-cost recording, reconciliation, and limit enforcement.
- [ ] `AUTO-RND-015` Separate provider cost, customer usage, billable quantity, margin, credits, and invoice state.
- [ ] `AUTO-RND-016` Define signed service boundaries and scoped secret/readiness checks for telephony, tracking, workflows, feeds, and bulk jobs.
- [ ] `AUTO-RND-017` Preserve product and campaign context through lead, opportunity, handoff, appointment, communication, and sale.
- [ ] `AUTO-RND-018` Implement automotive sales, test-drive, trade-in, service, parts, finance, and fleet workflow modules.
- [ ] `AUTO-RND-019` Add feed freshness, matching confidence, unmatched-product, delivery-failure, handoff-SLA, and usage-anomaly monitoring.
- [ ] `AUTO-RND-020` Review each imported pattern against the adoption decision matrix before implementation approval.

## Automotive marketplace data integration

- [ ] `MKT-DATA-001` Approve the marketplace and CRM system-of-record matrix.
- [ ] `MKT-DATA-002` Define explicit CRM mappings for marketplace seller, dealer, and location identities.
- [ ] `MKT-DATA-003` Define versioned vehicle identity, vehicle snapshot, taxonomy, market signal, match result, and feed health schemas.
- [ ] `MKT-DATA-004` Define provenance, freshness, quality, visibility, licensing, consent, and retention metadata for shared fields.
- [ ] `MKT-DATA-005` Implement service authentication, signatures, replay protection, schema versioning, idempotency, and key rotation.
- [ ] `MKT-DATA-006` Implement vehicle resolution by marketplace ID, source listing, seller-scoped stock number, VIN, URL, and reviewed fallback.
- [ ] `MKT-DATA-007` Store an immutable vehicle snapshot for each lead and product interest while retaining the live marketplace reference.
- [ ] `MKT-DATA-008` Add current inventory status, price, location, source update, feed success, quality, and warning fields to CRM product cards.
- [ ] `MKT-DATA-009` Implement marketplace vehicle, taxonomy, similar-vehicle, market-signal, price-history, and feed-health API clients.
- [ ] `MKT-DATA-010` Implement automotive vehicle-change and feed-health event subscriptions with durable delivery evidence and reconciliation.
- [ ] `MKT-DATA-011` Preserve lead capture and display the last known snapshot when marketplace services are unavailable.
- [ ] `MKT-DATA-012` Block availability promises, bookings, valuation claims, and transactional actions when required source data is stale.
- [ ] `MKT-DATA-013` Add explainable alternative-vehicle matching with hard constraints, factor scores, confidence, freshness, and feedback.
- [ ] `MKT-DATA-014` Import explicit and inferred marketplace preference signals with source, purpose, consent, confidence, expiry, and provenance.
- [ ] `MKT-DATA-015` Keep CRM identity canonical and implement governed links to marketplace users and anonymous profiles.
- [ ] `MKT-DATA-016` Implement price and market intelligence display with methodology, comparables, geography, confidence, expiry, and disclaimers.
- [ ] `MKT-DATA-017` Add feed lag, count divergence, identity conflict, price anomaly, and enrichment regression monitoring.
- [ ] `MKT-DATA-018` Add product context, alternatives, feed warnings, and match explanations to web and mobile lead workflows.
- [ ] `MKT-DATA-019` Add read-only, tenant-scoped automotive product tools for receptionist, copilots, and approved MCP clients.
- [ ] `MKT-DATA-020` Return purpose-limited lead, appointment, qualified, won, and sale outcomes to marketplace analytics.
- [ ] `MKT-DATA-021` Add demand-versus-stock and campaign-to-sale reporting by vehicle, taxonomy cohort, location, and market.
- [ ] `MKT-DATA-022` Prohibit direct CRM writes to marketplace databases and direct marketplace writes to CRM databases.
- [ ] `MKT-DATA-023` Review data-source licenses for VIN, registration, specifications, valuation, images, behavioral signals, AI, MCP, and advertising use.
- [ ] `MKT-DATA-024` Validate international market, currency, units, timezone, tax, terminology, and disclosure behavior.

## 360 Persona identity and activation

- [ ] `ID360-001` Approve Persona terminology and distinguish customer Personas from AI personas, audiences, cookies, and CRM IDs.
- [ ] `ID360-002` Complete the identity data inventory, system-of-record matrix, privacy impact assessment, and permitted-purpose matrix.
- [ ] `ID360-003` Define client, motor-group, marketplace, and operational identity namespaces.
- [ ] `ID360-004` Prohibit cross-client resolution by default and require explicit group governance and approval.
- [ ] `ID360-005` Define private platform subject, tenant Persona, group Persona, anonymous, local subject, identifier, trait, segment, and activation contracts.
- [ ] `ID360-006` Implement trusted namespace and purpose context for HTTP, events, jobs, tracking, webhooks, mobile, AI, MCP, and activation workers.
- [ ] `ID360-007` Implement Persona profiles, encrypted identifiers, versioned HMAC tokens, local mappings, evidence edges, and resolution decisions.
- [ ] `ID360-008` Define verified, deterministic, corroborating, and probabilistic evidence classes.
- [ ] `ID360-009` Restrict automatic linking to approved verified or deterministic evidence.
- [ ] `ID360-010` Prevent device, session, IP, user agent, fingerprint, or behavioral evidence from auto-merging known people.
- [ ] `ID360-011` Implement candidate, conflict, manual-review, merge, split, alias, redirect, and rollback workflows.
- [ ] `ID360-012` Retain pre-merge snapshots and propagate merge and split events idempotently to projections.
- [ ] `ID360-013` Implement the versioned Persona identify API and local application mapping contract.
- [ ] `ID360-014` Add first-party website `identify()` support without covert fingerprinting.
- [ ] `ID360-015` Link browser submission, confirmed provider lead, canonical CRM person, attribution, and product interest deterministically.
- [ ] `ID360-016` Import marketplace explicit preferences with source, purpose, consent, time, confidence, and expiry.
- [ ] `ID360-017` Add reviewed inferred marketplace traits without overriding explicit customer facts.
- [ ] `ID360-018` Add platform-scoped social subject mappings and prohibit engagement-only person merges.
- [ ] `ID360-019` Link social lead ads, DMs, comments, campaigns, CRM leads, and lifecycle outcomes through provider event evidence.
- [ ] `ID360-020` Define granular purposes for service delivery, analytics, personalization, communications, social, advertising, group sharing, AI, and MCP.
- [ ] `ID360-021` Implement versioned consent evidence, withdrawal, suppression, source disclosure, correction, export, retention, and deletion workflows.
- [ ] `ID360-022` Define versioned segment rules, provenance, expiry, prohibited traits, minimum cohort size, destination eligibility, and approvals.
- [ ] `ID360-023` Store segment membership separately from Persona profiles with entry, refresh, exit, suppression, and export history.
- [ ] `ID360-024` Build immutable activation snapshots and an isolated destination normalization and hashing worker.
- [ ] `ID360-025` Implement Google, Meta, and TikTok destination-specific policy, consent, API, expiry, removal, and reconciliation behavior.
- [ ] `ID360-026` Ensure provider match rates and audience membership never become internal identity evidence.
- [ ] `ID360-027` Use canonical event IDs for browser/server conversion deduplication independently of Persona IDs.
- [ ] `ID360-028` Add opt-out and deletion propagation to communication channels and advertising destinations.
- [ ] `ID360-029` Add Persona timeline, provenance, resolution diagnostics, conflicts, and authorized corrections to CRM administration.
- [ ] `ID360-030` Add social response priority, campaign feedback, lifecycle suppression, and frequency monitoring.
- [ ] `ID360-031` Expose only redacted, purpose-filtered Persona projections to AI, mobile, and MCP.
- [ ] `ID360-032` Keep merge, split, activation, export, and deletion as approval-gated AI and MCP actions.
- [ ] `ID360-033` Add identity quality, collision, false-merge, rollback, provenance, consent, suppression, activation, and leakage monitoring.
- [ ] `ID360-034` Add cross-tenant canary identities and automated leakage alerts.
- [ ] `ID360-035` Complete jurisdiction and provider-policy review before each market or destination launch.

## Federated 360 Persona pool and lakehouse

- [ ] `LAKE360-001` Inventory local Persona IDs, anonymous IDs, cookies, identity rules, events, audiences, consent, and retention across linked applications.
- [ ] `LAKE360-002` Approve application, tenant, motor-group, marketplace, and operational namespace ownership.
- [ ] `LAKE360-003` Define local Persona to tenant Persona mapping without replacing application-owned identifiers.
- [ ] `LAKE360-004` Separate identity control plane, operational Persona projection, event transport, lakehouse, features, segments, and activation planes.
- [ ] `LAKE360-005` Define and version the shared application event envelope and schema compatibility policy.
- [ ] `LAKE360-006` Implement signed application registration, ingestion authentication, replay protection, idempotency, and receipt evidence.
- [ ] `LAKE360-007` Implement schema, purpose, consent, time-skew, namespace, payload-size, PII, and prohibited-field validation.
- [ ] `LAKE360-008` Route identity evidence independently from analytical event ingestion.
- [ ] `LAKE360-009` Create immutable raw, quarantine, normalized, identity-resolved, feature, segment, activation, and quality zones.
- [ ] `LAKE360-010` Keep raw PII, private messages, transcripts, recordings, and provider secrets outside general lake tables.
- [ ] `LAKE360-011` Implement a separately encrypted identity and restricted-content vault.
- [ ] `LAKE360-012` Implement versioned Persona resolution projections; prohibit lake-side independent identity guessing.
- [ ] `LAKE360-013` Preserve unresolved and candidate events without forced Persona linkage.
- [ ] `LAKE360-014` Make merge and split analytical projections point-in-time reproducible without rewriting raw history.
- [ ] `LAKE360-015` Define canonical website, automotive, marketplace, social, campaign, communication, CRM lifecycle, consent, and identity event families.
- [ ] `LAKE360-016` Define point-in-time feature contracts with source range, confidence, quality, purpose, consent, expiry, and model/rule version.
- [ ] `LAKE360-017` Implement incremental feature updates and complete reconciliation rebuilds.
- [ ] `LAKE360-018` Implement immutable segment membership and activation manifest snapshots.
- [ ] `LAKE360-019` Add lineage from source event through Persona mapping, feature, segment, activation, and report.
- [ ] `LAKE360-020` Keep operational Persona APIs and consent/suppression authorization on PostgreSQL projections.
- [ ] `LAKE360-021` Ensure lakehouse outages cannot block leads, calls, messages, appointments, opt-outs, or activation removals.
- [ ] `LAKE360-022` Implement event, schema, identity, feature, segment, activation, deletion, cost, and cross-tenant observability.
- [ ] `LAKE360-023` Implement application correction, consent, merge, split, and deletion propagation contracts.
- [ ] `LAKE360-024` Include lake objects, table snapshots, compaction, backups, and destination exports in deletion verification.
- [ ] `LAKE360-025` Pilot R2 immutable event storage behind a replaceable `LakeSink` contract.
- [ ] `LAKE360-026` Pilot Parquet/Iceberg for one non-sensitive event family after schema and replay contracts are stable.
- [ ] `LAKE360-027` Evaluate Cloudflare Pipelines, R2 Data Catalog, and R2 SQL without making beta services a live identity dependency.
- [ ] `LAKE360-028` Validate partitioning, compaction, schema evolution, query performance, cost, export, and fallback before expansion.
- [ ] `LAKE360-029` Publish purpose-filtered Persona summaries and segments back to each linked application.
- [ ] `LAKE360-030` Require a one-client, one-segment, one-destination activation pilot before broader automation.

## Shared industry trends and crossover intelligence

- [ ] `TREND360-001` Define the shared industry taxonomy for industries, products, services, markets, geographies, and crossover relationships.
- [ ] `TREND360-002` Define client contribution consent and tenant-level opt-in for portfolio benchmarking.
- [ ] `TREND360-003` Define minimum client, Persona, event, lead, and conversion cohort thresholds.
- [ ] `TREND360-004` Implement suppression rules for sparse cohorts, outliers, rankings, and commercially identifying values.
- [ ] `TREND360-005` Create the canonical versioned trend signal contract with provenance, confidence, freshness, and warnings.
- [ ] `TREND360-006` Add methodology versioning and release audit records for every benchmark and composite index.
- [ ] `TREND360-007` Create a provider adapter for official Google Trends API alpha access.
- [ ] `TREND360-008` Add Google Trends public BigQuery top and rising query ingestion where appropriate.
- [ ] `TREND360-009` Mark the existing SerpAPI Trends path as a licensed third-party fallback with source and cost metadata.
- [ ] `TREND360-010` Cache raw external provider responses and normalized observations with query definitions and date ranges.
- [ ] `TREND360-011` Remove fixed trend forecast multipliers from production recommendation logic.
- [ ] `TREND360-012` Backtest trend forecasts against marketplace, confirmed lead, qualified lead, appointment, sale, and revenue outcomes.
- [ ] `TREND360-013` Aggregate marketplace searches, views, saves, comparisons, inquiries, inventory, prices, and days on market.
- [ ] `TREND360-014` Aggregate social topic volume, velocity, sentiment, content format, and share of voice without profile leakage.
- [ ] `TREND360-015` Aggregate opted-in client campaign, website, funnel, CRM, and revenue metrics into privacy-safe cohorts.
- [ ] `TREND360-016` Replace vague seeded external benchmarks with sourced, dated, licensed, methodology-versioned values.
- [ ] `TREND360-017` Add internal percentile bands with cohort dimensions, denominators, robust outlier handling, and suppression.
- [ ] `TREND360-018` Create Search Interest, Marketplace Demand, Inventory Pressure, Social Momentum, Campaign Efficiency, Lead Quality, and Conversion Velocity indices.
- [ ] `TREND360-019` Create explainable Crossover Opportunity Scores with component weights and evidence.
- [ ] `TREND360-020` Require multi-source corroboration for material crossover and budget recommendations.
- [ ] `TREND360-021` Implement the opportunity lifecycle from observation through approval, activation, measurement, and expiry.
- [ ] `TREND360-022` Build an agency portfolio trend explorer with cohort-health and source-quality controls.
- [ ] `TREND360-023` Build client portal market-demand, peer-range, emerging-topic, inventory, and crossover surfaces.
- [ ] `TREND360-024` Display sample size, source, freshness, confidence, limitations, and observed/computed/forecast labels.
- [ ] `TREND360-025` Restrict opportunity activation to the requesting tenant's own eligible, consented Personas.
- [ ] `TREND360-026` Add approval gates for campaign budget, audience activation, CRM workflow, and outbound contact actions.
- [ ] `TREND360-027` Expose only released aggregate trends through AI and MCP tools with tenant and field-level authorization.
- [ ] `TREND360-028` Add alerts for stale sources, cohort collapse, attribution loss, taxonomy failures, abnormal variance, and forecast drift.
- [ ] `TREND360-029` Measure recommendation acceptance, incremental outcomes, forecast calibration, and privacy suppressions.
- [ ] `TREND360-030` Keep the intelligence lake and beta data infrastructure off the critical CRM, consent, lead-capture, and activation paths.

### Vehicle listing lifecycle intelligence

- [ ] `TREND360-031` Define canonical active, reserved, confirmed-sold, inferred-sold, withdrawn, expired, transferred, relisted, and unknown listing states.
- [ ] `TREND360-032` Ingest listing episodes with first-observed, first-advertised, last-observed, sold, withdrawn, and relisted timestamps.
- [ ] `TREND360-033` Preserve initial price, last advertised price, price-change events, and advertised reduction without mislabelling advertised price as transaction price.
- [ ] `TREND360-034` Record sale evidence, source, confidence, and methodology and prohibit delisting-only records from becoming confirmed sales.
- [ ] `TREND360-035` Resolve vehicles across listing IDs, stock IDs, VIN hashes, relists, and dealer transfers while retaining episode history.
- [ ] `TREND360-036` Calculate current inventory age, median and percentile days-to-sale, windowed sell-through, and stage velocity with cohort sample sizes.
- [ ] `TREND360-037` Use right-censored time-to-event analysis so active vehicles contribute correctly to time-to-sale forecasting.
- [ ] `TREND360-038` Join tenant-owned vehicle interactions, inquiries, leads, appointments, opportunities, and confirmed sales for campaign-to-sale attribution.
- [ ] `TREND360-039` Release only thresholded vehicle demand, supply, aging, pricing, and sell-through cohorts to shared industry intelligence.
- [ ] `TREND360-040` Add aged-stock, fast-selling supply-gap, acquisition, trade-in, pricing, and campaign crossover recommendations with human approval.

## Automotive news, knowledge graph, and marketing intelligence

- [ ] `NEWS360-001` Register each automotive news MCP source with server/tool identity, authentication, owner, jurisdiction, trust tier, and independence group.
- [ ] `NEWS360-002` Record source licence, retention, quotation, summarisation, embedding, and commercial-use permissions.
- [ ] `NEWS360-003` Add fetch-run audits, source health, rate limits, response limits, timeouts, redirect allowlists, and replay protection.
- [ ] `NEWS360-004` Preserve append-only document versions with canonical URL, content hash, published, modified, retrieved, superseded, corrected, and retracted timestamps.
- [ ] `NEWS360-005` Cluster canonical, duplicate, and syndicated stories across MCP sources and publishers.
- [ ] `NEWS360-006` Classify language, geography, automotive taxonomy, source type, sponsored content, reporting, opinion, forecast, and rumour.
- [ ] `NEWS360-007` Extract constrained OEM, make, model, variant, technology, supplier, regulator, geography, and product entities.
- [ ] `NEWS360-008` Extract time-bound launch, price, incentive, availability, recall, supply, registration, policy, technology, and competitor events.
- [ ] `NEWS360-009` Store normalized claims with evidence spans, original source, reporting source, effective dates, confidence, and methodology version.
- [ ] `NEWS360-010` Link corroborating, contradicting, corrected, and retracted claims and calculate source independence.
- [ ] `NEWS360-011` Create observed, attributed, corroborated, primary-confirmed, and canonical evidence tiers.
- [ ] `NEWS360-012` Enforce allowed uses by evidence tier for research, organic drafts, client-facing claims, paid ads, and operational knowledge.
- [ ] `NEWS360-013` Build a temporal evidence-backed automotive knowledge graph with release and tenant classifications on every edge.
- [ ] `NEWS360-014` Pilot GraphRAG local retrieval for make, model, competitor, geography, regulation, and event histories.
- [ ] `NEWS360-015` Pilot GraphRAG global retrieval for whole-market themes and community summaries.
- [ ] `NEWS360-016` Add temporal drift retrieval for changing themes, claims, sentiment, and event velocity.
- [ ] `NEWS360-017` Add crossover retrieval joining released news signals to Google Trends, marketplace, registrations, inventory, campaigns, website behavior, and CRM outcomes.
- [ ] `NEWS360-018` Keep AI summaries and graph community reports derivative and citation-linked rather than canonical facts.
- [ ] `NEWS360-019` Create explainable topic momentum, launch attention, policy impact, supply disruption, pricing pressure, reputation risk, competitor activity, and technology adoption signals.
- [ ] `NEWS360-020` Require independent corroboration for material client, inventory, budget, or paid-media recommendations.
- [ ] `NEWS360-021` Add client relevance using approved brands, geography, audience, content pillars, exclusions, commercial package, and source policy.
- [ ] `NEWS360-022` Build cited agency market briefings, competitor timelines, emerging-theme views, and source-quality controls.
- [ ] `NEWS360-023` Build client-facing insights that expose evidence, confidence, freshness, limitations, and correction status.
- [ ] `NEWS360-024` Reuse released news records in the social inbox while keeping the knowledge graph as the evidence system of record.
- [ ] `NEWS360-025` Require editorial selection, editing, approval, and scheduling for all organic content.
- [ ] `NEWS360-026` Require inventory, offer, price, geography, landing-page, legal, and advertising-policy validation before paid activation.
- [ ] `NEWS360-027` Add elevated review for recall, safety, political, financial, disputed, sensational, and sponsored claims.
- [ ] `NEWS360-028` Prevent news from overriding canonical inventory, product, offer, DMS, CRM, regulator, or operating-hours data.
- [ ] `NEWS360-029` Restrict CRM and receptionist use to approved talking points and tenant-owned consented outreach.
- [ ] `NEWS360-030` Treat MCP resources and content as untrusted and prevent prompt instructions, credentials, internal prompts, or tenant data crossing into the source.
- [ ] `NEWS360-031` Separate read-only news ingestion credentials from publishing, advertising, CRM, and activation credentials.
- [ ] `NEWS360-032` Measure citation completeness, extraction precision, correction propagation, recommendation acceptance, policy blocks, latency, and cost.
- [ ] `NEWS360-033` Run controlled experiments to measure incremental content, qualified-lead, appointment, and sale outcomes.
- [ ] `NEWS360-034` Add alerts for source failure, abnormal volume, injection attempts, stale evidence, retractions, taxonomy drift, and unsupported activation proposals.
- [ ] `NEWS360-035` Complete privacy, licensing, security, and advertising-policy review before production activation.

## 360 intelligence push-pull analytics

- [x] `PULL360-001` Define hot, warm, and cold push paths for behavioral, campaign, CRM, marketplace, inventory, news, and trend observations.
- [x] `PULL360-002` Define source authority for first-party behavior, GA4, confirmed leads, CRM lifecycle, inventory, and knowledge context.
- [x] `PULL360-003` Define tenant identity, behavioral event, commercial outcome, shared intelligence, and projection planes.
- [x] `PULL360-004` Add a tenant-scoped page, device, and source behavioral outcomes API without live provider calls.
- [x] `PULL360-005` Join website form intent to confirmed lead outcomes through the shared browser event ID.
- [x] `PULL360-006` Keep provider-native leads without a website journey out of page and device behavior rows.
- [x] `PULL360-007` Add the initial portal behavior explorer with engagement, intent, confirmed, qualified, and won outcomes.
- [ ] `PULL360-008` Add cross-dimension page, device, source, campaign, geography, product, and vehicle filters.
- [ ] `PULL360-009` Add entry, next-page, exit, repeated-view, and common journey sequence projections.
- [ ] `PULL360-010` Add form-start, abandonment, field-error, and submission-latency metrics without storing raw form PII.
- [ ] `PULL360-011` Add product SKU, vehicle stock ID, listing, and inventory-state associations.
- [ ] `PULL360-012` Add campaign, ad group/ad set, ad, creative, keyword, and landing-page associations.
- [ ] `PULL360-013` Add appointment, sale, value, response-time, and stage-velocity outcomes.
- [ ] `PULL360-014` Build GA4 versus first-party reconciliation with explicit coverage and discrepancy reasons.
- [ ] `PULL360-015` Normalize page, source, medium, campaign, device, geography, and product taxonomy across providers.
- [ ] `PULL360-016` Move high-volume behavior queries to incrementally refreshed hourly and daily projections.
- [ ] `PULL360-017` Add projection freshness, authority, coverage, exclusion, and methodology metadata to every response.
- [ ] `PULL360-018` Attach released news, Google Trends, marketplace, inventory, benchmark, and crossover associations.
- [ ] `PULL360-019` Build evidence drawers with citations, confidence, sample size, geography, time window, and warnings.
- [ ] `PULL360-020` Add privacy suppression for sparse cohorts and prevent cross-client Persona or event exposure.
- [ ] `PULL360-021` Add deterministic insight generation before introducing generative explanations.
- [ ] `PULL360-022` Add AI explanations that retrieve only released evidence and authorized tenant projections.
- [ ] `PULL360-023` Add draft experiment and campaign recommendations with inventory, offer, policy, and approval gates.
- [ ] `PULL360-024` Expose read-only analytics projections through authorized MCP resources.
- [ ] `PULL360-025` Add equivalent mobile analytics and insight surfaces.
- [ ] `PULL360-026` Feed approved activation and measured outcomes back into the lakehouse.
- [ ] `PULL360-027` Track query latency, projection freshness, linkage coverage, reconciliation quality, and recommendation lift.
- [ ] `PULL360-028` Add source-staleness, projection-failure, linkage-loss, taxonomy-drift, and cohort-suppression alerts.

## ADME Studio automotive campaign intelligence

- [ ] ADME360-001 to ADME360-006: approve provider, provenance, isolation, and MCP security contracts.
- [ ] ADME360-010 to ADME360-015: ship the canonical evidence projection and reuse it in social publishing.
- [ ] ADME360-020 to ADME360-025: ship shared trend features, caching, and provider health.
- [ ] ADME360-030 to ADME360-035: ship isolated tenant projections across inventory, behavior, campaigns, and CRM.
- [ ] ADME360-040 to ADME360-046: ship read-only recommendation surfaces and mandatory validation checks.
- [ ] ADME360-050 to ADME360-054: ship approval, expiry, and activation traceability.
- [ ] ADME360-060 to ADME360-065: ship outcome feedback, privacy-safe learning, and monitoring.
- [ ] ADME360-070 to ADME360-075: expand with trends, marketplace, product feed, personas, experiments, and client MCP access.

Detailed tasks: `docs/prd/crm-adme-studio-automotive-campaign-intelligence-tasks.md`.
