# Social Inbox Case Control Design

## Document Status

- **Decision:** The Case Control direction was approved on 26 August 2026.
- **Status:** Design specification ready for stakeholder review before implementation planning.
- **Scope:** Social Inbox operating model, right-panel UI/UX, moderation controls, integrations, reporting, and staged delivery.
- **Primary surface:** `/agency/social/inbox`.

This document is the reference decision record for the approved direction. Implementation plans may add technical detail, but should not change its operating principles, safety constraints, or user-experience outcomes without recording and approving the change.

## Purpose

Turn the Social Inbox from a message reader with administrative fields into a practical command centre for managing comments, reviews, and conversations across every connected client account.

The UI/UX redesign is a core deliverable of this work. The operational standards and research below define what the interface must help an agency team do: understand the situation quickly, establish ownership and next action, respond safely, coordinate client work, and close the case with an auditable outcome.

## Executive Summary

The selected direction is a **Case Control** panel organised around three questions:

1. What is happening, and how urgent or risky is it?
2. Who owns it, and what must happen next?
3. What context, evidence, and related work does the team need?

The existing right panel contains useful capabilities, but presents them as one long, flat form. The redesign promotes state, service level, ownership, and next action; separates action from context and audit history; replaces pasted identifiers with searchable relationships; introduces follow-up and resolution semantics; and embeds safe moderation and approval controls.

The initial release should reuse the existing Social Inbox, task, client-request, campaign, notification, and AI-triage infrastructure. It should not attempt to recreate a complete enterprise contact-centre platform.

## Current-State Findings

The current panel already supports:

- open, snoozed, and closed conversation states;
- assignment, priority, tags, SLA state, and first-response tracking;
- links to tasks and client requests;
- a combined case timeline;
- AI summary, sentiment, risk, suggested priority, suggested tags, and recommended actions;
- client approval from the composer;
- links to source posts, social campaigns, and paid-media campaigns;
- typing-collision awareness and negative-sentiment automation guardrails.

The principal usability problems are:

- every field has similar visual weight, so urgent information is easy to miss;
- the SLA and recommended next action are buried below administrative controls;
- `Mark read` is redundant when opening a conversation already marks it read;
- linking work requires pasted IDs instead of searchable records;
- `Open`, `Snoozed`, and `Closed` do not express waiting, ownership, or follow-up clearly;
- there is no structured resolution reason, moderation reason, or escalation level;
- internal notes are separated from the decision that prompted them;
- platform capability is descriptive rather than attached to the actions it enables;
- the approximately 300-pixel panel is too narrow for the amount of information shown;
- the single component has grown beyond a focused responsibility and will become difficult to evolve safely.

## Goals

- Make the next safe action apparent within a few seconds of selecting a conversation.
- Manage all connected client conversations from one consistent agency workflow.
- Support praise, questions, leads, complaints, misinformation, spam, abuse, privacy risks, and critical escalations without treating them identically.
- Make ownership, waiting state, follow-up time, approval state, and resolution outcome explicit.
- Connect the conversation to existing XeroFlow work, client, campaign, CRM, and reporting surfaces.
- Preserve a complete audit trail for assignment, response, approval, moderation, escalation, and resolution.
- Keep AI advisory and human-controlled for reputational, privacy, legal, safety, and moderation decisions.
- Work cleanly in dark mode, at desktop and narrower layouts, using Nuxt UI v4 conventions.

## Non-Goals

- Building a standalone contact-centre product or replacing the social platforms themselves.
- Promising moderation operations that a platform API or the connected account permissions do not support.
- Automatically hiding genuine criticism or automatically publishing high-risk responses.
- Rebuilding task management, CRM, client requests, campaign management, or approvals inside the panel.
- Adding live chat, telephony, workforce forecasting, or a general-purpose ticketing system in the first release.

## Research Benchmarks

The design synthesises established patterns rather than copying one competitor.

### Context and guided action

Sprinklr's third-pane and Unified Agent Desktop patterns place assignment, case context, collaboration, summaries, history, tasks, and guided actions beside the conversation. The useful lesson for XeroFlow is that the side panel should reduce context switching and resolution time, not become a passive record inspector.

### Queue, ownership, and classification

Sprout Social cases combine a queue, assignee, type, priority, tags, internal comments, and completion. Its automated rules route messages, apply tags, alert teams, complete low-value items, and hide inappropriate content when policy permits. XeroFlow should similarly treat tags as operational routing and reporting data, not merely labels.

### Follow-up and resolution

Hootsuite's custom resolution reasons make closure reportable, while its boomerang pattern returns pending work to the active queue at a chosen time without losing ownership. XeroFlow should pair scheduled follow-up with structured outcomes so `Closed` does not become an information graveyard.

### SLA semantics

Zendesk distinguishes active work from pending or on-hold time and cautions against overlapping resolution measures. XeroFlow should clearly define which workflow states pause which clocks and expose one authoritative resolution-time measure.

### Moderation, consumer law, and privacy

The Australian Competition and Consumer Commission warns that suppressing or editing genuine negative reviews may mislead consumers. The Office of the Australian Information Commissioner documents the risk of disclosing private customer information in a public response. Therefore, XeroFlow must distinguish criticism from policy-violating content, require reasons for moderation, preserve evidence, and prevent public replies from exposing information learned through the client relationship.

## Options Considered

### Option A: Reorder the current fields

This would be quick but would preserve the flat information architecture, ambiguous states, pasted identifiers, and weak resolution model. It does not solve the operating problem.

### Option B: Case Control panel

This is the selected option. It reorganises existing capability around triage, ownership, action, context, and resolution, then adds the smallest data-model changes needed for reliable agency operations.

### Option C: Full enterprise agent desktop

This would introduce extensive queue configuration, workforce management, multichannel routing, macros, and contact-centre administration. It is disproportionate to the present requirement and would duplicate other XeroFlow modules.

## Selected Experience

### Desktop layout

The conversation remains the primary surface. The right panel becomes a 360-pixel Case Control rail on wide desktop layouts and can collapse when the user needs more message space. At widths where three columns would become cramped, Case Control opens in a `USlideover` instead of squeezing the conversation.

```text
┌────────────────────────────────────┐
│ NEEDS ACTION          SLA 34m      │
│ High-risk complaint · Facebook     │
│ [Take ownership]  [More actions]   │
├────────────────────────────────────┤
│ Recommended next step              │
│ Acknowledge publicly, then move    │
│ customer details to a private case │
│ [Focus reply] [Request approval]   │
├────────────────────────────────────┤
│ Handle       Context      Activity │
├────────────────────────────────────┤
│ Intent       Service complaint     │
│ Risk         High                  │
│ Owner        Paul / Client Service │
│ Priority     Urgent                │
│ Follow-up    Today, 5:00 pm        │
│ Linked work  Service recovery task │
│ Internal note                     │
├────────────────────────────────────┤
│ [Snooze]             [Resolve ▾]   │
└────────────────────────────────────┘
```

### Persistent header

The header remains visible while the panel scrolls and contains:

- a plain-language derived state such as `Needs owner`, `Needs action`, `Waiting internally`, `Follow-up scheduled`, or `Resolved`;
- the SLA countdown or breach state;
- intent, sentiment, and risk indicators without duplicative badges;
- owner or a prominent `Take ownership` action;
- the recommended next step, with its reasoning available on demand;
- an overflow menu for verified platform actions.

The header must not imply that AI classification is fact. Low-confidence results are labelled and easy to correct.

### Handle tab

This is the default working tab. It contains:

- intent, risk, priority, team, and assignee;
- follow-up scheduling and waiting state;
- approval requirements and approval status;
- searchable creation or linking of a task and client request;
- tags with immediate, optimistic saving and visible error recovery;
- internal note entry adjacent to the action it documents;
- escalation level and destination when relevant;
- the resolve action and required outcome reason.

All edited fields use Nuxt UI v4 components. Form fields use `UFormField`; search relationships use `USelectMenu`; date and time selection uses `UPopover` and `UCalendar`; confirmations use `UModal`; feedback uses `useToast()`.

### Context tab

This answers why the message matters and contains:

- client, connected account, source network, and source post;
- author identity and prior history when the platform lawfully provides it;
- original post media with a resilient fallback when an expiring platform URL cannot be refreshed;
- related comments, previous conversations, and repeated themes;
- linked organic campaign and paid-media campaign;
- account sync or permission health only when it affects the selected action;
- compact AI summary with a link to the full conversation rather than a replacement for it.

Unavailable names must use neutral labels such as `Facebook commenter — name unavailable` or `Facebook reviewer — name unavailable`. The client and account line must distinguish the owned social page from the XeroFlow client; it must never combine unrelated company names into one ambiguous phrase.

### Activity tab

This contains the complete chronological audit trail:

- inbound and outbound social messages;
- assignment, priority, state, tag, and SLA changes;
- internal notes and @mentions;
- approval requests and decisions;
- task and client-request creation or linking;
- moderation attempts and platform results;
- escalation and resolution events;
- automated rule and AI-triage activity, identified as automated.

### Sticky action footer

The footer exposes the two common state transitions:

- `Snooze` or `Set follow-up`, with presets and a custom date/time;
- `Resolve`, which opens a structured resolution modal.

`Mark read` is removed from the panel because opening the conversation already performs that action. `Open on platform` moves into the source-context area and overflow menu.

## Interaction Details

### Ownership and queues

`Take ownership` assigns the signed-in user in one action. The assignee control can search eligible agency users. Team queue routing is introduced in the operational-model phase and should reuse existing permissions and account-team relationships rather than create an unrelated directory.

### Follow-up

The user can choose a preset or a custom time. Scheduling follow-up:

- preserves the owner;
- records the reason or note;
- sets the conversation to `Scheduled follow-up`;
- uses the existing `snoozed_until` capability during the first delivery phase;
- returns the item to the actionable queue when due;
- creates an auditable event and a notification when it reopens.

### Linked work

The panel replaces raw ID entry with searchable selectors showing title, status, client, and project. Users can:

- link an existing task or client request;
- create a prefilled task from the conversation;
- create a client-visible approval or request where appropriate;
- open the linked record without losing the inbox context;
- unlink with confirmation when the relationship has operational consequences.

### AI assistance

AI may summarise, classify intent, estimate risk, suggest priority and tags, and recommend a workflow. It may prepare a draft, but must not automatically publish or moderate in high-risk cases. Every recommendation identifies whether it came from AI or a deterministic rule and is correctable by a user.

### Moderation actions

Hide, unhide, delete, report, block, or similar actions appear only when the platform capability and connected-account permission have been verified. Actions with material external effects require:

- a confirmation modal;
- a structured reason;
- optional internal note;
- preservation of the source content and relevant identifiers;
- the platform response recorded in the audit trail;
- idempotency protection against duplicate execution.

The exact Meta Graph API methods, permissions, and SDK support for each moderation action are a pre-implementation verification gate. Official Meta help material confirms access-level concepts and native moderation behavior, but the developer documentation was rate-limited during this research and must be revalidated before the API contract is committed.

### Resolution

Resolution requires one reason:

- Answered
- Service issue resolved
- Moved to private support
- Client follow-up created
- No response required
- Duplicate
- Spam or abuse
- Reported to platform
- Escalated internally
- Awaiting longer-term work

The modal shows downstream effects, such as keeping a linked task open or scheduling a follow-up. A new inbound message on a resolved conversation reopens it and records the transition.

## Operating Model

| Conversation type | Default handling | Escalation and guardrail |
|---|---|---|
| Praise or harmless engagement | Engage where valuable, classify, resolve | No unnecessary case creation |
| Question or lead | Assign, answer, link CRM or task where useful | Protect personal details in public replies |
| Genuine complaint | Acknowledge publicly, move details private, create follow-up work | Do not hide merely because sentiment is negative |
| Misinformation | Correct factually and calmly | Require approval when legal, safety, or reputational risk is material |
| Suspected fake review | Preserve evidence and request platform review where supported | Require an adequate basis; do not label the author publicly |
| Spam, scam, hate, threat, or exposed personal data | Use verified moderation action and notify the appropriate team | Record reason and platform result; urgent human review for threats or PII |
| Legal, safety, media, or rapidly viral issue | Escalate immediately; pause automated public response | Client, leadership, PR, or legal approval required |

## Lifecycle and Data Model

### User-facing workflow states

- Needs owner
- In progress
- Waiting on customer
- Waiting internally
- Scheduled follow-up
- Resolved

The first release may derive these from existing `status`, assignment, and `snoozed_until` fields. A subsequent additive migration should make the workflow state explicit when reporting or automation needs exceed that mapping.

### Required operational fields

The design requires authoritative values for:

- intent;
- risk level and confidence;
- owning team and assignee;
- priority;
- waiting reason;
- follow-up time;
- resolution reason, resolver, and resolution time;
- escalation level and destination;
- moderation action, reason, actor, request, and platform result;
- linked task, client request, social campaign, and paid-media campaign.

New values should be additive, tenant-scoped, and represented in `social_conversation_events` so the audit trail remains authoritative. Structured columns should be used for values needed in filters, SLA calculations, automation, or reporting; descriptive detail can remain in event metadata.

### SLA behavior

- First-response time starts at the first actionable inbound message.
- Active resolution time runs while work is owned and actionable.
- `Waiting on customer` and `Scheduled follow-up` pause active resolution time.
- `Waiting internally` does not automatically pause the clock; the tenant policy controls this because internal delay should not silently improve service performance.
- Reopening resumes the active resolution timer without rewriting the original first-response metric.
- One resolution-time metric is authoritative in the interface and reporting.

## XeroFlow Integration Map

| XeroFlow area | Case Control behavior |
|---|---|
| Tasks and projects | Search, create, link, and show status without duplicating task management |
| Client requests and portal | Request approval or client action and show the decision in the case timeline |
| CRM | Show known relationship and prior activity only within permission and privacy constraints |
| Social publishing | Link the source post and organic campaign for content context |
| Paid media | Attach feedback to the related campaign and expose repeated negative themes |
| Listening and insights | Aggregate recurring issues, sentiment changes, and emerging risk across accounts |
| Notifications | Route by client, intent, risk, keyword, SLA, owning team, and account responsibility |
| Automation | Apply safe classifications and routing; require human confirmation for sensitive external actions |
| Analytics | Measure volume, first response, active resolution, reopen, approval, moderation, escalation, and outcome |

## Safety and Compliance Requirements

- Genuine negative commentary must not be hidden solely to improve appearance or sentiment metrics.
- Public drafts must exclude private CRM, financial, contact, service-history, and identity details unless the customer has already made that information public and reuse is appropriate.
- High-risk, legal, safety, threat, media, privacy, or viral cases cannot auto-publish.
- Suspected false or misleading reviews require evidence and platform review rather than public accusation.
- Every moderation action must be attributable to a human or named automation rule.
- Platform failures must leave the case open and actionable; the UI must not imply success before the platform confirms it.
- Permissions are enforced on the server even when the frontend hides an unavailable action.
- External mutations must use stable idempotency keys and store the provider response.

## Component and Technical Direction

The existing large action panel should be decomposed into focused components while keeping server state in the parent/composable layer. Suggested boundaries are:

- `CaseControlHeader`
- `CaseControlRecommendation`
- `CaseControlHandle`
- `CaseControlContext`
- `CaseControlActivity`
- `CaseControlFooter`
- `ResolutionModal`
- `ModerationModal`
- `RelatedWorkSelector`
- `FollowUpPopover`

The page owns the selected conversation and responsive panel presentation. A dedicated composable owns optimistic mutations, stale-response protection, refresh, and error recovery. Backend endpoints remain tenant-scoped and should expose a capability object so UI actions reflect confirmed platform and permission support.

## Delivery Phases

### Phase 1: Case Control UI

- Implement the new information architecture, responsive rail/slideover, sticky header and footer, and three tabs.
- Promote SLA, ownership, risk, and next action.
- Remove redundant read control and relocate platform/source details.
- Replace raw linked-record IDs with searchable selectors.
- Add reliable media fallback and unambiguous client/account/author labels.
- Reuse current status, assignment, priority, tags, AI triage, timeline, and `snoozed_until` behavior.

### Phase 2: Operational lifecycle

- Add explicit workflow, waiting, follow-up, resolution, escalation, and moderation semantics.
- Add team queues and routing rules.
- Define SLA clock behavior and reopen handling.
- Add moderation capability verification and human-confirmed actions.
- Expand event auditing and operational notifications.

### Phase 3: Portfolio intelligence

- Add account- and client-level trend reporting.
- Surface repeated complaints, campaign feedback, sentiment recovery, and emerging risk.
- Measure queues, SLA, outcomes, approvals, moderation, escalations, and workload.
- Add tenant-configurable automation once sufficient audit data validates the rules.

## Acceptance Criteria

### UI/UX

- A user can identify state, SLA, risk, owner, and recommended next action without scrolling.
- A user can take ownership, assign, set follow-up, add a note, link work, and resolve without leaving the panel.
- Handle, Context, and Activity have distinct purposes with no duplicated primary controls.
- The panel is usable at 360 pixels on wide desktop and becomes a slideover when the three-column layout would be cramped.
- All forms use Nuxt UI v4 components, visible `UFormField` labels, keyboard-accessible controls, semantic colours, and dark-mode-safe styling.
- Source media failure shows a deliberate fallback and never renders a broken-image icon.
- Account, client, page, campaign, and author labels cannot imply false ownership or merge unrelated companies.

### Operations

- Follow-up preserves ownership and reliably returns due work to the actionable queue.
- Resolution always records an outcome reason and reopens on a new inbound message.
- Searchable task and client-request links show enough context to avoid linking the wrong record.
- SLA clocks respond predictably to active, waiting, follow-up, resolved, and reopened states.
- Every assignment, approval, moderation, escalation, follow-up, and resolution change is auditable.

### Safety and platform behavior

- Unsupported platform actions are absent or disabled with an actionable explanation.
- Moderation requires confirmation and a reason, records the provider response, and cannot report success optimistically.
- High-risk cases cannot publish automatically.
- Privacy-sensitive context is excluded from public drafts and remains permission-controlled.
- Negative sentiment alone never triggers concealment of a genuine comment or review.

### Integrations and reporting

- Linked tasks, requests, campaigns, and approvals remain navigable and visible in the timeline.
- Automation and notifications can route on structured state, intent, risk, owner, SLA, and client.
- Reports can distinguish first response, active resolution, waiting, reopened, moderated, escalated, and resolved outcomes.

## Verification Strategy

- Component tests for responsive presentation, tab content, sticky controls, accessible labels, and conditional actions.
- Interaction tests for ownership, optimistic assignment/tagging, follow-up, linking, approval, resolution, and rollback after API failure.
- Server tests for tenant isolation, permissions, state transitions, SLA calculations, idempotency, and event creation.
- Contract tests for platform capability detection and provider failure mapping.
- Regression tests for all connected conversations loading by default, comment/review identity fallbacks, account/client attribution, and expiring source images.
- End-to-end browser tests at wide desktop, constrained desktop, and mobile/slideover widths in light and dark modes.
- Seeded UAT scenarios covering praise, lead, genuine complaint, fake-review suspicion, abuse, exposed personal information, legal escalation, and reopened follow-up.

## Rollout

- Introduce additive schema changes with backfill from existing status, assignment, and snooze values.
- Gate external moderation actions behind per-platform capabilities until official API and permission verification passes.
- Release the new UI with existing workflow semantics first, then enable explicit lifecycle fields and automation.
- Instrument action success, provider errors, time-to-first-action, resolution reason adoption, reopen rate, and panel usage.
- Preserve the existing panel behind a short-lived rollback flag until production behavior and audit data are confirmed.

## Deferred Decisions

These are deliberately deferred to implementation planning because they depend on measured scale or verified provider support:

- tenant-configurable SLA policy editing;
- user-defined resolution reason administration;
- bulk moderation actions;
- automatic cross-conversation identity matching;
- full macro and canned-response management;
- exact Meta moderation endpoints and permission matrix;
- workforce-capacity routing beyond account teams and explicit queues.

## Authoritative Sources

- [Sprinklr: New Third Pane](https://www.sprinklr.com/help/articles/case-third-pane/new-third-pane/63d68fb52c015d03d4e8020e)
- [Sprinklr: Standard Widget Overview](https://www.sprinklr.com/help/articles/standard-widgets/standard-widget-overview/63db9a96405d8861d65aa4b0)
- [Sprinklr: Unified Agent Desktop](https://www.sprinklr.com/help/articles/introduction-to-unified-agent-desktop/supercharge-agents-productivity-by-custom-aipowered-agent-desktop/63d6830c2c015d03d4e80182/)
- [Sprinklr: Case Summary](https://www.sprinklr.com/help/articles/case-summary/case-summary/63d6555e468ae80d39346a8e)
- [Sprout Social: Message Actions](https://support.sproutsocial.com/hc/en-us/articles/360000576406-Message-Actions)
- [Sprout Social: Automated Rules](https://support.sproutsocial.com/hc/en-us/articles/360016185371-Automated-Rules)
- [Sprout Social: Cases](https://support.sproutsocial.com/hc/en-us/articles/360000575123-How-do-I-use-cases-in-Sprout)
- [Sprout Social: Case Use Cases](https://support.sproutsocial.com/hc/en-us/articles/21862567685389-When-and-how-should-I-use-Cases-in-Sprout)
- [Sprout Social: Message Tagging](https://support.sproutsocial.com/hc/en-us/articles/360058625851-Message-management-with-tagging)
- [Hootsuite: Customisable Resolve Reasons](https://www.hootsuite.com/whats-new/customisable-resolve-reasons-in-inbox)
- [Hootsuite: Boomerangs](https://help.hootsuite.com/s/article/boomerang)
- [Hootsuite: Inbox API](https://apidocs.hootsuite.com/docs/api/inbox/index.html)
- [Hootsuite: Inbox Analytics Metrics](https://help.hootsuite.com/hc/en-us/articles/5407275943451-Create-custom-metrics-reports-for-Inbox-2-0)
- [Zendesk: Defining SLA Policies](https://support.zendesk.com/hc/en-us/articles/4408829459866-Defining-SLA-policies)
- [ACCC: Online Reviews for Products and Services](https://www.accc.gov.au/consumers/advertising-and-promotions/online-reviews-for-product-and-services)
- [OAIC: Exercise Caution When Responding to Negative Reviews](https://www.oaic.gov.au/news/blog/exercise-caution-when-responding-to-negative-reviews)
- [Meta: Facebook Page Access](https://www.facebook.com/help/289207354498410/r.php/)
- [Meta: Blocked Words and Hidden Comments](https://www.facebook.com/help/131671940241729?locale=en_GB)
- [Meta: Reporting Content and Community Standards](https://www.facebook.com/help/134552198624586/)

## Implementation Starting Points

- `app/pages/agency/social/inbox/index.vue`
- `app/components/social-inbox/ActionPanel.vue`
- the Social Inbox conversation, event, triage, sync, and reply API routes under `server/api/social-inbox/`
- the Social Inbox database migrations and conversation-event model
- shared task, client-request, CRM, campaign, approval, notification, and automation services
