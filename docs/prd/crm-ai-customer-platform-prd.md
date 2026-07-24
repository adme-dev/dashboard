# XeroFlow CRM, Communications and AI Customer Platform PRD

Status: Draft for implementation
Owner: XeroFlow Product and Engineering
Last updated: 2026-07-24
Companion checklist: `docs/prd/crm-ai-customer-platform-implementation-checklist.md`
Communications comparison:
`docs/prd/crm-ai-communications-provider-comparison.md`
External AI and MCP access:
`docs/prd/crm-ai-external-mcp-access.md`
Incremental delivery backlog:
`docs/prd/crm-ai-incremental-delivery-task-list.md`
AI phone receptionist rollout:
`docs/prd/crm-ai-phone-receptionist-rollout.md`

## 1. Executive summary

XeroFlow will extend its existing lead capture, campaign analytics, website
tracking and client portal capabilities into a multi-tenant customer
relationship management platform.

The platform must support three progressively richer operating models:

1. Capture and attribute leads, then deliver them to another system.
2. Capture leads and manage a lightweight sales pipeline in XeroFlow.
3. Operate a full CRM with communications, automation and an AI receptionist.

The CRM must be designed for AI from the beginning. AI is not a separate chat
feature attached to the UI. It is an auditable actor that can read approved
customer context and execute permission-controlled CRM tools.

All paid CRM, communications and AI capabilities must be controlled by
server-side entitlements and measured through an immutable usage ledger.
Lead capture must continue when a paid CRM or AI subscription is suspended so
that customers do not lose enquiries because of a billing problem.

## 2. Product vision

Provide agencies and their clients with one operational system that connects:

- Paid and non-paid marketing activity.
- Website behavior and form submissions.
- Platform-native lead ads.
- The existing dealer mobile application.
- Confirmed provider leads.
- Contacts and distinct sales opportunities.
- Calls, SMS, email, appointments and tasks.
- Human, automation and AI activity.
- Pipeline outcomes and revenue.
- Campaign attribution and cost-per-outcome reporting.
- Subscription access, consumption and agency margin.

The result should show not only how a campaign performed, but what happened to
each lead after it was generated and what business outcome it produced.

## 3. Reference architecture and prior research

This PRD incorporates the CRM research discussed for the XeroFlow portal and
the architectural ideas identified in:

`/Users/paulgiurin/Documents/GitHub/toyota-theme-nuxt`

That project is a reference for patterns around AI, voice, Twilio, SMS,
receptionist workflows, email/SMTP and customer communications. Its code must
be inspected and adapted before reuse. XeroFlow should extract
provider-independent contracts and services rather than copy application-
specific implementation directly.

The current XeroFlow lead, tracking, analytics and portal implementation is the
foundation for this product. Existing capabilities must be verified against
the acceptance criteria in this PRD before they are marked complete.

## 4. Problem statement

XeroFlow currently has multiple paths that can identify a lead:

- Website interaction tracking.
- Website form submissions.
- Confirmed website provider webhooks.
- Meta platform-native lead forms.
- Potential Google platform-native lead forms.
- Manual CRM entry.
- Imports and future external CRM webhooks.

Without a canonical CRM model, these signals can become duplicate leads,
unmatched submissions or disconnected analytics records. Customers also lack
a consistent operating workflow for assignment, response, qualification,
appointment management and sales outcomes.

Communications and AI add variable provider costs. Without entitlements,
preflight checks and usage reconciliation, XeroFlow cannot safely package or
price those features.

## 5. Goals

### 5.1 Primary goals

- Capture every supported lead source without double-counting.
- Maintain one customer identity with multiple legitimate opportunities.
- Preserve complete first-touch and last-touch attribution.
- Give staff an operational pipeline and unified customer timeline.
- Support lead assignment, response SLAs and escalation.
- Add two-way SMS, email, voice and appointment workflows.
- Allow AI to qualify, respond, schedule and hand off safely.
- Feed qualified, won and lost outcomes back into marketing analytics.
- Enforce subscriptions and entitlements on the server.
- Measure provider cost, customer price and agency margin.
- Support capture-only, internal CRM and external CRM operating modes.

### 5.2 Success outcomes

- Fewer unmatched website submissions.
- No duplicate CRM records caused by webhook retries.
- Higher attribution coverage for confirmed leads.
- Reduced median first-response time.
- Measurable conversion from lead to qualified, appointment and won.
- Reliable cost-per-qualified-lead and cost-per-sale reporting.
- No unmetered paid AI or communications activity.
- No loss of lead capture during billing suspension.

## 6. Non-goals for the first release

- Replacing specialist enterprise contact-center platforms.
- Building a general-purpose ERP.
- Supporting every telephony or email provider in the first release.
- Fully autonomous AI sales decisions without configurable approval rules.
- Automatically merging contacts using probabilistic identity alone.
- Migrating every feature from the Toyota reference project.
- Defining final package prices in code.

## 7. Users and roles

### 7.1 Agency owner or super administrator

- Configures client CRM mode, plans, entitlements and markups.
- Connects providers and manages shared infrastructure.
- Defines client-level routing and AI policies.
- Reviews usage, margin, health and audit records.
- Can access a client portal through authorized agency access.

### 7.2 Client administrator

- Configures teams, stages, assignments and business hours.
- Manages templates, automations and AI behavior within entitlements.
- Reviews lead and communication performance.

### 7.3 Sales manager

- Reviews queues, SLA breaches, assignments and pipeline performance.
- Reassigns work and manages escalations.
- Reviews AI handoffs and exceptions.

### 7.4 Sales or service user

- Works assigned contacts, opportunities, tasks and conversations.
- Sends approved communications.
- Records outcomes and appointments.
- Uses the web portal or dealer mobile application with the same permissions
  and CRM state.

### 7.5 AI receptionist

- Operates as a named, auditable system actor.
- Uses only the tools, data and channels allowed for the client.
- Escalates to a human based on policy, confidence or customer request.

### 7.6 Customer or lead

- Submits an enquiry through a supported source.
- Receives communications only with appropriate consent.
- Can opt out or request human assistance.

## 8. CRM operating modes

Each client must have an agency-controlled `crm_mode`.

### 8.1 Capture only

- Capture, deduplicate, attribute and reconcile leads.
- Deliver leads to configured destinations.
- Do not create internal CRM opportunities unless required for delivery
  tracking.

### 8.2 Capture plus lightweight CRM

- Create contacts and opportunities.
- Provide pipeline, assignment, tasks, notes and basic communications.
- Limit advanced automation and AI according to entitlements.

### 8.3 Full CRM

- Enable complete pipeline, communications, automations, AI tools, lifecycle
  feedback and advanced reporting.

### 8.4 External CRM delivery

- Keep XeroFlow as the capture, attribution and delivery control plane.
- Push canonical leads and updates to an external CRM.
- Store delivery status and external identifiers.
- Reconcile lifecycle outcomes returned by webhook or scheduled sync.

Providers must never control whether a client uses XeroFlow CRM. Request-level
flags such as `promote_to_crm` must not override the agency-controlled client
setting.

## 9. Canonical identity and lead model

### 9.1 Submission identity

Every website submission must receive a stable `browser_event_id` before the
form is sent. That identifier must be:

- Stored with the website tracking event.
- Injected into the form payload where technically possible.
- Passed through provider integrations where supported.
- Returned through the confirmation webhook where supported.
- Used as the strongest join between behavior, attribution and the confirmed
  lead.

When the identifier cannot be returned, XeroFlow may use a bounded,
privacy-conscious reconciliation fingerprint based on normalized contact
fields, form context and time proximity. A fingerprint is a fallback, not a
replacement for a shared identifier.

### 9.2 Confirmed-success tracking

- `form_submit` represents intent.
- `generate_lead` represents provider-confirmed acceptance.
- Platform-native lead webhooks may create a confirmed lead directly.
- A browser-side form event must not be counted as a confirmed lead unless the
  provider confirms success.

### 9.3 Contact identity

Contacts are reused using deterministic normalized identifiers:

- Email.
- Phone number.
- Verified external customer identifiers.

Potential matches must be surfaced for review when deterministic matching is
not safe.

### 9.4 Opportunity identity

A contact may have multiple opportunities. Separate opportunities must be
retained for genuinely different enquiries, including different vehicles,
products, locations or materially different submission times.

### 9.5 Webhook idempotency

- Provider retries must be deduplicated using a stable provider event or lead
  identifier.
- Every inbound webhook must have an idempotency record.
- A replay must return the previously established result without creating a
  duplicate contact, opportunity or usage event.

### 9.6 Product and vehicle inquiry matching

XeroFlow must support clients that publish products through an API, inventory
feed or dealer vehicle feed. When a person enquires about a product, the
confirmed lead and CRM opportunity must be matched to the correct inventory
record.

Vehicles are the first product type, but the domain model must remain generic
enough to support other client product catalogs.

The preferred identifiers are:

1. XeroFlow canonical product ID.
2. Client SKU or dealer stock ID.
3. Source-system product ID.
4. VIN for a vehicle.
5. Canonical product or vehicle detail URL.
6. A bounded metadata match using make, model, variant, year and location.

The client ID and inventory source are always part of the match boundary. A
stock number from one dealer must never match a product belonging to another
client.

The website tracking and form-injection layer should capture available product
context before submission:

- SKU.
- Stock ID.
- Source product ID.
- VIN where appropriate.
- Product detail URL.
- Product name or vehicle description.
- Make, model, variant and year.
- Price.
- Dealer location.
- Browser event ID.

The provider confirmation webhook and platform-native lead payload should
carry these fields where supported. Reconciliation then attaches the matched
product to the canonical opportunity.

Every inquiry must store:

- The canonical product reference when matched.
- The match method and confidence.
- The raw source identifiers.
- An immutable inquiry-time product snapshot.

The inquiry-time snapshot preserves what the customer saw even if the product
is later sold, removed, repriced or changed in the upstream feed.

An inquiry may reference multiple products. One opportunity may have one
primary product interest and additional related product interests.

## 10. Attribution requirements

The canonical lead and opportunity must retain:

- First-touch source, medium and campaign.
- Last-touch source, medium and campaign.
- UTM parameters.
- Google click identifiers.
- Meta click identifiers.
- Landing page.
- Referrer.
- Campaign ID and name.
- Ad group or ad set ID and name.
- Ad ID and name.
- Creative ID and name.
- Device and relevant geographic context.
- Browser event ID.
- Tracking session ID.
- Attribution confidence and reconciliation method.

Attribution must survive contact reuse and remain specific to each
opportunity.

## 11. Core CRM requirements

### 11.1 Unified customer record

The contact record must include:

- Identity and contact details.
- Communication preferences and consent.
- Assigned owner and team.
- Tags and custom fields.
- Products or vehicles of interest.
- Related opportunities.
- Attribution history.
- Communication and activity timeline.
- External system identifiers.

### 11.2 Opportunity pipeline

Default stages:

1. New.
2. Assigned.
3. Contacted.
4. Qualified.
5. Appointment.
6. Won.
7. Lost.

Clients may configure stage names and ordering while preserving canonical
outcome categories for reporting.

Each opportunity should support:

- Owner and team.
- Pipeline and stage.
- Value and currency.
- Probability.
- Expected close date.
- Product or vehicle context.
- Source and attribution.
- Primary product or vehicle interest.
- Additional product interests.
- Loss reason.
- Outcome timestamps.

### 11.6 Product catalog and inventory

The catalog service must support:

- Client-scoped product sources.
- Scheduled and on-demand feed synchronization.
- API, webhook and file-feed ingestion adapters.
- Source-specific identifiers.
- SKU and stock identifiers.
- Vehicle VIN.
- Product status such as available, reserved, sold, removed or unknown.
- Dealer location and brand.
- Product detail URL and media.
- Price and relevant structured attributes.
- Feed freshness and synchronization health.
- Tombstones for products removed from the current feed.
- Historical snapshots used by prior enquiries.

The catalog must not delete historical inquiry context when inventory changes.
Current availability and inquiry-time state are separate concepts.

Feed synchronization must be idempotent and must not overwrite one client's
inventory with another client's records.

### 11.3 Assignment and routing

Routing must support:

- Round-robin assignment.
- Brand, location, source and enquiry-type rules.
- Business hours.
- Staff availability.
- Overflow queues.
- Manual reassignment.
- Escalation when no owner accepts the lead.

### 11.4 Tasks and appointments

- Follow-up tasks.
- Call reminders.
- Appointment booking.
- Due dates and priorities.
- Assigned users.
- Overdue queues.
- Completion outcomes.
- Calendar integration seam.

### 11.5 Customer timeline

The timeline must provide a chronological record of:

- Website interactions and submissions.
- Provider confirmations.
- Attribution changes.
- Contact and opportunity creation.
- Assignment.
- Notes and tasks.
- Email and SMS.
- Calls, recordings and voicemail.
- Appointments.
- Stage changes.
- Automation activity.
- AI decisions, tool calls and handoffs.
- Delivery to external systems.

## 12. SLA and operational monitoring

The platform must calculate:

- Time to assignment.
- Time to first human or AI response.
- Time in each pipeline stage.
- Lead age.
- Time to appointment.
- Time to outcome.

Rules must support:

- Reminder for an untouched lead.
- Escalation to a manager.
- Reassignment after a configurable threshold.
- Business-hours-aware timers.
- Warning and breach thresholds.

Integration health alerts must cover:

- Website submissions without confirmed leads.
- Provider webhook traffic stopping unexpectedly.
- CRM promotion or external delivery failures.
- Attribution coverage dropping.
- Communications provider failures.
- AI action failure rates.
- Usage or budget thresholds.

## 13. Communications

### 13.1 SMS

- Two-way SMS through a provider adapter.
- Twilio as the initial reference implementation.
- Segment-aware usage metering.
- Delivery and failure webhooks.
- Inbound message threading.
- Templates and merge fields.
- Consent and suppression enforcement.

### 13.2 Email

- Provider-independent email adapter.
- SMTP and API-provider implementation seams.
- Templates and merge fields.
- Threading where supported.
- Delivery, bounce, complaint and reply events.
- Unsubscribe and suppression enforcement.

### 13.3 Voice

- Inbound and outbound calling.
- Twilio as the initial reference implementation.
- Call status webhooks.
- Recording and transcription according to policy.
- Voicemail handling.
- Human transfer and escalation.
- Per-minute and transcription usage metering.

### 13.4 Conversation model

SMS, email and voice must use a shared conversation model:

- Channel.
- Participants.
- Contact and opportunity.
- Assigned user or AI agent.
- Messages or call events.
- Delivery status.
- Consent status.
- AI summary and extracted intent.

### 13.5 Multi-provider communications

XeroFlow must support Twilio and Telnyx behind provider-independent
communications contracts. A client may use one provider for every channel or
use both providers at the same time.

Supported provider strategies:

- One default provider for voice, messaging and numbers.
- Different providers by channel, such as Telnyx voice and Twilio messaging.
- Different providers by client or region.
- Number-bound routing for inbound calls and messages.
- Active-passive failover for new outbound work.
- Controlled migration between providers.

The initial implementation must use explicit routing policy rather than
automatic least-cost switching. Provider selection during an active
conversation can break sender identity, number ownership, webhook ordering
and call continuity.

XeroFlow owns the canonical assistant configuration, tools, CRM state,
conversation history, entitlements and usage ledger. Provider-native
assistant identifiers and configuration are deployment artifacts, not the
source of truth.

The detailed Twilio and Telnyx comparison, Australian pilot criteria and
routing requirements are defined in:

`docs/prd/crm-ai-communications-provider-comparison.md`

## 14. AI architecture

### 14.1 AI as an actor

AI actions must identify:

- Client.
- AI agent configuration.
- Model and version.
- Triggering event.
- Contact, opportunity and conversation.
- Input context references.
- Tool calls.
- Outcome.
- Human approval or handoff.
- Token and provider usage.

### 14.2 AI tools

Initial tool contracts may include:

- `get_contact`.
- `get_opportunity`.
- `list_available_appointments`.
- `send_sms`.
- `send_email`.
- `create_task`.
- `schedule_appointment`.
- `qualify_lead`.
- `update_opportunity_stage`.
- `assign_lead`.
- `handoff_to_human`.
- `get_product`.
- `get_product_availability`.
- `find_product_alternatives`.

Tools must enforce authorization, entitlement, consent, usage and idempotency
inside the server-side tool implementation. Prompt instructions alone are not
security controls.

### 14.3 Human oversight

Each client must configure action modes:

- Suggest only.
- Require approval.
- Automatically execute within policy.
- Disabled.

High-risk or irreversible actions must default to approval until explicitly
enabled.

### 14.4 Client-specific AI configuration

- Brand and business identity.
- Locations and business hours.
- Services, products and vehicle knowledge.
- Tone and language.
- Qualification questions.
- Appointment policies.
- Escalation contacts.
- Prohibited topics and actions.
- Channel-specific behavior.

AI must use catalog tools for current price, stock and availability. It must
not treat the inquiry-time snapshot as proof that a product is still
available. When current inventory is unavailable, AI may suggest matched
alternatives only within the authorized client's catalog and according to
client policy.

### 14.5 AI safety and audit

- Never expose another client's data.
- Record tool inputs and outcomes with sensitive fields protected.
- Detect prompt injection in untrusted customer content.
- Limit tools and context to the active client.
- Apply model and monetary budgets.
- Allow immediate human takeover.
- Retain an auditable reason for automated stage changes.

### 14.5.1 AI phone receptionist isolation

The AI phone receptionist is a separate opt-in product and rollout. Enabling
general CRM, SMS AI, email AI or MCP access must not enable AI call handling.

The phone receptionist requires:

- A dedicated client-scoped feature flag.
- A separate test or pilot number before any existing business number changes.
- Explicit inbound and outbound permissions.
- Client-specific business hours and call-routing policy.
- Human transfer, voicemail and provider-failure fallback.
- Hard concurrent-call, per-call and monthly spending limits.
- Recording and AI disclosure policy.
- Independent provider, model and voice configuration.
- Immediate agency and client kill switches.
- Call-level audit, transcript policy and usage reconciliation.

The first production pilot must be inbound only, information and lead-capture
focused, and unable to perform unrestricted CRM mutations. Appointment or
pipeline changes are introduced only through separately approved tools.

Detailed rollout stages and gates are defined in:

`docs/prd/crm-ai-phone-receptionist-rollout.md`

### 14.6 External LLM and MCP access

Clients may choose to use XeroFlow CRM through their existing AI application,
including ChatGPT, Claude, Groq-backed agents and other MCP-compatible
harnesses.

XeroFlow must expose a protected remote Model Context Protocol server rather
than providing database credentials or provider secrets to an external model.

Supported access modes:

- A human connects XeroFlow to an approved external AI application.
- A client connects its own server-side AI harness.
- XeroFlow's internal AI assistant uses the same underlying CRM service
  contracts without depending on the public MCP transport.

The MCP server must:

- Authenticate users and client applications through an approved OAuth flow.
- Bind every token to the XeroFlow MCP resource and authorized client.
- Apply the same tenant, role, entitlement and consent checks as web and
  mobile.
- Expose allowlisted, versioned tools rather than raw database access.
- Separate read, write, communications and administrative scopes.
- Require approval for configured write or high-impact actions.
- Apply usage authorization before any paid provider action.
- Record the external harness, user, tool, arguments classification, result,
  approval and correlation ID.
- Return the minimum customer data required for the requested task.
- Allow immediate connection and token revocation.

External AI access does not transfer policy ownership to the model provider.
XeroFlow remains authoritative for CRM state, product availability, AI tool
permissions, subscription state, usage and audit.

If a customer supplies its own LLM account, XeroFlow does not meter that
provider's token cost unless XeroFlow proxies the inference request. XeroFlow
still meters MCP access where packaged and all downstream XeroFlow, voice,
messaging, email or other paid actions.

The detailed tool catalog, authorization model, data-egress controls and
acceptance criteria are defined in:

`docs/prd/crm-ai-external-mcp-access.md`

## 15. Automation engine

Automations require:

- Event trigger.
- Conditions.
- Ordered actions.
- Delay or schedule.
- Business-hours behavior.
- Idempotency key.
- Execution state.
- Retry policy.
- Failure and dead-letter handling.
- Audit history.

Initial triggers:

- Lead confirmed.
- Opportunity created.
- Assignment changed.
- Stage changed.
- Message received.
- Appointment changed.
- SLA warning or breach.
- Usage threshold reached.

Initial actions:

- Assign or reassign.
- Add tag.
- Create task.
- Send template.
- Notify user or manager.
- Move stage.
- Invoke an approved AI workflow.
- Deliver to an external CRM.

## 16. Paywall, entitlements and billing

### 16.1 Product packaging

Proposed package families:

- Lead Capture.
- CRM.
- CRM Pro.
- AI Receptionist.
- Usage add-ons.

Final commercial pricing remains a business decision and must be represented
as configuration, not hard-coded application logic.

### 16.2 Entitlements

Entitlements must cover:

- CRM access.
- Number of users.
- Number of pipelines.
- AI receptionist.
- Voice.
- SMS.
- Email.
- Automations.
- Advanced attribution.
- Data retention.
- Reporting and export.

All entitlement checks must occur on the server. Hiding a control in the UI is
not sufficient.

### 16.3 Subscription states

- Trial.
- Active.
- Grace period.
- Usage capped.
- Payment overdue.
- Suspended.
- Cancelled.

Lead capture and safe storage continue in all states. Paid workflow,
communications and AI actions follow the configured subscription policy.

### 16.4 Usage ledger

Every billable action must create an immutable usage record containing:

- Client ID.
- Subscription or billing account.
- Feature and meter.
- Provider.
- Quantity and unit.
- Estimated provider cost.
- Actual provider cost.
- Customer price.
- Agency markup and margin.
- Currency.
- Related contact, opportunity, conversation or job.
- Provider reference.
- Idempotency key.
- Event and reconciliation timestamps.

### 16.5 Metered units

- AI input tokens.
- AI output tokens.
- AI cached tokens when separately priced.
- Voice minutes.
- Transcription minutes.
- SMS segments.
- Email sends.
- Phone number rental.
- Automation executions.
- Recording and file storage.
- Premium data or integration calls where applicable.

### 16.6 Cost authorization

Before a paid action, the platform must:

1. Verify feature entitlement.
2. Verify subscription state.
3. Verify channel consent.
4. Check included allowance.
5. Check client and agency spending limits.
6. Reserve estimated usage.

After completion, the platform must:

1. Record actual provider usage.
2. Reconcile the reservation.
3. Release unused reservation.
4. Calculate overage and markup.
5. Record any provider discrepancy.

### 16.7 Limits and alerts

- Monthly soft limit.
- Monthly hard limit.
- Per-channel limit.
- Per-workflow limit.
- Per-AI-conversation limit.
- Alerts at configurable percentages.
- Agency emergency stop.
- Client-visible remaining allowance.

### 16.8 Billing integrations

Use a billing-provider abstraction for subscriptions and payments. Preserve a
seam for:

- Subscription billing provider.
- Xero consolidated invoicing.
- Agency-managed invoicing.
- Usage export and reconciliation.

Provider webhooks must be idempotent and must not directly grant entitlements
without validating the corresponding product and customer mapping.

## 17. Lead reconciliation dashboard

The client and agency views must show:

- Website form submissions.
- Provider-confirmed leads.
- Platform-native leads.
- CRM-created opportunities.
- External CRM deliveries.
- Unmatched submissions.
- CRM promotion failures.
- Delivery failures.
- Missing browser event IDs.
- Attribution coverage.
- Match method and confidence.

Historic unmatched events may remain unmatched if the source never returned a
shared identifier. The dashboard must distinguish historic limitations from
new integration failures.

## 18. Analytics and closed-loop reporting

Required CRM outcome metrics:

- Leads.
- Assigned leads.
- Contacted leads.
- Qualified leads.
- Appointments.
- Won and lost opportunities.
- Lead-to-qualified conversion rate.
- Lead-to-sale conversion rate.
- Median response time.
- SLA breach rate.
- Opportunity value and won revenue.
- Cost per confirmed lead.
- Cost per qualified lead.
- Cost per appointment.
- Cost per sale.
- Revenue and ROAS by campaign, ad group, ad and creative.
- Enquiries, qualified leads, appointments and sales by SKU or stock ID.
- Inventory age at enquiry.
- Product availability at first response.
- Substitution rate when the original product is unavailable.

Attribution reporting must identify first-touch, last-touch and assisted
channels without combining intent submissions and confirmed leads.

## 19. Proposed domain model

Core records:

- `crm_contacts`
- `crm_contact_identifiers`
- `crm_opportunities`
- `crm_pipelines`
- `crm_pipeline_stages`
- `crm_assignments`
- `crm_activities`
- `crm_tasks`
- `crm_appointments`
- `crm_conversations`
- `crm_messages`
- `crm_calls`
- `crm_notes`
- `crm_tags`
- `crm_automation_definitions`
- `crm_automation_runs`
- `crm_ai_agents`
- `crm_ai_runs`
- `crm_ai_tool_calls`
- `crm_client_settings`
- `mcp_connections`
- `mcp_authorizations`
- `mcp_tool_policies`
- `mcp_tool_calls`

Identity and integration records:

- `lead_submission_identities`
- `lead_reconciliation_attempts`
- `provider_webhook_events`
- `external_crm_links`
- `external_delivery_attempts`

Product and inventory records:

- `product_catalog_sources`
- `products`
- `product_identifiers`
- `product_inventory_locations`
- `product_feed_sync_runs`
- `product_snapshots`
- `lead_product_interests`
- `product_match_attempts`

Commercial records:

- `billing_accounts`
- `subscriptions`
- `plans`
- `plan_entitlements`
- `client_entitlement_overrides`
- `usage_meters`
- `usage_reservations`
- `usage_ledger`
- `pricing_rules`
- `spending_limits`

Communications provider records:

- `communication_provider_accounts`
- `communication_provider_capabilities`
- `communication_provider_routes`
- `communication_provider_numbers`
- `communication_provider_health`
- `communication_provider_events`

Names are proposed contracts and may be adjusted after reviewing current
tables. Existing canonical lead records should be extended or related rather
than duplicated.

## 20. Event model

All important changes should emit a durable domain event.

Example event types:

- `lead.intent_recorded`
- `lead.confirmed`
- `lead.reconciled`
- `contact.created`
- `opportunity.created`
- `opportunity.assigned`
- `opportunity.stage_changed`
- `task.created`
- `appointment.booked`
- `message.received`
- `message.sent`
- `call.started`
- `call.completed`
- `ai.run_started`
- `ai.tool_requested`
- `ai.tool_completed`
- `ai.handoff_requested`
- `mcp.connection_authorized`
- `mcp.tool_requested`
- `mcp.tool_completed`
- `mcp.tool_denied`
- `mcp.connection_revoked`
- `usage.reserved`
- `usage.reconciled`
- `entitlement.changed`
- `integration.delivery_failed`
- `product.upserted`
- `product.availability_changed`
- `product.removed`
- `lead.product_matched`
- `lead.product_match_failed`

Events require:

- Stable event ID.
- Client ID.
- Actor type and actor ID.
- Entity type and entity ID.
- Occurred timestamp.
- Correlation and causation IDs.
- Idempotency key where externally triggered.
- Versioned payload.

## 21. API and webhook requirements

- All CRM APIs are client-scoped.
- Agency access must be explicitly authorized and audited.
- Mutations require role and entitlement checks.
- Paid actions require usage authorization.
- Provider webhooks require signature verification where supported.
- Webhook responses must be idempotent.
- Long-running processing must use durable jobs with retries.
- API contracts must distinguish accepted, processing, completed and failed.
- Sensitive provider credentials remain encrypted and server-only.
- Public ingestion endpoints require abuse controls and rate limits.

Provider integration seams:

- Website tracking and form injection.
- Dealer or website provider confirmation webhook.
- Meta lead ads webhook.
- Google lead form webhook or supported retrieval path.
- Twilio status and inbound communication webhooks.
- Telnyx call-control, messaging and AI assistant webhooks.
- Email delivery and inbound reply webhooks.
- External CRM inbound and outbound webhooks.

## 22. User experience

### 22.1 Portal navigation

Proposed CRM navigation:

- CRM Overview.
- Leads.
- Contacts.
- Pipeline.
- Conversations.
- Tasks.
- Appointments.
- Automations.
- AI Receptionist.
- AI and MCP Connections.
- Reports.
- Integration Health.
- Usage and Billing.
- Settings.

Clients with catalog entitlements may also receive:

- Products or Inventory.
- Feed Health.

Navigation items must respect client mode and entitlements.

### 22.2 Lead workspace

The workspace should provide:

- Queue and filters.
- Assignment and SLA state.
- Contact and opportunity summary.
- Attribution summary.
- Conversation thread.
- Timeline.
- Tasks and appointments.
- AI recommendations and handoff state.
- Duplicate and reconciliation indicators.
- Product or vehicle inquiry card.
- Current availability and feed freshness.
- Inquiry-time product snapshot.
- Match method and confidence.
- Authorized alternative products.

### 22.3 Paywall experience

- Explain which entitlement is required.
- Show included usage and current consumption.
- Allow authorized users to request or purchase access.
- Never present a generic server error for an entitlement denial.
- Continue to show captured leads in read-only or capture-only mode.

## 23. Dealer mobile application

XeroFlow already has a mobile application intended for dealers that subscribe
to the platform. The mobile application must be incorporated as a first-class
delivery surface for the CRM, communications and AI product.

The mobile application should follow the dealer workflows and product
direction represented by the Toyota and Nuxt theme work while consuming the
same XeroFlow domain APIs as the web portal. It must not maintain a separate
lead, contact, pipeline, entitlement or usage system.

### 23.1 Mobile architecture

- Use the same versioned CRM APIs and canonical records as the web portal.
- Use mobile-specific presentation APIs only where aggregation is required.
- Register each installation and push notification token to a client-scoped
  user and device.
- Keep authentication, authorization and entitlements server-enforced.
- Support deep links into a lead, conversation, task, appointment or AI
  handoff.
- Use an offline-safe read cache for recent assigned work.
- Use a durable mobile outbox for supported offline mutations.
- Reconcile outbox mutations using stable idempotency keys.
- Never place provider credentials, AI credentials or billing logic in the
  mobile application.

### 23.2 Mobile CRM experience

The initial dealer mobile experience must support:

- Secure sign-in and authorized client selection.
- Assigned lead inbox.
- Lead search and filters.
- Contact and opportunity details.
- Pipeline stage updates.
- Assignment and reassignment where permitted.
- Customer timeline.
- Notes and tasks.
- Appointments.
- Tap-to-call, SMS and email actions.
- Conversation threads.
- SLA warnings and overdue work.
- Integration or delivery failure visibility appropriate to the user's role.

### 23.3 Mobile AI experience

- Notify staff when AI requests a human handoff.
- Show AI conversation summary, detected intent and qualification state.
- Allow an authorized user to take over the conversation.
- Show suggested responses separately from automatically executed actions.
- Require approval in the mobile app when client policy requires it.
- Display why an AI action was blocked by consent, entitlement or spending
  policy.
- Attribute mobile approvals and actions to the human user.

### 23.4 Push notifications

Push notifications should cover:

- New assigned lead.
- SLA warning and breach.
- Customer reply.
- Missed call or voicemail.
- Upcoming appointment.
- Overdue task.
- AI human-handoff request.
- Communication delivery failure.
- Usage or entitlement warning for authorized administrators.

Push payloads must contain minimal sensitive information. The app must fetch
the current authorized record after opening a notification.

### 23.5 Mobile security

- Store session material in platform secure storage.
- Support biometric unlock as a local convenience, not a replacement for
  server authentication.
- Apply device revocation and session expiry.
- Avoid customer personal data in push payloads and diagnostic logs.
- Respect screenshots, recording and attachment policies where supported.
- Enforce tenant and role checks on every API call.
- Protect locally cached records and clear them on sign-out or device
  revocation.

### 23.6 Mobile entitlements and billing

- Mobile screens must consume the same client entitlement response as web.
- Paid actions must use the server-side usage authorization flow.
- The mobile app must not bypass usage limits or subscription state.
- Capture-only and read-only fallback states must remain usable.
- Subscription purchase and plan management may be handled by an authorized
  web billing flow unless a separate app-store commerce decision is approved.
- Any app-store billing requirement must be reconciled with XeroFlow's
  subscription and entitlement source of truth.

### 23.7 Mobile release requirements

- Supported operating system versions and device policy.
- Development, staging and production environments.
- Push notification credentials and rotation.
- Universal/app links.
- Crash reporting and privacy-safe diagnostics.
- Remote feature flags.
- Forced and recommended upgrade policy.
- App store privacy disclosures.
- Account deletion and data export entry points where required.
- Mobile-specific acceptance and regression coverage.

## 24. Security, privacy and compliance

- Strict tenant isolation on every query.
- Role-based access and least privilege.
- Encryption for credentials and sensitive data.
- Audit log for agency access and AI activity.
- Consent source and timestamp.
- SMS and email suppression.
- Recording disclosure and jurisdiction-aware policy.
- Configurable retention for recordings and transcripts.
- Export and deletion workflows.
- Protected logs that avoid unnecessary personal data.
- Signed URLs for recordings and attachments.
- Rate limiting and abuse prevention.
- Secret rotation and provider credential health.

Legal and compliance requirements must be reviewed for each operating region
before autonomous voice or recorded calls are enabled.

## 25. Reliability and observability

Required operational signals:

- Webhook receipt and processing latency.
- Deduplication rate.
- Reconciliation match rate.
- Queue depth and age.
- Delivery retries and dead letters.
- Communication delivery failure rate.
- AI tool failure rate.
- Human handoff rate.
- Entitlement denial count.
- Usage reservation and reconciliation discrepancies.
- Per-client spending and limit utilization.
- Mobile API failures, push delivery failures and app release adoption.

Every provider call should include a correlation ID and structured outcome
without logging secrets or unnecessary customer data.

## 26. Product metrics

North-star operational metrics:

- Percentage of confirmed leads with complete attribution.
- Percentage of confirmed leads assigned within SLA.
- Median first-response time.
- Qualified lead rate.
- Appointment rate.
- Won rate.
- Cost per qualified lead.
- Cost per sale.

Commercial metrics:

- Active CRM clients.
- Active AI receptionist clients.
- Paid communications usage.
- Gross provider cost.
- Customer usage revenue.
- Agency gross margin.
- Overage rate.
- Entitlement conversion rate.
- Active dealer mobile users.
- Mobile lead response and human-handoff completion rates.

## 27. Delivery phases

Detailed tasks, rollout stages and non-disruption controls are maintained in:

`docs/prd/crm-ai-incremental-delivery-task-list.md`

### Phase 0: architecture verification

- Audit existing lead, attribution, CRM, billing and provider tables.
- Inspect the Toyota reference project.
- Confirm reusable interfaces and code ownership.
- Produce schema and API decision records.

### Phase 1: CRM foundation

- Client CRM mode and settings.
- Contacts and deterministic identifiers.
- Opportunities, pipelines and canonical stages.
- Activities and unified timeline.
- Assignment, tasks and notes.
- Server-side entitlements.
- Initial subscription and usage schema.
- Mobile-ready API contracts, device registration and entitlement response.
- Product-interest contracts on leads and opportunities.

### Phase 2: reconciliation and closed-loop analytics

- Shared submission identity coverage.
- Reconciliation dashboard.
- Lifecycle feedback into analytics.
- Cost-per-qualified-lead and cost-per-sale.
- Integration health alerts.
- Product and vehicle inquiry matching.
- Dealer feed health and unmatched product monitoring.

### Phase 3: communications

- Shared conversation model.
- Two-way SMS.
- Email.
- Voice event model.
- Consent and suppression.
- Usage reservations and actual-cost reconciliation.

### Phase 3B: dealer mobile CRM

- Integrate the existing dealer mobile application with canonical CRM APIs.
- Assigned lead inbox, contact, opportunity, timeline and tasks.
- Push notifications and deep links.
- SMS, email and call actions.
- Offline-safe recent-work cache and mutation outbox.
- Mobile entitlement and usage states.
- Vehicle or product inquiry cards and current stock status.

### Phase 4: automation

- Trigger, condition and action engine.
- Delays, business hours and retries.
- SLA workflows.
- External CRM delivery workflows.

### Phase 5: AI receptionist

- Client AI configuration.
- Permission-controlled tools.
- Suggest, approval and automatic modes.
- SMS AI.
- Voice AI.
- Qualification and appointment booking.
- Human handoff.
- AI usage and margin reporting.
- Mobile AI handoff, approval and takeover workflows.

Digital assistant and phone receptionist activation are separate. The AI
phone receptionist follows the independent staged rollout in:

`docs/prd/crm-ai-phone-receptionist-rollout.md`

### Phase 5B: external AI and MCP

- Protected remote XeroFlow MCP server.
- OAuth authorization and client-scoped grants.
- Read-only CRM and product tools.
- Approved CRM mutation tools.
- Paid communications tools with usage authorization.
- ChatGPT, Claude and Groq compatibility validation.
- Connection, tool-call and data-egress audit.

### Phase 6: commercial expansion

- Final package enforcement.
- Self-service plan changes where applicable.
- Xero usage invoicing.
- Advanced retention and storage tiers.
- Additional communications and CRM providers.

## 28. Release gates

No phase may launch without:

- Tenant isolation review.
- Idempotency tests for external events.
- Entitlement enforcement tests.
- Usage accounting tests for paid actions.
- Audit visibility.
- Failure and retry behavior.
- Migration and rollback procedure.
- Client-facing error states.
- Operational dashboards and alerts.

AI execution additionally requires:

- Tool authorization tests.
- Consent checks.
- Spending limits.
- Human handoff.
- Prompt injection controls.
- Client-specific evaluation cases.

External MCP access additionally requires:

- OAuth resource and audience validation.
- Per-user and per-client authorization.
- Tool allowlists and scopes.
- Write-action approval policy.
- Prompt-injection and data-egress review.
- Connection revocation.
- Harness-specific compatibility tests.

Mobile release additionally requires:

- Secure-storage and session review.
- Tenant-isolation API coverage.
- Push payload privacy review.
- Offline mutation idempotency.
- Device revocation.
- App-store privacy and account-management compliance.

## 29. Key acceptance criteria

- A confirmed provider lead creates or reuses the correct contact and creates
  exactly one legitimate opportunity.
- Provider webhook retries do not create duplicate records.
- Distinct vehicle or product enquiries can create distinct opportunities.
- Every opportunity retains first-touch and last-touch attribution.
- A client can operate in capture-only mode without internal CRM promotion.
- Full CRM mode creates assignment, timeline and SLA records.
- Won and lost stages update campaign outcome reporting.
- An AI tool cannot run without client permission and entitlement.
- A paid action cannot run without a successful usage authorization.
- Actual provider usage reconciles against the original reservation.
- Billing suspension does not discard incoming leads.
- Agency access to a client is authorized and audited.
- An assigned dealer can receive a push notification, open the correct lead
  securely and update it from the mobile application.
- Mobile and web show the same contact, opportunity, timeline, entitlement and
  usage state.
- An offline mobile mutation is applied once after reconnecting.
- An AI handoff can be accepted from mobile and is attributed to the accepting
  user.
- An authorized external LLM can read only the permitted client's CRM records
  through MCP.
- An external MCP write action passes the same role, entitlement, consent,
  approval and usage checks as web or mobile.
- Revoking an MCP connection prevents further tool calls.
- MCP access never exposes raw database credentials, provider credentials or
  another client's data.
- An enquiry containing an exact client SKU or stock ID attaches the correct
  product and stores an inquiry-time snapshot.
- A webhook retry does not create a duplicate product interest.
- A sold or removed product remains visible in historical enquiries without
  being shown as currently available.
- An unmatched product identifier is visible for reconciliation and never
  matches inventory from another client.

## 30. Risks and mitigations

### Duplicate identity and incorrect merges

Mitigation: deterministic matching first, review queue for uncertain matches
and separate contact identity from opportunity identity.

### Provider webhook limitations

Mitigation: shared browser IDs where possible, bounded fallback reconciliation
and explicit confidence reporting.

### AI performs an inappropriate action

Mitigation: tool-level authorization, approval modes, limits, audit and human
handoff.

### Variable provider costs exceed revenue

Mitigation: preflight reservation, actual-cost reconciliation, configurable
markup and hard spending caps.

### Billing failure causes lost leads

Mitigation: preserve capture and storage while restricting paid actions.

### Cross-client data exposure

Mitigation: tenant-scoped repositories, authorization tests and client-bound
AI context.

### Communications compliance

Mitigation: consent ledger, suppression, recording policy and jurisdiction
review.

### Web and mobile state divergence

Mitigation: one canonical API and event model, idempotent mobile outbox and no
mobile-only CRM database.

### Product feeds are stale or identifiers are inconsistent

Mitigation: feed freshness indicators, deterministic identifier precedence,
inquiry-time snapshots, bounded fallback matching and an unmatched-product
review queue.

### Sensitive data exposed through push or device storage

Mitigation: minimal push payloads, secure local storage, device revocation and
privacy-safe diagnostics.

### External AI exfiltrates or misuses CRM data

Mitigation: trusted remote MCP server, OAuth audience binding, least-privilege
scopes, minimal tool outputs, approval policy, prompt-injection controls,
connection revocation and complete tool-call audit.

## 31. Open product decisions

- Initial subscription billing provider.
- Whether Xero invoices subscriptions, usage, or both.
- Included allowances and overage rates.
- Default CRM mode for existing clients.
- Default AI approval policy.
- Initial supported external CRMs.
- Initial email provider and inbound reply strategy.
- Default Twilio versus Telnyx provider policy.
- Whether production accounts should maintain active-passive provider
  redundancy.
- Voice recording and transcript retention defaults.
- Which Google lead-form integration path is available for each account type.
- Whether clients can self-upgrade or require agency approval.
- Supported mobile operating system versions.
- Mobile framework and release ownership for the existing application.
- Whether any app-store purchase flow is required.
- Default offline retention period for dealer records.
- Which existing dealer vehicle feeds and source identifiers are authoritative.
- Product feed freshness thresholds and sold-stock retention defaults.
- Which external AI plans and harnesses are officially supported.
- Whether MCP access is included in CRM Pro or sold as an add-on.
- Default approval requirements for external MCP write actions.

## 32. Definition of complete

This product is complete when XeroFlow can capture and attribute a lead,
operate or deliver its CRM lifecycle, communicate through entitled channels,
allow a governed AI agent to assist or act, report the resulting business
outcome to marketing analytics, and accurately account for all billable usage
without losing leads or crossing tenant boundaries. Dealers must be able to
operate the same authorized workflow from the existing mobile application,
including receiving assignments, communicating, handling AI escalations and
updating opportunity outcomes.

## Industry-specific AI receptionist configuration

The AI phone receptionist uses a versioned industry policy and knowledge layer rather than a universal prompt. Configuration inherits from platform safety defaults through industry, client, location, and temporary operational overrides. Activation is blocked per location until required knowledge, operating rules, escalation contacts, compliance decisions, integration health, budgets, and evaluation scenarios pass readiness checks.

Industry templates define required fields, supported intents, entity identifiers, approved tools, prohibited actions, mandatory disclosures, handoff rules, minimum lead data, and release evaluations. Knowledge must be tenant-isolated, approved, attributable, versioned, location-aware, and freshness-controlled. Live systems remain authoritative for stock, availability, pricing, bookings, and customer-specific facts.

Detailed requirements are maintained in `docs/prd/crm-ai-receptionist-industry-configuration.md`.

## Automotive reference architecture findings

The automotive reference application at `/Users/paulgiurin/Documents/Projects/promotion-knoxgwmhaval` has been reviewed for reusable architecture and operational patterns. The platform should adopt its trusted tenant-context injection, external inventory mapping, independently auditable tracking destinations, human handoff lifecycle, separate mobile product, usage controls, and extracted runtime boundaries. These patterns must be reimplemented behind provider-neutral platform contracts rather than copied with dealership, Nuxt-layer, dual-database, or monolith coupling.

The automotive vertical will be implemented as an industry package over canonical CRM, product, conversation, event, policy, entitlement, and audit primitives. A transactional outbox, identity-derived tenant scope, atomic lead claiming, approved knowledge lifecycle, policy-driven AI safety, and complete usage reconciliation are required improvements over reference patterns.

Detailed source-linked findings and the adoption matrix are maintained in `docs/prd/crm-automotive-reference-architecture-rnd.md`.

## Automotive marketplace data integration

The vehicle marketplace at `/Users/paulgiurin/Documents/GitHub/vehicle-marketplace` is the proposed automotive product-data and market-intelligence authority. The CRM remains authoritative for customer identity, consent, leads, opportunities, communications, activities, appointments, handoffs, lifecycle outcomes, entitlements, and billing.

Integration must use versioned APIs, immutable enquiry-time vehicle snapshots, and signed idempotent events rather than shared table access. The marketplace may provide vehicle identity, taxonomy, specifications, media, inventory status, location, feed health, pricing and market signals, explainable matching, and consent-permitted anonymous behavioral signals. Every field crossing the boundary requires provenance, freshness, quality, visibility, licensing, and retention metadata.

Detailed ownership, contracts, rollout phases, and source-linked findings are maintained in `docs/prd/crm-automotive-marketplace-data-rnd.md`.

## 360 Persona identity and activation

Linked applications will integrate through a governed 360 Persona identity service. A Persona ID is a tenant-scoped customer identity, not an AI persona, audience name, cookie, advertising identifier, or CRM record ID. The service links local application subjects, anonymous first-party activity, confirmed provider leads, CRM people, marketplace preferences, automotive product interests, and platform-scoped social identities through evidence-backed and reversible decisions.

The architecture uses a private platform reconciliation subject, tenant-scoped Persona IDs, optional explicitly governed group Persona IDs, and destination-scoped activation identifiers. Cross-client resolution and audience reuse are prohibited by default. Advertising activation is a controlled export with independent purpose, consent, minimum cohort, suppression, expiry, approval, and reconciliation requirements.

Detailed data models, linked-application contracts, social and advertising flows, privacy controls, source research, and rollout phases are maintained in `docs/prd/crm-360-persona-identity-activation-rnd.md`.

## Federated Persona pool and lakehouse

The existing Persona, tracking, and audience implementations in the dealer platform and vehicle marketplace remain application-owned. The CRM platform provides the central identity control plane, tenant Persona contract, operational Persona projection, governed analytical lakehouse, segment governance, and activation controls.

The architecture separates transactional identity resolution from analytical history. PostgreSQL serves live identity, consent, suppression, CRM, receptionist, mobile, AI, MCP, and activation authorization. The lake stores immutable redacted events, canonical event projections, identity-resolution versions, feature snapshots, segment evidence, and activation manifests. Live customer operations must remain available during lakehouse outages.

Detailed architecture is maintained in `docs/prd/crm-360-persona-lakehouse-architecture.md`.

## Shared industry trends and crossover intelligence

The platform should include an Industry Intelligence capability that combines public trends, marketplace demand, inventory, social signals, and privacy-safe portfolio benchmarks. It should help agencies and clients identify changing demand, peer ranges, market opportunities, and adjacent product or service crossovers.

This capability must remain separate from transactional CRM identity. Client data is tenant scoped; only sufficiently large, opted-in aggregates may contribute to shared benchmarks. Opportunities discovered across the platform can be activated only through the client's own consented Personas, campaigns, and CRM workflows.

Google Trends is one directional source rather than a demand ground truth. Recommendations should require provenance, sample size, confidence, source freshness, seasonal context, and corroboration from marketplace, campaign, CRM, or sales outcomes.

See `docs/prd/crm-shared-industry-trends-intelligence-rnd.md`.

## Automotive news intelligence and GraphRAG

The existing automotive-market MCP news feed should become an evidence source for shared industry trends, competitor research, content planning, and marketing hypotheses. The system should cluster syndicated stories, preserve document versions and corrections, extract automotive entities/events/claims, corroborate evidence, and release only traceable signals into client recommendations.

GraphRAG-style local, global, temporal, and crossover retrieval can connect news to Google Trends, marketplace demand, inventory, campaigns, CRM outcomes, and product data. News and generated summaries are not canonical product, stock, price, offer, recall, legal, or customer records. Publishing, audience activation, budget changes, and outbound contact remain policy and human approval gated.

See `docs/prd/crm-automotive-news-knowledge-intelligence-rnd.md`.

## 360 push-pull analytics

The customer and agency analytics products should operate as pull surfaces over governed projections produced by the 360 lakehouse. Tracking, GA4, campaigns, CRM, marketplace, inventory, news, trends, benchmarks, and product systems push observations at appropriate hot, warm, or cold cadences. Portal, mobile, AI, and MCP consumers pull stable tenant-safe read models without invoking external providers during a user request.

The analytics experience should support page, device, source, campaign, product, vehicle, journey, funnel, quality, sale, and revenue drill-downs. First-party behavior, GA4, confirmed leads, CRM stages, inventory, and knowledge evidence retain separate source authority and reconciliation rules.

See `docs/prd/crm-360-intelligence-push-pull-analytics.md`.

## ADME Studio automotive intelligence dependency

The CRM and AI platform may consume ADME-derived automotive evidence for research, client conversations, receptionist context, social planning, and campaign briefs. This dependency is read-only and advisory. Any action remains subject to tenant authorization, evidence provenance, inventory and offer validation, policy checks, and human approval. The implementation contract is defined in `docs/prd/crm-adme-studio-automotive-campaign-intelligence-rnd.md`.
