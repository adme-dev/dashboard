# XeroFlow AI Communications Provider Comparison

Status: Research and architecture decision input
Providers: Twilio and Telnyx
Region of initial focus: Australia
Last updated: 2026-07-24
Parent PRD: `docs/prd/crm-ai-customer-platform-prd.md`

## 1. Decision summary

XeroFlow should not hard-code its CRM, AI assistant or dealer mobile
application to Twilio or Telnyx.

The platform should support:

- Twilio only.
- Telnyx only.
- Both providers for different channels.
- Both providers for different clients or regions.
- Active-passive failover for eligible new work.
- Controlled provider migration.

The recommended initial position is:

1. Build provider-neutral communication and AI session contracts.
2. Implement Twilio and Telnyx adapters.
3. Run an Australian production-like pilot.
4. Select defaults by measured capability, latency, quality, reliability and
   total cost.
5. Keep the non-default adapter available where its capability or economics
   are better.

No vendor should own the canonical CRM conversation, assistant definition,
tool policy, entitlement or billing record.

## 2. Official capability findings

### 2.1 Telnyx

Telnyx provides:

- Programmable Voice Call Control.
- Bidirectional WebSocket media streaming.
- Native AI Assistants.
- SMS and MMS with inbound and delivery webhooks.
- Australian voice and messaging numbers.
- Provider-native usage and cost details on messaging events.

Telnyx media streaming supports bidirectional RTP and multiple codecs,
including L16 linear PCM intended to reduce transcoding overhead for AI voice
integrations:

https://developers.telnyx.com/docs/voice/programmable-voice/media-streaming

Telnyx publishes native Voice AI Agent pricing and describes a base real-time
interaction and orchestration rate:

https://telnyx.com/pricing/conversational-ai/

Telnyx states that its Australian voice AI offering uses Sydney-local
telephony, WebRTC and AI infrastructure. These are vendor claims and must be
validated in the XeroFlow pilot:

https://telnyx.com/en-au/products/voice-ai-agents

Telnyx messaging webhooks provide unique event IDs, delivery lifecycle events,
retry/failover behavior and Ed25519 signature verification:

https://developers.telnyx.com/docs/messaging/messages/receiving-webhooks

### 2.2 Twilio

Twilio provides:

- Programmable Voice.
- ConversationRelay for managed STT, TTS and voice session handling.
- Bidirectional raw Media Streams.
- SMS, MMS and Conversations products.
- Voice and messaging SDKs.
- Voice Insights and related operational tooling.

ConversationRelay connects Twilio Voice to a XeroFlow WebSocket application
and manages speech-to-text and text-to-speech while XeroFlow retains the
conversation and LLM logic:

https://www.twilio.com/docs/voice/twiml/connect/conversationrelay

Twilio Media Streams provides raw audio over WebSockets and supports
bidirectional AI conversations. Twilio documents an Australia `AU1` region for
Media Streams:

https://www.twilio.com/docs/voice/media-streams

Twilio publishes separate charges for telephony and intelligent services,
including ConversationRelay and Media Streams. Pricing varies by destination
and region:

https://www.twilio.com/en-us/voice/pricing/us

## 3. Initial comparison

This matrix records architecture-relevant differences. It is not a final
procurement score.

| Area | Telnyx | Twilio | XeroFlow implication |
|---|---|---|---|
| Native AI assistant | Telnyx AI Assistants | ConversationRelay plus customer application | Support provider-native session adapters without moving CRM tools into the provider. |
| Raw voice AI path | Bidirectional media streaming | Bidirectional Media Streams | Maintain a common raw-media session contract for advanced or BYO AI. |
| Managed STT/TTS path | Native Voice AI stack | ConversationRelay with supported speech providers | Normalize transcript, interruption, error and usage events. |
| Australia posture | Telnyx markets Sydney-local telephony and AI infrastructure | Twilio documents AU1 Media Streams region | Benchmark real Australian numbers and callers before selecting a default. |
| Messaging | SMS/MMS API and signed webhooks | Programmable Messaging and Conversations | Normalize inbound, sent, delivered, failed and opt-out events. |
| Webhook verification | Ed25519 signature headers | Twilio request signature validation | Each adapter verifies its native signature before normalization. |
| Cost model | Voice AI, telephony and messaging components | Telephony plus ConversationRelay or Media Streams components | Usage ledger must store component-level provider cost. |
| Number ownership | Telnyx-provisioned or ported numbers | Twilio-provisioned or ported numbers | Inbound routing remains bound to the owning provider. |
| Provider failover | Webhook failover support for documented products | Product-specific retry and regional behavior | XeroFlow needs its own job retry and provider health policy. |
| Ecosystem | Integrated carrier and AI stack | Broad CPaaS product and integration ecosystem | Select by client use case rather than one global assumption. |

## 4. Multi-provider operating modes

### 4.1 Single provider

One provider supplies numbers, voice, SMS and AI voice for a client.

Use when:

- The client values operational simplicity.
- One provider meets regional and compliance requirements.
- Bundled economics are favorable.

### 4.2 Channel split

Example:

- Telnyx for voice AI.
- Twilio for SMS.
- A separate provider for email.

Use when:

- One provider has materially better channel capability or economics.
- Existing client numbers or contracts cannot be moved.

### 4.3 Client or regional split

Example:

- Australian dealer clients use the provider selected by the Australian
  pilot.
- Another region uses a different provider.

Use when:

- Number availability, data location, latency or compliance differs by region.

### 4.4 Active-passive redundancy

The primary provider handles normal outbound work. A secondary provider can
accept eligible new outbound jobs when the primary is unhealthy.

Limitations:

- An active voice call cannot be moved transparently between providers.
- Inbound calls and messages remain bound to the provider that owns the
  destination number.
- Sender identity and registered messaging campaigns may not be portable in
  real time.
- Conversation ordering must not be split casually across providers.

Failover is therefore a routing decision for new work, not a mid-session
switch.

## 5. Canonical provider-neutral contracts

### 5.1 Voice provider

Required operations:

- Provision or attach number.
- Start outbound call.
- Accept inbound call event.
- Answer call.
- End call.
- Transfer call.
- Start and stop recording.
- Start managed AI session.
- Start raw bidirectional media session.
- Receive call status.
- Retrieve usage and cost.

### 5.2 Messaging provider

Required operations:

- Send SMS.
- Send MMS where supported.
- Receive inbound message.
- Receive delivery state.
- Calculate or return message segments.
- Process opt-out state.
- Retrieve usage and cost.

### 5.3 AI voice session

Canonical events:

- Session started.
- Caller speech started.
- Transcript partial.
- Transcript final.
- Assistant response started.
- Assistant response interrupted.
- Tool requested.
- Tool completed.
- Transfer requested.
- Session completed.
- Session failed.
- Usage reported.

### 5.4 Phone number

Canonical properties:

- Provider.
- Provider account.
- E.164 number.
- Country and region.
- Voice capability.
- Messaging capability.
- Emergency capability.
- Owning client.
- Inbound route.
- Porting state.
- Monthly provider cost.

## 6. Provider routing policy

Proposed route inputs:

- Client.
- Channel.
- Direction.
- Destination country.
- Required capabilities.
- Assigned number.
- AI mode.
- Compliance policy.
- Provider health.
- Client preference.
- Explicit migration state.

Initial routing precedence:

1. Inbound number ownership.
2. Explicit client and number route.
3. Required capability.
4. Regional policy.
5. Primary provider.
6. Approved secondary provider for new outbound work.

Do not begin with real-time lowest-cost routing. Introduce cost-aware routing
only after delivery quality, number affinity, compliance and support behavior
are proven.

## 7. Assistant portability

XeroFlow is the source of truth for:

- Assistant identity.
- System instructions.
- Client knowledge references.
- Qualification workflow.
- Available CRM tools.
- Tool authorization.
- Human approval mode.
- Handoff policy.
- Model and cost limits.
- Audit and evaluation cases.

Provider-specific records may include:

- Telnyx assistant ID and version.
- Telnyx connection and number IDs.
- Twilio account, application and number IDs.
- Twilio ConversationRelay configuration.
- Media stream endpoint configuration.

Provider deployment should be generated from the canonical XeroFlow assistant
configuration. A provider-side edit must not silently override client policy.

## 8. Webhook normalization

Each provider adapter must:

1. Capture the raw request for bounded audit and replay.
2. Verify the provider signature.
3. Reject stale or invalid requests.
4. Deduplicate by provider event ID.
5. Map the payload to a versioned canonical event.
6. Acknowledge within the provider timeout.
7. Continue expensive processing through a durable job.
8. Reconcile provider usage and cost.

Raw payload retention must follow privacy and data-retention policy.

## 9. Usage and billing normalization

The usage ledger must retain both normalized and provider-native units.

Example meters:

- `voice_telephony_minute`
- `voice_ai_managed_minute`
- `voice_media_stream_minute`
- `speech_to_text_minute`
- `text_to_speech_character`
- `sms_segment_outbound`
- `sms_segment_inbound`
- `mms_message_outbound`
- `phone_number_month`
- `recording_minute`
- `recording_storage_month`

Each record requires:

- Provider.
- Provider product.
- Provider region.
- Provider reference.
- Native quantity and unit.
- Normalized quantity and unit.
- Provider currency and cost.
- Customer currency and price.
- Markup and margin.

Published list prices are planning inputs only. XeroFlow billing must use the
actual account rate and provider usage record.

## 10. Australian pilot

### 10.1 Test configuration

- Australian local or mobile number for each provider.
- Same XeroFlow assistant instructions and CRM tools.
- Same LLM where both paths allow it.
- Comparable STT and TTS voice profile.
- Calls from Australian mobile and fixed networks.
- Tests during business and peak periods.
- Inbound and outbound scenarios.
- SMS send, receive and delivery tests.

### 10.2 Voice scenarios

- Greeting and interruption.
- Vehicle enquiry qualification.
- Appointment availability lookup.
- Appointment booking.
- Customer asks for a human.
- Poor connection and background noise.
- Long customer response.
- Tool timeout.
- Provider WebSocket interruption.
- Voicemail or answering machine.

### 10.3 Measurements

- Call setup time.
- Speech-end to first-audio latency.
- Interruption response time.
- Transcript accuracy.
- Australian name, suburb and vehicle-model accuracy.
- Audio quality and drop rate.
- Tool-call success rate.
- Transfer success rate.
- Call completion rate.
- Provider and model cost per completed call.
- Support response and diagnostic quality.

### 10.4 Messaging measurements

- Time to accepted.
- Time to delivered.
- Delivery confirmation coverage.
- Inbound webhook latency.
- Duplicate webhook rate.
- Segment calculation.
- Australian sender and number behavior.
- Opt-out behavior.
- Cost per delivered segment.

### 10.5 Selection gate

Do not select a default provider solely on published per-minute price.

The decision must include:

- Measured customer experience.
- Australian availability and latency.
- Reliability.
- Total provider cost.
- Engineering and support overhead.
- Number and porting requirements.
- Compliance and data handling.
- Observability.
- Contract and support terms.

## 11. Proposed data records

- `communication_provider_accounts`
- `communication_provider_credentials`
- `communication_provider_capabilities`
- `communication_provider_routes`
- `communication_provider_numbers`
- `communication_provider_health`
- `communication_provider_events`
- `communication_provider_deployments`
- `communication_provider_usage`

Provider credentials must use the existing encrypted secret pattern and never
be returned to the browser or mobile application.

## 12. Acceptance criteria

- A client can be configured for Twilio, Telnyx or a channel split.
- Web and mobile use the same route decision.
- Inbound events are routed by the provider-owned number.
- Provider webhooks are verified and deduplicated.
- Canonical conversations do not expose provider-specific payloads to the UI.
- AI tools behave identically regardless of voice transport.
- Usage records include provider-native and normalized costs.
- A provider failure can route eligible new outbound work to an approved
  secondary provider.
- Active calls and existing message threads are not silently moved between
  providers.
- The default Australian provider is selected from documented pilot evidence.

## 13. Current recommendation

Build and retain both adapters.

Telnyx is a strong candidate for Australian AI voice because it offers a
native assistant stack, bidirectional media options and claims local Sydney
infrastructure. Twilio remains a strong candidate because of ConversationRelay,
Media Streams, documented AU1 support and its broader communications
ecosystem.

This is an architectural recommendation, not a final vendor selection. The
Australian pilot determines the default, while per-client routing preserves
the option to use either or both systems.
