# XeroFlow AI Phone Receptionist Rollout

Status: Separate safety-gated rollout
Last updated: 2026-07-24
Parent PRD: `docs/prd/crm-ai-customer-platform-prd.md`
Provider comparison:
`docs/prd/crm-ai-communications-provider-comparison.md`

## 1. Product boundary

The AI phone receptionist is a separate product capability from:

- CRM.
- Website lead capture.
- SMS and email AI.
- Internal AI assistance.
- External MCP access.
- Automation.

Enabling any of those products does not enable AI call handling.

The receptionist has independent:

- Entitlement.
- Client feature flag.
- Inbound permission.
- Outbound permission.
- Phone number and route.
- Provider configuration.
- AI configuration.
- Tool policy.
- Spending limits.
- Recording and retention policy.
- Kill switch.

## 2. Safety objective

Introduce AI call handling without changing an existing dealer's main call
path until the assistant has passed synthetic testing, internal review and a
separate-number pilot.

The first release is inbound only. Outbound AI calling is a different product
and remains disabled until a separate consent, compliance and business case is
approved.

## 3. Rollout stages

### Stage 0: offline evaluation

- No public phone number.
- Recorded or synthetic test audio.
- Approved test CRM records.
- No real customer data.
- No CRM writes.

Exit gate:

- Required scenarios pass.
- Tool and transfer failures are observable.
- Cost per test call is measurable.

### Stage 1: dedicated internal test number

- Number is not published to customers.
- Internal callers only.
- Information and routing tests.
- Human transfer tests.
- No CRM writes.

Exit gate:

- Provider, model and voice configuration is stable.
- Kill switch and fallback routing are proven.

### Stage 2: after-hours information pilot

- One selected client.
- Separate published pilot number.
- Inbound only.
- Approved business and product information.
- Human callback or voicemail handoff.
- No appointment or pipeline mutation.

Exit gate:

- Client reviews calls and approves quality.
- Disclosure and recording behavior is accepted.
- No material unanswered or trapped calls.

### Stage 3: lead capture pilot

- Capture caller contact details with confirmation.
- Capture product or vehicle interest.
- Create an idempotent confirmed lead.
- Notify a human.
- Attach summary and attribution.
- Do not update pipeline beyond initial creation.

Exit gate:

- Lead details are accurate.
- Duplicate rate is acceptable.
- Human follow-up receives usable context.

### Stage 4: read-only CRM and catalog tools

- Current product availability.
- Dealer locations and hours.
- Appointment availability.
- Existing enquiry lookup only under approved identity policy.

Exit gate:

- No cross-client access.
- Current availability is never inferred from an old snapshot.
- Tool latency does not damage call quality.

### Stage 5: controlled appointment booking

- Client opt-in.
- Explicit caller confirmation.
- Idempotent booking.
- Approval where client policy requires it.
- Confirmation message subject to consent.

Exit gate:

- No duplicate bookings.
- Cancellation and rescheduling policy is clear.
- Human staff can see and correct bookings.

### Stage 6: selected main-number routing

- Requires a separate release decision.
- Time- or queue-based routing only.
- Human fallback remains available.
- Rollback is immediate.

This stage is not part of the first receptionist release.

### Stage 7: outbound AI calling

Not approved by this PRD.

Requires:

- Separate legal and compliance review.
- Explicit customer consent model.
- Approved use cases.
- Calling-hour policy.
- Do-not-call and suppression enforcement.
- Separate client and agency permission.
- Separate feature flag and budget.

## 4. Call routing architecture

Initial inbound route:

`dedicated number -> provider -> XeroFlow receptionist -> human transfer or voicemail`

Failure route:

`provider/model/tool failure -> human destination -> voicemail`

The caller must never remain in an unbounded retry or silence loop.

An active call cannot be moved between Twilio and Telnyx transparently.
Provider failover applies to new calls or number-level routing policy, not an
in-progress call.

## 5. Allowed first-release behavior

- Greeting and disclosure.
- Intent detection.
- Approved FAQ and business information.
- Product or vehicle lookup.
- Lead qualification.
- Contact detail confirmation.
- Human transfer.
- Callback request.
- Idempotent lead capture.
- Read-only appointment availability.
- Call summary.
- Suggested human follow-up task.

## 6. Prohibited first-release behavior

- Outbound AI calling.
- Unrestricted CRM writes.
- Price negotiation.
- Finance or credit advice.
- Representing unavailable stock as available.
- Taking payment.
- Changing customer identity.
- Bulk data access.
- Accessing another client's records.
- Continuing after the customer requests a human or opt-out.

## 7. Required call controls

- Maximum call duration.
- Maximum silence duration.
- Maximum consecutive tool failures.
- Maximum concurrent calls.
- Per-client monthly minute cap.
- Per-client monthly monetary cap.
- Per-caller abuse limit.
- Human transfer timeout.
- Voicemail fallback.
- Provider and model timeout.
- Emergency global stop.
- Client stop.

## 8. Disclosure, recording and consent

Before production:

- Approve AI disclosure wording.
- Approve recording disclosure wording.
- Determine when recording is enabled.
- Determine transcript and recording retention.
- Define access roles.
- Define deletion and export behavior.
- Confirm regional legal requirements.

The assistant must not rely on prompt text alone to enforce recording policy.
Call routing and provider configuration must enforce it.

## 9. CRM integration

The receptionist uses the same canonical services as web, mobile and MCP.

Lead creation requires:

- Client.
- Stable call and provider identifiers.
- Idempotency key.
- Confirmed caller contact details.
- Product interest where known.
- Source `ai_phone_receptionist`.
- Call attribution.
- Inquiry-time product snapshot where matched.
- Consent and disclosure state.
- Summary and handoff outcome.

The call itself is a conversation and activity event linked to the contact and
opportunity after safe identity resolution.

## 10. Human handoff

Handoff must provide:

- Caller number according to policy.
- Identified contact where safely matched.
- Reason for call.
- Product or vehicle interest.
- Qualification summary.
- Actions already completed.
- Consent state.
- Call duration.
- Live transfer state.

If no human accepts:

- Explain the fallback.
- Offer voicemail or callback request.
- Create a follow-up task when permitted.
- End the call cleanly.

## 11. Provider evaluation

Evaluate both:

- Twilio ConversationRelay and/or Media Streams.
- Telnyx AI Assistants and/or media streaming.

Measure:

- Australian call setup.
- Speech-end to response audio.
- Interruption handling.
- Transcript accuracy.
- Australian place and vehicle terminology.
- Transfer success.
- Provider and model failure handling.
- Audio quality.
- Completion rate.
- Actual cost per completed call.

Provider-native assistant definitions are deployments generated from the
canonical XeroFlow assistant configuration.

## 12. Usage and billing

Reserve estimated maximum call cost before the assistant accepts a paid call
when policy requires it.

Reconcile:

- Telephony minutes.
- Managed AI voice minutes.
- Media streaming.
- Speech to text.
- Text to speech.
- Model input and output.
- Recording.
- Transcription.
- Storage.
- SMS or email confirmation.

If the hard spending limit is reached, new calls follow the configured human
or voicemail route. Existing lead capture records remain available.

## 13. Mobile and web operations

Authorized staff can:

- See active and recent receptionist calls.
- Receive human-handoff notifications.
- Accept a handoff.
- Review summaries and outcomes.
- Access recording or transcript where permitted.
- Correct lead and product matches.
- Create follow-up tasks.
- Report an unsafe or incorrect call.
- Disable the receptionist.

## 14. Observability

Track:

- Calls offered, answered, completed and transferred.
- Caller abandonment.
- Silence and timeout events.
- Interruption latency.
- Tool latency and failure.
- Lead capture accuracy.
- Duplicate lead suppression.
- Appointment accuracy.
- Human handoff acceptance.
- Provider and model errors.
- Cost per call and per confirmed lead.
- Kill-switch activation.

## 15. Acceptance criteria

- The receptionist cannot be enabled by a general AI or CRM flag.
- The first pilot uses a separate number.
- The first pilot cannot initiate outbound calls.
- Every call has a provider ID, client ID and correlation ID.
- Provider retries do not duplicate call outcomes or leads.
- A provider, model or tool failure reaches human or voicemail fallback.
- A caller requesting a human is transferred or offered a clear fallback.
- Product availability is read from current inventory.
- CRM writes are limited to explicitly approved tools.
- Call cost is reserved and reconciled.
- Recording and transcript access follows approved policy.
- Client and agency kill switches take effect for new calls immediately.
- Existing client call routing remains unchanged until separately approved.

## Industry and knowledge readiness gate

The staged phone rollout also requires an industry and location readiness gate. A dedicated number must not receive production customer traffic until the applicable industry template, client settings, location settings, approved knowledge, escalation procedures, compliance controls, and integration health are complete.

The receptionist runtime must resolve platform, industry, client, location, and temporary operational policies before answering or invoking a tool. Prompt text cannot grant capabilities. All actions are authorized by the runtime policy engine and produce an auditable `allow`, `allow_with_confirmation`, `handoff`, or `deny` decision.

The automotive pilot must include live vehicle-feed matching, stock-aware enquiry capture, dealership and department routing, test-drive and service intent handling, finance and availability disclaimers, campaign attribution preservation, and safe fallback when inventory or calendar systems are unavailable.

See `docs/prd/crm-ai-receptionist-industry-configuration.md` for the template contract, prerequisite schema, knowledge lifecycle, industry examples, and evaluation requirements.
