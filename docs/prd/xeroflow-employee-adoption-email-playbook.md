# XeroFlow Employee Adoption Communication Playbook

## Document status

- Status: Proposed implementation contract
- Scope: Employee and contractor migration from Monday.com to XeroFlow
- Default rollout: Each migration wave starts 30 days before its own cutover (`wave_t0`), followed by a 30-day staff policy/reference-support period; technical Monday restriction and archive remain global Gate 7/8 actions in the retirement master plan
- Channels: Transactional email, XeroFlow in-app notifications, Slack, manager conversations
- Out of scope: Marketing email, public launch communications, implementation code, employment-performance policy

## Purpose

This playbook defines how XeroFlow should guide people from Monday.com into XeroFlow without creating notification fatigue, parallel sources of truth, inaccessible onboarding, privacy surprises, or a blame-oriented rollout.

The target outcome is not merely that a user receives an email or signs in. A user is activated when they can find their migrated work, verify it, and complete a meaningful work action in XeroFlow.

## Decision summary

1. Use organisation-wide communications for umbrella milestones and give each migration wave its own 30-day countdown, cutover and staff reference-support window. Technical restriction and archive are separate global milestones.
2. Pilot with managers and peer champions before inviting the broader workforce.
3. Make XeroFlow the sole system of record for staff work in a wave at that wave's cutover. Staff are policy-prohibited from ordinary Monday edits and every employee CTA/deep link points to the already-created XeroFlow job; the controlled migration bridge/service account may still write for approved sync and audit until the master plan disables it.
4. Use the first 30 days after wave cutover as a staff reference-support window. Do not claim technical Monday access is disabled until global Gate 7 passes, and do not archive a wave until the master plan's Gate 8 entry authorization is signed. Archive is not provider retirement; final Monday retirement remains the master plan's Gate 9 action.
5. Use contextual first-login guidance and a real, low-risk first task instead of a forced product tour.
6. Treat acknowledgement, authentication and meaningful product activity as adoption signals. Do not treat email opens as reliable evidence.
7. Send one primary notification per required action. Use other channels only as a fallback or for a clearly distinct purpose.
8. Respect employment status, leave, working hours, timezone and quiet-hour preferences before generating reminders.
9. Escalate unresolved blockers privately as support needs, never as public non-compliance.
10. Measure cohort-level adoption and operational outcomes. Avoid individual adoption rankings.
11. Use Cloudflare Email Service as the primary provider for all new XeroFlow board, adoption and Platform Ops transactional mail. Keep provider concerns behind the shared normalized `transactional_messages`, `transactional_message_attempts` and `transactional_quota_reservations` contract.

## Evidence and recommendation boundary

The sources below support the operating principles. Exact XeroFlow timings and thresholds in this document are product recommendations and should be tuned after the pilot.

### Evidence

- Microsoft frames change as a before/during/after program and recommends proactive communication plus post-change review. Microsoft also uses at least 30 days' notice for its own major changes that require customer action. This supports, but does not mandate, the 30-day XeroFlow notice period. [Microsoft 365 change guide](https://learn.microsoft.com/en-us/microsoft-365-apps/best-practices/microsoft-365-change-guide)
- Microsoft recommends measuring adoption through direct signals such as sign-ins and transactions, alongside interviews and surveys, and continuing reinforcement after go-live. [Microsoft transition and handover guidance](https://learn.microsoft.com/en-us/dynamics365/guidance/implementation-guide/change-management-transition-handover)
- Microsoft and Atlassian both recommend local champions, feedback loops, training and phased rollouts. [Microsoft Champions](https://adoption.microsoft.com/en-us/become-a-champion/), [Atlassian successful rollout guidance](https://www.atlassian.com/software/confluence/resources/guides/choosing-confluence/successful-rollout)
- Atlassian recommends communicating early and often, stating downtime and explaining what happens to the old system. It also recommends trial migrations before production. [Atlassian migration checklist](https://support.atlassian.com/migration/docs/plan-your-bitbucket-server-to-cloud-migration/)
- Nielsen Norman Group reports that forced onboarding tutorials are commonly skipped, quickly forgotten and do not necessarily improve task performance. It recommends contextual, dismissible and recallable help. [Onboarding tutorials versus contextual help](https://www.nngroup.com/articles/onboarding-tutorials/)
- Nielsen Norman Group's usability principles support familiar terminology, visible system status, recognition rather than recall, error prevention and concise contextual help. [Ten usability heuristics](https://www.nngroup.com/articles/ten-usability-heuristics/)
- Australia's Fair Work Ombudsman states that employees may refuse to monitor or respond to work contact outside working hours unless refusal would be unreasonable, and recommends agreeing expectations and channels in advance. [Right to disconnect](https://www.fairwork.gov.au/employment-conditions/right-to-disconnect), [discussing out-of-hours contact](https://www.fairwork.gov.au/employment-conditions/right-to-disconnect/discussing-the-right-to-disconnect)

### XeroFlow recommendations to validate in the pilot

- The precise reminder delays and escalation thresholds.
- The 30-day duration of the post-cutover staff reference-support period; this does not set the technical restriction or archive date.
- Whether Slack or email should be the preferred fallback for each cohort.
- Which action qualifies as the first meaningful task for each role.
- Target activation and retention rates.
- The voice used for the proposed transition catch-up campaign. The owner has not yet selected a final tone.

## Audience and eligibility model

Every recipient must have an authoritative workforce state before XeroFlow schedules a message.

| Cohort | Required treatment |
|---|---|
| Active employee | Use role, team, manager, timezone, working pattern and approved channel preferences. |
| Manager | Receive a briefing before their team and private support digests after direct support attempts. |
| Champion | Join the pilot, validate migrated work and training, and provide peer support. Champion status must not grant access beyond the person's normal role. |
| Contractor | Require an active contract window, sponsor, scoped access and end date. Do not assume employee-record privacy exemptions apply. |
| Person on leave | Suppress non-critical reminders until the next working day after the recorded return date. Route urgent work through ordinary delegation. |
| Departed person | Cancel pending messages, revoke access and reassign owned work. Send no adoption reminder. |
| Future starter | Do not include in the migration campaign until their employment or contract begins. Use normal new-starter onboarding instead. |
| Unknown or conflicting status | Do not send. Create an internal HR/IT resolution item. |

The eligibility snapshot must be refreshed immediately before every scheduled send. A user who became ineligible after scheduling must not receive the message.

## Adoption state model

XeroFlow should derive each person's state from authoritative events rather than a single campaign flag. Adoption state is scoped to `user_id + wave_id`; a person can be activated for one wave while still preparing for another.

| State | Entry condition | Exit condition |
|---|---|---|
| `eligible` | Active workforce identity, in-scope wave and valid access window | Wave invitation queued or eligibility removed |
| `invited` | Initial transactional invitation accepted by the sending service | Acknowledged, authenticated or terminal delivery failure |
| `acknowledged` | User explicitly acknowledges the cutover statement | Authenticated or eligibility removed |
| `authenticated` | Successful authentication after the wave invitation, or an existing active session confirmed for the wave | Migrated work reviewed |
| `work_reviewed` | User confirms migrated work or submits a migration discrepancy | First meaningful action |
| `activated` | User completes a role-appropriate meaningful action | Sustained-use window begins |
| `sustained` | User performs qualifying work in the defined 14- and 30-day windows | No terminal exit; measured over time |
| `blocked` | Access, migration, delivery or support issue prevents the next action | Blocker resolved or eligibility removed |
| `paused` | Leave, quiet-hours deferral or approved onboarding hold | Pause expires or an authorised operator resumes it |
| `ineligible` | Departed, expired contractor, wrong recipient or access removed | No automatic exit |

Email delivery acceptance must not advance a person beyond `invited`. Email open events, if another provider supplies them, must not advance adoption state. Organisation-wide announcement receipt is recorded separately and does not advance any wave's adoption state.

## Rollout cadence

Each migration wave has its own `wave_t0`, scoped resources and 30-day staff reference-support window. At `wave_t0`, XeroFlow becomes the sole system of record for staff work on that wave's resources. Staff are instructed and policy-prohibited from ordinary Monday edits, and all employee actions deep-link to the corresponding job already created in XeroFlow. This is a behavioural cutover, not proof that Monday permissions have changed: the controlled migration bridge/service account may continue approved writes for sync, reconciliation and audit.

Organisation-wide communications provide umbrella milestones: the migration program is starting, waves are underway, and the program is complete. They must not imply that a resource has moved before its wave reaches `wave_t0`.

A person who spans multiple waves receives:

- One organisation-wide announcement for the migration program.
- Separate readiness, cutover, first-task and staff reference-support notices for each applicable wave, plus only the global restriction/archive notices for which they are in scope.
- Resource-specific action notices only for resources in the referenced wave.

The scheduler must evaluate the source of truth per `wave_id + resource_id` immediately before rendering a message. If a person has resources on both sides of cutover, the message must name the wave/resources and must not make an unqualified statement such as `all of your work is now in XeroFlow`.

| Wave-relative timing | Communication and operational action | Audience and channel | Exit criterion |
|---|---|---|---|
| Wave T−30 to T−24 | Sponsor announcement for the first wave or one global umbrella announcement if this is the program's first wave: why the move is happening, wave schedule, what changes, what stays the same and support route | Personalised email; one company Slack announcement; manager talking points | Global announcement recorded once; wave audience and fallback route verified |
| Wave T−24 to T−18 | Wave champion and manager pilot; migration verification; support rehearsal | Live session, XeroFlow sandbox or pilot workspace, private champion Slack channel | Critical wave workflow and access defects resolved or explicitly accepted |
| Wave T−14 | Role-specific preview naming the wave and the person's in-wave board/task summary | Personalised email; optional team demonstration | User can access the wave preview or has a tracked blocker |
| Wave T−7 | Wave readiness request and cutover acknowledgement | Personalised email; in-app for pilot users | User acknowledges the wave cutover rule or enters reminder flow |
| Wave T−3 | Concise wave preparation notice; freeze timing and support coverage | Relevant team Slack announcement; email only to unacknowledged wave users | No unresolved critical wave communication blocker |
| Wave T0 | XeroFlow becomes the staff system of record for the wave; instruct staff not to edit affected Monday resources; direct every CTA/deep link to the corresponding XeroFlow job; contextual first-login or next-wave guidance begins. The controlled bridge may continue approved service-account writes. | Personalised email; relevant team Slack announcement; XeroFlow in-app guidance | User begins wave activation or enters support flow; no claim of technical Monday restriction |
| Wave T+1 to T+5 | Behaviour-triggered wave support only; no blanket daily campaign | One-to-one channel selected by state and preference | User activates for the wave or a blocker is owned |
| Wave T+7 | Wave stabilisation update: resolved issues, current help routes and known limitations | Relevant team Slack post; in-app release note | Known wave issues and ownership are visible |
| Wave T+14 | Wave adoption review and short confidence/friction pulse | Private manager support digest; two-question user survey | Remaining wave blockers have owners and due dates |
| Wave T+23 | Seven-day check-in before the end of the wave's initial reference-support period; repeat the XeroFlow-only staff editing rule without promising archive or access removal | Email to affected users with unresolved migration discrepancies; relevant team Slack announcement | Open discrepancies and support needs recorded |
| Wave T+29 | Final initial-support-period reminder for unresolved discrepancies | Only users with unresolved discrepancies or an unacknowledged support notice | Exceptions owned; no archive/access-removal claim |
| Wave T+30 | Close the wave's initial support review. Monday remains available under the current master-plan state; staff continue editing only in XeroFlow. | XeroFlow help article; targeted confirmation only where useful | Wave review complete; global Gate 7/8 status shown explicitly |
| Global Gate 7 scheduled | Announce the future technical restriction/restricted-audit date only after Gate 7 prerequisites and the communication checkpoint are signed; use future tense and do not claim access has already changed | Organisation-wide notice plus affected-user support follow-up | Scheduled state and support coverage recorded |
| Global Gate 7 passed | Confirm technically enforced Monday read-only or honestly labelled restricted-audit state only after effective access and zero-normal-user-write evidence pass | Organisation-wide confirmation plus durable help route | Gate 7 evidence revision signed |
| Global Gate 8 entry authorized | Announce normal-user access removal and board archive/restore window only after the master plan's Gate 8 entry criteria are signed | Organisation-wide notice plus affected-user email | Archive batches and support route match the signed Gate 8 entry-authorization evidence |

### Cutover rule

There must be no routine **staff** dual-write window. After a wave's `wave_t0`:

- New work and updates for that wave's resources belong in XeroFlow.
- Staff must not create or update the wave's work in Monday, even while their current Monday permissions remain technically capable of writing.
- Every staff CTA and deep link opens the corresponding already-created XeroFlow job, never an editable Monday item.
- The approved migration bridge/service account may continue bounded Monday writes for sync, reconciliation, audit and rollback evidence until the master plan's Gate 7 disables general outbound writes.
- Resources in a future wave remain governed by that future wave's current source-of-truth state.
- Missing data is reported through the migration support path, not corrected in Monday.com.
- A documented incident rollback may temporarily change this rule, but only the migration incident owner can invoke it.

Monday.com's non-Enterprise `View and comment` permission still permits updates and replies, so the playbook must not describe a wave T0 as technically read-only. Technical restriction is proven globally at master Gate 7 using supported viewer/account controls or restricted audit access; archive/access removal begins only under Gate 8. [Monday.com permissions](https://support.monday.com/hc/en-us/articles/360019222479-Permissions-on-monday-com)

Before any Monday.com archive operation, export active data and separately export required workdocs. Monday.com's account export excludes archived boards and workdocs. [Monday.com account export](https://support.monday.com/hc/en-us/articles/360002543719-How-to-export-your-entire-account-s-data)

## First-login, next-wave and first-task activation

### First-login experience

The first-login or next-wave experience must be contextual, dismissible and available again from a persistent `Migration help` entry.

1. Confirm the user's identity, team and local timezone.
2. Show: `Your {{wave_name}} Monday.com work is now in XeroFlow. Work in later waves stays in its current system until its cutover.`
3. Present familiar terminology:
   - Monday.com board → XeroFlow board
   - Monday.com item → XeroFlow task
   - Monday.com update → XeroFlow activity or comment
4. Display only three primary actions:
   - `Review my migrated work`
   - `Everything looks right`
   - `Report a migration issue`
5. Show contextual help when the user reaches an unfamiliar control. Do not front-load a multi-step tour.
6. Preserve progress if the user dismisses onboarding or leaves the session.
7. Announce save, success, loading and error states to assistive technology without unnecessarily moving focus.

### First meaningful task

Each role must have a low-risk, authentic activation action. Preferred examples are:

- Confirm the owner and status of one migrated assignment.
- Post one work update on a migrated task.
- Approve or return one proof where the user already owns that responsibility.
- Report a migration discrepancy through the embedded flow.

If editing production work carries material risk, XeroFlow must provide a clearly labelled practice task. Dismissing a tour, opening a page or clicking an email is not a meaningful action.

### Activation completion

A user becomes `activated` only after all applicable events occur:

1. Successful authentication.
2. Migrated-work view opened.
3. Migration accuracy confirmed or discrepancy submitted.
4. Role-appropriate meaningful action completed.

## Behaviour-triggered communication rules

All trigger state and delays are scoped to `user_id + wave_id`. All delays are measured in the person's working time, not elapsed wall-clock time. A `business day` means one of that person's scheduled working days.

| Trigger or edge case | Recommended action | Stop and escalation rules |
|---|---|---|
| Email appears unopened | Do not use as a decisive trigger. If there is still no acknowledgement or authentication after two business days, use one fallback channel. | Stop on acknowledgement or authentication. Never tell a manager that a person did not open an email. |
| No acknowledgement | After two business days, send one concise reminder explaining the exact statement being acknowledged. | Stop on acknowledgement. Acknowledgement proves receipt, not comprehension. |
| No login | T+1 business day: Slack DM if Slack is approved and the user is within working hours. T+3: concise email if deliverable. T+5: include in the manager support digest. | Stop on authentication. Suppress for leave, departure, expired contract or active access incident. |
| Logged in but no activity | After one business day, show contextual in-app help. After two business days, offer a short human help session through the preferred channel. | Escalate only when current assigned work depends on activation. |
| First task incomplete | Remind about the single next action and provide `Do this`, `Report a problem` and `Remind me next working day` actions. | Stop after any qualifying activation action or an owned blocker. |
| Ordinary task overdue | Notify in-app during working hours with task, due date, dependency, `Reschedule` and `Ask for help` actions. Follow the normal task escalation policy. | Do not create a harsher migration-specific escalation path. |
| Slack inactive or disconnected | Do not retry repeatedly. Fall back to email if deliverable, otherwise create an internal support item. | Suppress Slack until connection state changes. |
| Slack DND active | Queue ordinary messages until DND ends and the local working window opens. | Only a pre-agreed operational emergency may bypass DND. |
| Hard bounce | Mark the address email-ineligible immediately; ask IT/HR to validate it; use an approved internal fallback. | Never retry the same hard-bounced address or bypass provider suppression. |
| Soft bounce or deferred email | Allow the provider to perform its configured retries. Do not generate a duplicate email through another route. | Use fallback only after a terminal failure and dedupe check. |
| Provider rejection or suppression | Stop email and record the reason. Use a non-email support route if the person remains eligible. | Investigate complaints or policy rejection before re-enabling. |
| Spam complaint | Stop non-essential email to the address; preserve required operational notices through an approved alternative; review content and frequency. | Never manually bypass complaint suppression. |
| Person on leave | Pause non-critical reminders until the next scheduled working day after return; reassign urgent work through normal delegation. | Do not label leave as inactivity or include it in manager adoption metrics. |
| Departed person | Cancel scheduled messages, revoke XeroFlow access, transfer/reassign owned work and transfer Monday.com ownership before deactivation. | Send no reminder or retirement email. |
| Contractor | Send only during the active contract window, only for resources in scope and through the nominated sponsor. | Auto-expire access and cancel communications at contract end. |
| Unknown employment status | Do not send. Create an HR/IT resolution item containing only the minimum identifiers needed. | Resume only after authoritative correction. |
| Unknown timezone | Ask once in XeroFlow or use an approved workforce profile value. Until resolved, use the organisation's home timezone and its ordinary business window. | Do not infer timezone from email tracking pixels or IP address without notice. |
| Quiet hours | Queue ordinary email, Slack and push notifications until the next local working window. In-app inbox items may be stored silently. | Respect personal preferences where they are stricter than the organisation default. |
| Duplicate trigger | Update or suppress the existing communication for the same dedupe key. | Never create a second active reminder for the same required action and state version. |

Apple Mail Privacy Protection prevents senders from reliably determining whether a message was opened. XeroFlow must therefore use acknowledgement and product activity rather than opens as primary signals. [Apple Mail Privacy Protection](https://support.apple.com/en-gb/guide/icloud/mm90f7d05c96/icloud)

Slack supports DND and notification schedules, including local notification windows. [Slack notification schedules](https://slack.com/help/articles/214908388-Pause-your-Slack-notifications) Slack timezone changes keep reminders and notification schedules in local time. [Slack timezone preferences](https://slack.com/help/articles/219889247-Manage-your-time-zone-preferences)

## Cross-channel orchestration and deduplication

### Dedupe key

Every required communication must use this logical key:

```text
adoption:{tenant_id}:{user_id}:{wave_id_or_global}:{required_action}:{resource_id_or_global}:{migration_phase}:{state_version}
```

Definitions:

- `wave_id_or_global`: immutable wave identifier for wave/action notices; `global` only for the one umbrella program announcement or program-complete notice.
- `required_action`: for example `acknowledge_cutover`, `first_login`, `review_migrated_work`, `complete_first_task` or `review_retirement`.
- `resource_id_or_global`: board/task identifier when the action concerns a resource; otherwise `global`.
- `migration_phase`: `prepare`, `cutover`, `hypercare` or `retirement`.
- `state_version`: incremented only when the underlying requirement materially changes.

The same key applies across email, Slack and XeroFlow in-app delivery. Provider message IDs are delivery metadata, not dedupe keys. A person's global announcement key is reused across all waves, so it can be delivered only once. Per-wave action keys remain distinct, even when the same person or role spans waves.

Before enqueueing any source-of-truth notice, the orchestrator must compare every named resource's current wave state with the message claim. It must reject a message that combines resources whose source-of-truth states conflict. This prevents one wave's cutover notice from implying that future-wave Monday.com resources are already reference-only.

### Channel selection

1. If the user is active in XeroFlow and the message is not a formal durable notice, use in-app.
2. Otherwise, if Slack is approved, connected and not in DND, use Slack DM.
3. Otherwise, use transactional email if the recipient is deliverable.
4. If no direct channel is available, create an internal support item for the migration team or manager. Do not repeatedly retry all channels.

Formal company-wide milestones may be announced once by email and once in the designated Slack announcement channel. Those messages have different scopes from a personal action reminder and must not cause duplicate personal DMs.

### Suppression and completion

- Maintain one active personal notification per dedupe key.
- Apply a 24-hour cross-channel suppression period unless the underlying state changes.
- Acknowledgement or completion in any channel closes every pending delivery for that key.
- Cancel scheduled Slack and email jobs after completion or loss of eligibility.
- Reuse the global program-announcement key for a person in every wave; never create a second global announcement because another wave starts.
- Keep each wave's action keys separate and include the wave name and affected resources in rendered copy.
- Combine multiple low-priority actions into a single daily digest.
- Store the decision reason: `primary_channel`, `fallback_after_failure`, `formal_notice`, `digest` or `human_escalation`.
- Do not use `@channel`, `@here` or `@everyone` for personal adoption reminders.

Slack recommends matching message type to channel, exposing communication preferences, using digests for high-frequency notifications and avoiding broad mentions. [Slack messaging guidance](https://api.slack.com/best-practices/voice-and-tone)

## Manager escalation without shaming

### Escalation sequence

1. Give the individual a private, accessible support path.
2. Resolve known delivery, access, migration, leave or contract-state issues.
3. Escalate only if a current work obligation depends on the missing action.
4. Send managers one private digest rather than an alert per employee event.
5. State the observable condition and suggested support action. Do not infer motivation.

### Required language

Use:

- `Has not yet signed in`
- `May need help with access`
- `Reported a migrated-work discrepancy`
- `No action is required while this person is on leave`

Do not use:

- `Ignored the email`
- `Failed onboarding`
- `Non-compliant employee`
- Public rankings, red lists or leaderboards

### Manager digest example

> Three team members may need migration support: one has an access issue, one reported a migrated-work discrepancy, and one has not yet signed in. People on leave are excluded. Suggested next step: check whether they need help during the next team meeting.

Manager digests must not expose email-open telemetry, health or leave details, or unrelated behavioural history. Adoption support must remain separate from formal performance management unless an authorised HR process explicitly establishes otherwise.

This approach is consistent with Microsoft's recommendation for a positive, transparent adoption dynamic and the UK National Cyber Security Centre's warning that blame-oriented cultures suppress reporting. [Microsoft transition guidance](https://learn.microsoft.com/en-us/dynamics365/guidance/implementation-guide/change-management-transition-handover), [NCSC phishing guidance](https://www.ncsc.gov.uk/guidance/phishing)

## Role-tailored message module contract

**Decision status:** Proposed. The owner has requested creative job-tailored emails, but the final role taxonomy is owner-pending until the current taxonomy question is answered. Engineering may implement the deterministic module contract, but must not treat the proposed title mappings below as final production policy.

### Design principles

- Show the highest-precedence approved exact job title in the visible email header or greeting context. Role-family copy is secondary to exact-title display and must never replace it.
- Select copy from a versioned, owner-approved role-family module.
- Keep mapping deterministic and human-reviewable. Do not use a generative model to infer a role family or invent individualised copy.
- Do not personalise from task sentiment, inferred seniority, performance, health, leave reason, demographics or other sensitive data.
- Keep wave, resource, timezone and support details factual and sourced from authoritative records.
- Allow a recipient or administrator to report an incorrect title or module assignment.

### Current data gap and title precedence

The repository contains `team_members.title`, introduced by `server/database/migrations/add_title_column.sql` and documented there as the Monday.com job title. However, `server/api/agency/team-members.get.ts` currently does not select or expose `tm.title`; its UI response leans on role and department. The adoption sender must not launch title-tailored mail until this gap is closed and the title inventory is reviewed.

Resolve the visible title in this strict order:

1. Current Monday.com profile title from the approved migration snapshot.
2. `team_members.title` when populated and not contradicted by a newer approved Monday.com snapshot.
3. An owner-approved label assembled from department and custom role, clearly recorded as fallback rather than an exact imported title.
4. Neutral label `Team member` when none of the above is usable.

For each recipient, record `display_job_title`, `title_provenance`, `source_updated_at`, `title_resolution_status` and `owner_reviewed_at`. Normalisation may trim whitespace and standardise Unicode, but must not rewrite the displayed title or infer a more senior title.

Before sends begin:

1. Inventory titles across the Monday.com migration snapshot, `team_members.title`, department and custom role.
2. Backfill `team_members.title` from the approved Monday.com source where the match is unambiguous.
3. Produce a conflict report for missing, contradictory, malformed or duplicate identity/title records.
4. Have the owner review high-impact recipients and approve the exact-title map and role-family taxonomy version.
5. Expose the approved display title and provenance to the adoption renderer through a reviewed server-side contract.

Missing or ambiguous titles must behave as follows:

- Ordinary recipient with no conflicting high-risk access: use the neutral title and neutral role module, record the fallback, and create a taxonomy-review item.
- High-impact recipient: block the personalised adoption send until a human resolves or explicitly approves the fallback. High-impact includes Managers / Owners, Finance, Developers / Ops with platform or security access, migration owners and anyone receiving a source-of-truth or retirement control notice on behalf of others.
- A required security or legal notice must not be silently discarded by this gate; route it to the authorised operator for manual approval using neutral factual copy.
- Conflicting titles always outrank a merely missing title in the review queue. Do not choose the more senior-looking value automatically.

### Inputs and resolution

```text
role_module_input = {
  tenant_id,
  user_id,
  display_job_title,
  title_provenance,
  title_resolution_status,
  approved_role_family_id,
  role_mapping_version,
  message_template_id,
  wave_id,
  resource_scope,
  locale
}
```

Resolution order:

1. Resolve `display_job_title` through the approved precedence chain; preserve the chosen source spelling for display.
2. Resolve that approved title through the tenant's versioned `display_job_title -> role_family_id` table. Do not use substring, embedding or model-based inference.
3. Render the approved module for `role_family_id + message_template_id + module_version`.
4. If an ordinary-risk title is unmapped, render the neutral `general_operations` module and create a taxonomy-review item. For a high-impact recipient, apply the human-review gate above. A required operational notice follows its documented neutral-copy approval path rather than bypassing that gate.
5. Record the display title, provenance, resolution status, mapping version and module version on the immutable `transactional_messages` parent so a human can reproduce the decision.

Each role module must provide:

| Field | Contract |
|---|---|
| `role_family_id` | Stable identifier, not display copy |
| `module_version` | Immutable version used for audit and experiment analysis |
| `role_header` | Must contain `{{display_job_title}}`; maximum one line |
| `headline` | Creative but operational; no urgency, comparison with colleagues or performance inference |
| `value_sentence` | Explains the role-relevant reason for the transition |
| `first_action` | One role-appropriate, low-risk action |
| `support_sentence` | Named help path using supportive, non-blaming language |
| `allowed_template_ids` | Explicit allowlist of templates that may use the module |

### Proposed role families and module examples

The exact-title examples are illustrative and require owner approval. Production mapping is an explicit lookup table, not a title-keyword rule.

| Proposed role family | Example exact titles for owner review | Headline and value module | Suggested first action |
|---|---|---|---|
| Account Management | `Account Manager`, `Senior Account Manager`, `Account Director`, `Client Services Manager` | **Your client work, without the Monday.com treasure hunt.** Keep briefs, decisions, owners and next steps together so client conversations start with the current picture. | Open one migrated client task, confirm its owner and post the next client-facing update. |
| Marketing / Media | `Media Buyer`, `Performance Marketing Manager`, `Paid Search Specialist`, `Social Media Manager`, `Strategist` | **Campaign work should move at campaign speed.** XeroFlow connects briefs, budgets, approvals and delivery signals around the work your wave is moving. | Review one migrated campaign task and confirm its status, owner and next optimisation date. |
| Creative / Production | `Designer`, `Art Director`, `Copywriter`, `Producer`, `Video Editor`, `Creative Director` | **Less chasing, more making.** XeroFlow keeps the brief, feedback, proof and approval trail beside the work. | Open one migrated production task and confirm the latest brief or proof is the version the team should use. |
| Finance | `Finance Manager`, `Accountant`, `Accounts Receivable Officer`, `Bookkeeper` | **A cleaner trail from work delivered to money accounted for.** XeroFlow keeps operational context close to approvals, invoices and month-end follow-up. | Review one migrated finance-linked task and confirm its owner, status and supporting reference. |
| Managers / Owners | `Managing Director`, `Chief Executive Officer`, `Chief Operating Officer`, `General Manager`, `Department Head` | **See the work without asking for another status update.** XeroFlow gives leaders a current view of ownership, risk and delivery while teams keep working in context. | Open the wave overview, review one at-risk item and confirm the accountable owner. |
| Developers / Ops | `Software Engineer`, `Developer`, `DevOps Engineer`, `Platform Operations Engineer`, `IT Administrator` | **One operational trail from request to resolution.** XeroFlow keeps scope, ownership, dependencies and incident or delivery updates connected. | Review one migrated technical task and confirm its owner, current state and next verification step. |

The neutral fallback module is: **Your work is ready to continue in XeroFlow.** Review the resources in this wave, confirm that ownership and status are correct, and report anything that needs attention.

## Role-tailored email visual design contract

The email should feel recognisably XeroFlow and specific to the recipient's work without turning title personalisation into decoration for its own sake. The renderer must assemble a reusable, versioned shell from approved components; it must not generate a bespoke visual layout for each person.

### Reusable shell and composition

1. **XeroFlow masthead:** verified wordmark, official sender context and a restrained product-colour rule. The wordmark links only to the approved XeroFlow origin.
2. **Exact-title role card:** display `{{display_job_title}}`, `{{wave_name}}` and the approved role-family accent. The exact title remains text, never text baked into an image.
3. **Role-family visual:** one tasteful owner-approved icon or lightweight illustration for the mapped family. Account Management, Marketing / Media, Creative / Production, Finance, Managers / Owners and Developers / Ops each have a distinct but related accent; the neutral module uses the base XeroFlow treatment.
4. **Live work snapshot:** show only factual send-time values needed for the action, such as `{{migrated_item_count}}`, `{{items_needing_review_count}}` and `{{reference_end_local}}`. Label the snapshot `Current at {{snapshot_local_time}}` and link it to the relevant authenticated XeroFlow view. Do not render stale placeholders as zero.
5. **Single primary CTA:** one prominent, verb-led button for the message's required action. In every wave/resource action message it deep-links to the corresponding job that already exists in XeroFlow; clicking it must not create a job, and it must never open an editable Monday item. The global umbrella announcement may instead link to the XeroFlow migration schedule. Support, report-a-problem and reminder controls remain visually secondary text links.
6. **Human support footer:** named support route, official-origin reminder, privacy-safe preference or scheduling information and the logical message reference used by support.

The email visual manifest must record `shell_version`, `role_visual_id`, `role_visual_version`, `accent_token`, `snapshot_generated_at`, `snapshot_source`, `template_version` and `primary_cta_id` on the immutable `transactional_messages` parent. A reviewer must be able to reconstruct exactly which shell, content module and data snapshot a recipient saw.

### Visual safety and rendering rules

- Use role-family colour, iconography and illustration only to help recognition. Do not show productivity scores, rankings, attention maps, red/green employee status, surveillance motifs, employee photos or visuals that imply performance monitoring.
- Host decorative assets only on the controlled XeroFlow/Cloudflare image domain allowlisted by the email service. Do not load third-party trackers, remote fonts or role-specific assets from public design tools. Pin each asset to an immutable versioned URL.
- Give informative visuals concise alt text that communicates their purpose. Use empty `alt=""` for decorative assets. The title, live values, CTA and support route must remain understandable with images disabled.
- Maintain full plain-text parity: exact title, wave, role message, live snapshot timestamp and values, primary action URL, support route and later-wave disclaimer must all appear in the text part.
- Build the email with Outlook-safe presentation tables, inlined CSS and progressively enhanced rounded corners or decorative treatments. Do not rely on CSS grid, flexbox, background images, SVG, JavaScript or client-side dark-mode logic for meaning or action.
- Support 320-pixel mobile layouts, 200% text zoom, keyboard and screen-reader navigation, and both light and dark email-client modes. Preserve WCAG contrast in the base palette and in clients that partially or forcibly recolour content.
- Keep the content column compact, the role card and snapshot single-column on narrow screens, and the primary CTA at least 44 pixels high. Never place two competing filled buttons in one message.
- A failed image load, dark-mode override or unsupported CSS feature must degrade to the same factual message and action—not an empty hero, invisible logo or missing CTA.

Visual QA must cover Outlook desktop, Outlook web, Apple Mail, Gmail web/mobile, images-off mode, forced dark mode, plain text and the neutral role fallback. Snapshot fixtures must use synthetic data; employee production data must not be copied into visual-testing services.

## Proposed transition catch-up campaign

**Decision status:** Proposed and not approved for sending. The owner must select or revise the voice before this campaign is enabled. The role taxonomy is also owner-pending.

### Eligibility and purpose

This campaign is for a person whose applicable wave is already at or after `wave_t0` but who has not completed that wave's activation. It presents onboarding as operational catch-up to an established way of working, not as a test or a judgement.

It must not be sent when the person is on leave, departed, outside an active contract, blocked by a known access/migration incident, outside working hours, or assigned only to future waves.

Microsoft's guidance supports continued reinforcement and direct adoption measurement after go-live, while Atlassian recommends phased rollout, champions, training and clear explanation of how work changes. These sources support a catch-up intervention but do not prescribe its exact voice. [Microsoft transition and handover guidance](https://learn.microsoft.com/en-us/dynamics365/guidance/implementation-guide/change-management-transition-handover), [Atlassian successful rollout guidance](https://www.atlassian.com/software/confluence/resources/guides/choosing-confluence/successful-rollout)

### Voice options

| Option | Character | Strength | Risk/status |
|---|---|---|---|
| **A. Confident-supportive — recommended** | The transition is already here; the industry and organisation's operating model have moved forward; XeroFlow makes catching up straightforward and supported. | Creates momentum without accusing the recipient of falling behind. | Recommended for owner review; not final. |
| B. Direct-operational | States the active source of truth, the exact required action and support path with minimal narrative. | Lowest ambiguity and easiest to localise. | May feel impersonal for a change-adoption message. |
| C. Peer-led conversational | Frames the catch-up through champions and familiar team practice. | Warm and credible when a strong champion network exists. | Depends on real champion availability and may vary between teams. |

### Ready-to-send email draft for option A

**Subject:** A quick XeroFlow catch-up for `{{wave_name}}`

**Personalised role header:** `{{display_job_title}}` · `{{wave_name}}`

Hi `{{first_name}}`,

The transition is already here: `{{wave_name}}` work is now running in XeroFlow. The way the industry plans, hands over and tracks work has moved forward, and this short onboarding step will help you catch up with the operating flow now used for these resources.

`{{role_module_headline}}`

This is not a test, and you do not need to work it out alone. During your next working period, take about `{{estimated_minutes}}` minutes to:

1. Sign in through `{{known_company_portal_name}}`.
2. Review `{{migrated_work_summary}}`.
3. Complete this first step: `{{role_module_first_action}}`

`Continue my XeroFlow catch-up`

If access or migrated work does not look right, reply to this email or contact `{{support_contact}}` in `{{support_channel}}`. We'll help resolve the blocker.

Work assigned to a later migration wave stays in its current system until that wave's cutover notice.

Thanks,

`{{migration_contact}}`

### Ready-to-send Slack draft for option A

> **XeroFlow catch-up for `{{wave_name}}` — `{{display_job_title}}`**
>
> Hi `{{first_name}}` — the transition is already here for the resources in `{{wave_name}}`. The way the industry and our teams plan, hand over and track this work has moved forward, and your short onboarding catch-up is ready.
>
> `{{role_module_headline}}`
>
> During your next working period, review `{{migrated_work_summary}}` and complete: `{{role_module_first_action}}`
>
> **Continue my XeroFlow catch-up** · **Report a problem** · **Remind me next working day**
>
> This is support, not a test. `{{support_contact}}` can help if access or migrated work is not right. Later-wave work is not affected by this notice.

The Slack top-level `text` fallback must contain the wave name, approved display job title, first action, official XeroFlow destination and support route; Block Kit content must not be the only accessible copy.

## Personalised transactional email templates

All templates must render a plain-text alternative, use a verified XeroFlow sender, include the person's local date/time, and provide a named human support route. The greeting must render conversationally as `Hi <name>,`. The visible role header must include the approved display title resolved through the documented precedence chain, while the role-specific body module comes only from the deterministic role-family mapping defined above. Except for the global umbrella announcement's migration-schedule link, each primary CTA resolves through the allowlisted `{{xeroflow_job_url}}` for the already-created canonical job; authentication may preserve that destination, but the renderer blocks rather than linking to a creation route, missing job or editable Monday item.

### Template 1: Initial announcement

**Event:** Program T−30 global sponsor announcement

**Subject:** XeroFlow is becoming our work platform

**Personalised role header:** `{{display_job_title}}` · `{{team_name}}`

Hi `{{first_name}}`,

We're moving `{{organisation_name}}`'s work from Monday.com into XeroFlow in planned waves. Your affected work will move on the dates shown in your XeroFlow migration schedule.

**Primary CTA:** `View my migration schedule`

`{{role_module_headline}}`

`{{role_module_value_sentence}}`

The aim is to keep briefs, tasks, approvals and client work in one place. Your existing `{{board_count}}` boards and `{{assigned_task_count}}` assigned items are being prepared for you.

Nothing needs to be changed today. Before launch, we'll ask you to review your migrated work and share a short guide for your role.

For each wave, we'll tell you exactly which work is moving and when XeroFlow becomes its source of truth for staff. Any later technical Monday restriction, access removal or archive will be announced separately after the organisation-wide retirement gates are approved.

Questions or concerns are welcome. Reply to this email or contact `{{support_contact}}` in `{{support_channel}}`.

Thanks,

`{{sponsor_name}}`

### Template 2: Readiness and acknowledgement

**Event:** Wave T−7 readiness request

**Subject:** Please check your XeroFlow access before `{{readiness_due_date_local}}`

**Personalised role header:** `{{display_job_title}}` · `{{wave_name}}`

Hi `{{first_name}}`,

Your `{{wave_name}}` work is ready to review in XeroFlow.

For your work as `{{display_job_title}}`, start with: `{{role_module_first_action}}`

Please sign in through `{{known_company_portal_name}}` and check that:

- The listed `{{wave_name}}` work is visible.
- Your boards and project names look right.
- You understand that XeroFlow becomes the system of record for this wave on `{{cutover_date_local}}`.

**Primary CTA:** `Review my migrated work`

Secondary link: `Report a migration issue`

When you're done, select `I'm ready`. This confirms that you received the cutover information; it is not a test.

If you're on leave or should not have access, contact `{{support_contact}}` and we'll correct the schedule.

Thanks,

`{{migration_contact}}`

### Template 3: Go-live and first action

**Event:** Wave T0 cutover

**Subject:** `{{wave_name}}` is now live in XeroFlow

**Personalised role header:** `{{display_job_title}}` · `{{wave_name}}`

Hi `{{first_name}}`,

XeroFlow is now the place for staff to create and update the `{{wave_name}}` work listed below. Do not edit that work in Monday.com. Work assigned to a later wave stays in its current staff system until that wave's cutover notice.

`{{role_module_headline}}`

`{{role_module_value_sentence}}`

Your first step on `{{first_resource_name}}` is: `{{role_module_first_action}}`. Either confirm that it looks right or report what needs fixing.

**Primary CTA:** `Review my assigned work`

Your current Monday.com access may still show edit controls while the controlled migration bridge completes sync and audit work. For staff, those resources are reference-only from today; use the XeroFlow job linked above for every action. Technical restriction and archive will be announced separately only after the organisation-wide gates pass.

If anything feels unclear, use `Migration help` inside XeroFlow or reply to this email. A person will help.

Thanks,

`{{migration_contact}}`

### Template 4: No-login support reminder

**Event:** No authentication by the configured business-day threshold

**Subject:** Need help with your `{{wave_name}}` XeroFlow step?

**Personalised role header:** `{{display_job_title}}` · `{{wave_name}}`

Hi `{{first_name}}`,

It looks like your XeroFlow access step for `{{wave_name}}` has not yet been completed.

Your role-specific next step is: `{{role_module_first_action}}`

If you have not had time, you can do it during your next working period. If you tried and something went wrong, reply with the step you reached and we'll help.

Sign in through `{{known_company_portal_name}}` or manually enter `{{official_xeroflow_origin}}`. We will never ask for your password or MFA code by email or Slack.

**Primary CTA:** `Sign in to XeroFlow`

Your `{{wave_name}}` work: `{{migrated_work_summary}}`

Support: `{{support_contact}}`

Thanks,

`{{migration_contact}}`

### Template 5: Staff reference-only policy notice

**Event:** Wave T0 cutover confirmation

**Subject:** Use XeroFlow for all `{{wave_name}}` updates from today

**Personalised role header:** `{{display_job_title}}` · `{{wave_name}}`

Hi `{{first_name}}`,

The Monday.com resources listed for `{{wave_name}}` are now reference-only **for staff by policy**. Please create and update that work only in the corresponding XeroFlow jobs from today. Work assigned to later waves is not affected by this notice.

`{{role_module_value_sentence}}`

Monday may still display edit controls, and the controlled migration bridge/service account may still write for sync or audit. That does not change the staff instruction. If something is missing from XeroFlow, report it through `{{support_channel}}` rather than updating the old board. A future technical-restriction schedule will be announced only from signed Gate 7 prerequisites; technical restriction is not described as effective until Gate 7 passes, and archive requires the Gate 8 entry authorization.

**Primary CTA:** `Open XeroFlow`

Secondary link: `Report missing work`

Thanks,

`{{migration_contact}}`

### Template 6: Gate-approved Monday archive notice

**Event:** Global Gate 8 entry authorization signed; send on the approved archive-notice schedule

**Subject:** Monday.com archive begins on `{{archive_date_local}}`

**Personalised role header:** `{{display_job_title}}` · `{{wave_name}}`

Hi `{{first_name}}`,

The organisation-wide Monday.com archive window has been approved under the migration master plan. Normal-user access removal and archive batches begin on `{{archive_date_local}}` at `{{archive_time_local}}`. This notice must not be sent from a wave-relative timer; it requires the signed Gate 8 entry-authorization evidence revision `{{gate_evidence_revision}}`, which references the passed Gate 7 evidence.

Your migrated `{{wave_name}}` work is available in XeroFlow. Approved historical exports for this wave will remain available through `{{archive_location_or_request_process}}`.

For `{{display_job_title}}`, the relevant migration check is: `{{role_module_first_action}}`

If you believe something is missing, report it by `{{issue_deadline_local}}` so the migration team can check it before the relevant archive batch.

**Primary CTA:** `Review XeroFlow`

Secondary link: `Request migration help`

Thanks,

`{{migration_contact}}`

## Measurement framework

### Primary per-wave adoption funnel

1. Eligible users provisioned.
2. Wave invitation accepted by the recipient mail server or a valid fallback selected.
3. Cutover acknowledged.
4. Authentication or an existing active session confirmed for the wave.
5. Migrated work reviewed.
6. First meaningful task action.
7. Qualifying weekly active use.
8. Sustained use at 14 and 30 days.

### Required metrics

| Category | Metrics |
|---|---|
| Deliverability | Accepted, deferred, bounced, failed, rejected, suppressed and complained; delivery latency; fallback rate |
| Readiness | Acknowledgement within three and seven business days; reported access blockers; migrated-work discrepancy rate |
| Activation | First authentication within one, three and five business days; median time to migrated-work review; median time to meaningful action |
| Adoption | Weekly active users among people with active assignments; percentage of relevant transactions completed in XeroFlow; 14/30-day sustained use |
| Cutover quality | New edits to a wave's Monday.com resources after that wave's T0; unresolved migration discrepancies; support requests per 100 users; median support resolution time |
| Operational outcome | Task cycle time, overdue rate and workflow error rate compared with a pre-migration baseline |
| Experience | Two-question confidence/friction pulse; accessibility issues; requested accommodations and response time |

Email opens must be excluded from primary success measures. Clicks may be used only as diagnostic navigation events after privacy review and must not substitute for product activity.

Report adoption primarily at tenant, team and role cohort level. Use a minimum cohort size approved by the privacy owner before displaying breakdowns. Microsoft Adoption Score is a useful design precedent because its insights are calculated at organisational rather than individual level. [Microsoft Adoption Score](https://learn.microsoft.com/en-us/microsoft-365/admin/adoption/adoption-score?view=o365-worldwide)

## A/B testing plan

Experiments are permitted only for non-critical wording, timing and support presentation.

| Test | Variant A | Variant B | Primary outcome |
|---|---|---|---|
| Announcement subject | Benefit-led | Cutover-date-led | Readiness acknowledgement within seven business days |
| CTA | Role-specific next action | Generic `Open XeroFlow` | Meaningful action within three business days |
| First-task design | Seeded real, low-risk task | Onboarding checklist | Activation completion and error rate |
| Reminder delay | One business day | Two business days | Activation with complaint/support burden guardrails |
| Fallback channel | Slack-first for Slack-active users | Email-first | Activation and duplicate-contact rate |
| Support framing | Named human support | Generic help centre | Blocker resolution time |

Experiment guardrails:

- Do not vary cutover facts, security instructions, legal obligations or support eligibility.
- Randomise by team where cross-user discussion could contaminate individual assignment.
- Define one primary outcome and a fixed evaluation window before launch.
- Monitor complaints, accessibility failures, support load and unequal cohort outcomes.
- Stop a variant that creates material confusion or unequal access.
- Do not optimise for email opens.
- Do not use false urgency, loss framing or public social pressure.

## Accessibility requirements

- Meet WCAG 2.2 AA for XeroFlow onboarding and notification interfaces. [WCAG 2.2](https://www.w3.org/TR/WCAG22/)
- Use semantic headings, meaningful link text, concise language and informative alternatives for meaningful images. [W3C accessible writing guidance](https://www.w3.org/WAI/tips/writing/)
- Send multipart email with equivalent HTML and plain-text bodies.
- Do not convey action, priority, status or error through colour alone.
- Support keyboard operation, visible focus, text enlargement and responsive/mobile layouts.
- Mark dynamic in-app success, progress and error messages so assistive technologies announce them without unnecessary focus movement. [WCAG status messages](https://www.w3.org/WAI/WCAG22/Understanding/status-messages.html)
- Do not auto-launch an unskippable product tour or automatically change context when a control receives focus.
- Caption training videos and provide transcripts for audio/video content.
- Include all essential Slack information in the top-level `text` field because screen readers default to it. [Slack `chat.postMessage` accessibility guidance](https://docs.slack.dev/reference/methods/chat.postmessage)
- Test all six email templates, Slack messages and the first-login flow with screen readers, high-contrast mode, keyboard-only navigation and 200% zoom.
- Provide an accessible alternative support route and record accommodation requests without exposing them in adoption reports.

## Privacy and workplace requirements

- Tell people which adoption events XeroFlow collects, why they are collected, who can see them and how long they are retained.
- Collect only data reasonably necessary to operate and improve the migration. OAIC guidance expressly supports data minimisation and warns that over-collection increases breach harm. [OAIC APP 3 guidance](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-3-app-3-collection-of-solicited-personal-information)
- Do not derive attention, motivation, productivity or performance scores from notification activity.
- Do not infer timezone or location from tracking pixels or IP addresses without an approved purpose and notice.
- Separate migration telemetry from formal performance records.
- Restrict individual event access to authorised support, security or workforce administrators with a genuine operational need.
- Apply an approved retention period, then delete or de-identify event-level telemetry. OAIC APP 11 requires reasonable security and, where applicable, destruction or de-identification when information is no longer needed. [OAIC APP 11 guidance](https://www.oaic.gov.au/privacy/australian-privacy-principles/australian-privacy-principles-guidelines/chapter-11-app-11-security-of-personal-information)
- Review applicable Australian state and territory workplace-surveillance requirements. OAIC notes that disclosed workplace monitoring may be reasonable, while other laws can also apply. [OAIC workplace monitoring](https://www.oaic.gov.au/privacy/your-privacy-rights/surveillance-and-monitoring/workplace-monitoring-and-surveillance)
- Do not assume the private-sector employee-record exemption covers contractors, subcontractors or volunteers. [OAIC employee records exemption](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/organisations/employee-records-exemption)
- Respect local working patterns and the Australian right to disconnect. Ordinary reminders must be queued outside working hours. Any emergency override must be necessary, role-appropriate and covered by an agreed policy. [Fair Work right to disconnect](https://www.fairwork.gov.au/employment-conditions/right-to-disconnect)

This document is product guidance, not legal advice. The privacy and workplace owners must approve the final telemetry, retention, monitoring notice and emergency-contact policy before production rollout.

## Anti-phishing and email-security requirements

- Pre-announce the exact sender address, official XeroFlow origin and support contact in a trusted internal channel.
- Use a consistent display name, `From` address and `Reply-To` route.
- Configure and verify SPF, DKIM and DMARC. Move DMARC from monitoring to quarantine and then rejection only after legitimate traffic is verified. [Cloudflare email authentication](https://developers.cloudflare.com/email-service/concepts/email-authentication/)
- Do not ask for passwords, MFA codes, recovery codes, banking information or sensitive personal information in email or Slack.
- Prefer sign-in instructions through a known company portal. Where an email contains a CTA, expose the official destination and do not hide a lookalike or third-party domain behind it.
- Do not attach executables or unexpected documents.
- Avoid manufactured urgency and language resembling a phishing simulation.
- Provide an independent verification route, such as a pinned intranet/help article and a known support channel.
- Make suspected-message reporting simple and explicitly non-punitive.
- Use SSO and MFA, with account recovery outside the email itself.
- Minimise task or client detail in message bodies; link authenticated users to XeroFlow for sensitive context.

The NCSC recommends layered phishing defence, sender-domain authentication, simple reporting and a non-blaming culture. [NCSC phishing guidance](https://www.ncsc.gov.uk/guidance/phishing) Australia's ASD guidance supports central email controls plus SPF, DKIM and DMARC. [ASD email guidelines](https://www.cyber.gov.au/business-government/asds-cyber-security-frameworks/ism/cyber-security-guidelines/guidelines-for-email)

## Transactional email delivery standard

### Provider decision

- Cloudflare Email Service is the primary provider for all new XeroFlow board, employee-adoption and Platform Ops transactional email.
- New flows must integrate with the provider-neutral XeroFlow delivery contract, not call a provider directly from feature code.
- Existing Resend flows are legacy-only during a staged migration. They must be explicitly allowlisted by `message_type` and removed from the allowlist after migration.
- Resend must never be an automatic fallback for a Cloudflare deferred, failed, rejected, bounced, rate-limited or unavailable send. Automatic cross-provider retry risks duplicate mail, bypassed suppression and inconsistent reputation controls.
- A provider change is an operator-controlled routing decision made before an attempt begins. It reuses the same immutable logical parent and requires the same child-attempt idempotency, attempt-bound quota, suppression and audit checks as Cloudflare.

### Normalized provider-neutral XeroFlow message model

Every outbound purpose creates or reuses one channel-neutral logical parent before any channel/provider attempt. The three documents use these exact shared records:

```text
transactional_messages = {
  transactional_message_id,
  tenant_id,
  logical_event_key,
  canonical_recipient_id,
  template_purpose_id,
  source_feature,
  wave_id_or_global,
  resource_id_or_global,
  message_class,
  template_version,
  display_job_title,
  title_provenance,
  title_resolution_status,
  role_mapping_version,
  role_module_version,
  visual_manifest: {
    shell_version,
    role_visual_id,
    role_visual_version,
    accent_token,
    snapshot_generated_at,
    snapshot_source,
    primary_cta_id
  },
  dedupe_key,
  created_at
}

transactional_message_attempts = {
  transactional_message_attempt_id,
  transactional_message_id,
  channel,
  provider,
  attempt_idempotency_key,
  provider_message_id,
  attempt_status,
  scheduled_for,
  deferred_until,
  submitted_at,
  terminal_at,
  terminal_reason,
  fallback_reason,
  created_at,
  updated_at
}

transactional_quota_reservations = {
  quota_reservation_id,
  transactional_message_attempt_id,
  reservation_key,
  tenant_id,
  channel,
  quota_bucket,
  configured_window,
  reserved_at,
  released_at
}
```

Required semantics:

- `transactional_messages` is unique on `(tenant_id, logical_event_key, canonical_recipient_id, template_purpose_id)`. This immutable logical-event/recipient/template-purpose identity is the cross-channel dedupe authority; channel is never part of parent uniqueness.
- The logical parent contains no channel, provider, delivery status, provider attempt or quota reservation. Scheduling/eligibility remains in the source orchestrator, while delivery state belongs to attempts.
- `transactional_message_attempts` is an append-only set of children unique on `(transactional_message_id, channel, provider, attempt_idempotency_key)`: never delete or repurpose a child. Generate the idempotency key before submission and reuse that child's identity for provider-managed retries and replayed workers; status is an idempotent projection of append-only provider/worker events.
- Attempt statuses are `scheduled`, `deferred`, `submitting`, `provider_retrying`, `delivered`, `terminal_failed`, `suppressed`, `complained` and `cancelled`. `delivered`, `terminal_failed`, `suppressed`, `complained` and `cancelled` are terminal for an attempt.
- An approved alternative channel appends one child attempt to the same logical parent with an explicit fallback reason; it never creates another parent.
- Provider events are consumed at least once, deduplicated by provider event ID and reconciled to the child attempt. Provider-specific response data stays as bounded attempt/event metadata.
- Suppression is evaluated before creating a quota reservation and again immediately before provider submission.

### Provider-neutral quota contract

- Attach each reservation to the intended outbound `transactional_message_attempt_id` and reserve atomically before changing that attempt from `scheduled` or `deferred` to `submitting`.
- Compute quota by `tenant_id + message_class + configured_window`, with additional per-recipient frequency caps. Limits are configuration, not provider constants.
- Enforce unique `transactional_message_attempt_id` and unique `reservation_key` in `transactional_quota_reservations`, so a worker replay or concurrent retry cannot reserve twice.
- A provider-managed retry for a deferred Cloudflare attempt reuses that attempt and its original reservation. It cannot trigger another reservation or fallback attempt.
- Release a reservation only when its intended attempt is cancelled before submission or the quota policy explicitly permits release.
- When quota is unavailable, keep the intended attempt `deferred` and set its `deferred_until` to the next eligible working-time window; do not route to Resend.
- Security/emergency priority may use a separately approved quota bucket, but it does not automatically override suppression, access state or right-to-disconnect policy.
- Feature code receives a provider-neutral orchestration result and references the logical parent plus any current attempt; it does not infer delivery state from the parent.

## Cloudflare Email Service constraints

As of July 2026, Cloudflare Email Service is documented for transactional email, is labelled Beta and requires Cloudflare DNS. It supports Workers bindings, REST and SMTP. It is the selected primary provider for new board, adoption and Platform Ops transactional mail; production rollout remains gated on confirming Beta suitability, account limits and the operational fallback procedure. [Cloudflare Email Service](https://developers.cloudflare.com/email-service/), [send-email guide](https://developers.cloudflare.com/email-service/get-started/send-emails/)

Implementation constraints:

- Treat `message.delivered` as acceptance by the recipient mail server, not proof of inbox placement or reading.
- Consume the six documented lifecycle events: `message.delivered`, `message.deferred`, `message.bounced`, `message.failed`, `message.rejected` and `message.complained`. The documented event set does not include opens or clicks. [Cloudflare event subscriptions](https://developers.cloudflare.com/email-service/platform/event-subscriptions/)
- Allow Cloudflare to retry soft bounces with its exponential-backoff flow.
- Treat hard bounces as terminal and keep the address suppressed.
- Do not bypass provider suppression for complaints or hard bounces.
- Keep provider event handling idempotent by `eventId`; reconcile it to the append-only `transactional_message_attempts` child, while `transactional_messages` remains the cross-channel dedupe authority.
- Subscribe delivery events into a queue or equivalent durable consumer and update recipient eligibility from terminal events. [Cloudflare recipient synchronisation example](https://developers.cloudflare.com/email-service/examples/email-sending/sync-recipient-records/)
- Use a dedicated transactional subdomain so unrelated traffic does not share reputation with operational notices.
- Monitor Cloudflare's published deliverability guide values: delivery above 95%, hard bounces below 2% and complaints below 0.1%. These are delivery-health guardrails, not XeroFlow adoption targets. [Cloudflare deliverability guidance](https://developers.cloudflare.com/email-service/concepts/deliverability/)
- Retain only the minimum message metadata needed for delivery support and audit. Do not enable or retain email content previews longer than the approved support need.
- Provide an operator-controlled channel or provider recovery procedure for a Cloudflare outage or account-level rejection without sending duplicates after delayed recovery. Resend is not an automatic fallback.

## Executable per-wave acceptance tests

Run this suite for every migration wave with a unique `wave_id`. The harness must freeze the user's timezone and working calendar, use a fake clock, capture provider calls, and query `transactional_messages`, `transactional_message_attempts` and `transactional_quota_reservations` after each step. Re-running a scheduler or event consumer represents at-least-once execution and must not change the asserted parent, attempt or reservation counts.

### `WAVE-01`: one global announcement across multiple waves

**Given** user `U1` belongs to waves `W1` and `W2`, and no global-announcement `transactional_messages` parent exists.

**When** the umbrella announcement scheduler runs for `W1`, then runs again when `W2` opens.

**Then**:

- Exactly one `transactional_messages` parent exists for `adoption:{tenant}:U1:global:announce_program:global:prepare:{version}`.
- Exactly one successful direct-channel attempt exists for that row.
- No second global announcement is created for `W2`.
- Wave-specific readiness rows for `W1` and `W2` may both exist with their respective wave IDs.

### `WAVE-02`: mixed-wave source-of-truth isolation

**Given** `W1` is at T+1, `W2` is at T−10, and `U1` owns resources in both waves.

**When** XeroFlow renders the `W1` cutover notice.

**Then**:

- The notice names `W1` and contains only `W1` resource IDs.
- The notice states that later-wave work remains in its current system.
- The source-of-truth validator rejects any rendered payload claiming that the `W2` resources are reference-only.
- `W2` keeps its own future-wave action key and schedule.

### `WAVE-03`: Slack disconnected produces exactly one fallback

**Given** one `W1` personal action is scheduled for Slack, its dedupe key has no completed attempt, Slack is disconnected at submission time, and email is eligible.

**When** the Slack attempt terminates with `slack_disconnected` and the fallback worker is executed twice.

**Then**:

- Exactly one fallback attempt is appended under the same `transactional_messages` parent with `channel=email`, `provider=cloudflare` and `fallback_reason=slack_disconnected`.
- No second email attempt exists.
- No Resend attempt exists.
- The Slack integration remains suppressed until its connection state changes.

Executable assertion:

```text
count(transactional_message_attempts where transactional_message_id=L and channel=email and fallback_reason=slack_disconnected) == 1
count(transactional_message_attempts where transactional_message_id=L and provider=resend) == 0
```

### `WAVE-04`: Slack DND and quiet hours defer delivery

**Given** a `W1` Slack reminder is due while the recipient is in Slack DND and outside their approved local working window.

**When** the scheduler evaluates the reminder.

**Then**:

- The intended Slack child attempt becomes `deferred`; the channel-neutral parent remains immutable.
- The attempt's `deferred_until` equals the later of DND end and the next approved working-window start.
- No Slack, Cloudflare or Resend provider call occurs before `deferred_until`.
- At the first eligible scheduler run, exactly one Slack attempt occurs if Slack is connected; otherwise `WAVE-03` applies.

### `WAVE-05`: leave recorded after scheduling cancels delivery

**Given** a non-critical `W1` reminder is scheduled and the workforce source records leave before provider submission.

**When** the workforce-state event is consumed and the scheduler later reaches the original due time.

**Then**:

- The unsubmitted attempt becomes `cancelled` with `terminal_reason=leave`; the source adoption requirement is closed while the logical parent remains immutable.
- No Slack, Cloudflare or Resend call occurs.
- The original logical message is not automatically reactivated.
- If the action remains required after return, a new eligible state version may schedule it for the next working day.

### `WAVE-06`: departure recorded after scheduling cancels permanently

**Given** a `W1` adoption or retirement message is scheduled and the authoritative workforce source marks the person departed before provider submission.

**When** the workforce-state event and scheduler are each executed twice.

**Then**:

- Every unsubmitted attempt is `cancelled` with `terminal_reason=departed`, and the source adoption requirement is permanently closed; the logical parent remains immutable.
- No provider call occurs.
- No new adoption row can be created for that user without an explicit authoritative reactivation event.

### `WAVE-07`: delayed provider retry cannot create a duplicate fallback

**Given** a Cloudflare email attempt for `W1` emitted `message.deferred`, has `attempt_status=provider_retrying`, and Cloudflare retries remain active.

**When** the fallback scheduler and the same deferred event are each processed twice.

**Then**:

- The original Cloudflare attempt and quota reservation are reused.
- No Slack or second email fallback attempt is created while retries remain active.
- No Resend attempt exists.
- A later `message.delivered` marks the original child `delivered` and closes remaining source-orchestrator work for that parent without fallback.
- Only a terminal Cloudflare failure may make an alternative non-email channel eligible, and repeated terminal events can append at most one approved fallback attempt.

Executable assertion while retrying:

```text
count(transactional_message_attempts where transactional_message_id=L) == 1
count(transactional_message_attempts where transactional_message_id=L and fallback_reason is not null) == 0
count(transactional_message_attempts where transactional_message_id=L and provider=resend) == 0
count(transactional_quota_reservations where transactional_message_attempt_id=A) == 1
```

### `WAVE-08`: exact-title precedence is deterministic

**Given** `U1` has an approved Monday.com profile title `Senior Account Manager`, an older `team_members.title` value `Account Manager`, and an approved mapping version that maps the exact Monday.com title to Account Management.

**When** a `W1` email is rendered twice.

**Then**:

- Both renders show `Senior Account Manager` exactly in the role header.
- Both renders use the same Account Management module and module version.
- The `transactional_messages` parent records `title_provenance=monday_profile` and the mapping/module versions.
- No free-form model or title-keyword inference is invoked.

### `WAVE-09`: unresolved high-impact title blocks the personalised send

**Given** a Finance recipient has contradictory Monday.com and `team_members.title` values, the conflict is not owner-reviewed, and a `W1` adoption message is due.

**When** the scheduler runs twice.

**Then**:

- The source adoption requirement remains blocked with `block_reason=title_review_required`; the channel-neutral parent, if already materialized, gains no delivery status.
- No quota is reserved and no Slack, Cloudflare or Resend attempt exists.
- Exactly one human title-review item exists.
- A required security/legal notice is routed for manual neutral-copy approval rather than silently discarded.

### `WAVE-10`: wave T+30 cannot trigger technical restriction or archive

**Given** `W1` reaches T+30, the controlled bridge/service account is still approved, global Gate 7 has not passed and no Gate 8 entry authorization is signed.

**When** the wave scheduler and communication renderer each run twice.

**Then**:

- No Monday permission mutation, access removal, board archive or retirement operation is enqueued.
- No communication claims that Monday is technically read-only, access has ended or the wave has been archived.
- Any staff-facing action still deep-links to the corresponding already-created XeroFlow job and repeats the policy prohibition on ordinary Monday edits.
- The bridge/service account remains eligible for only its bounded sync/reconciliation/audit operations.
- A Gate 7 restriction notice can be scheduled only from signed global Gate 7 evidence, and a Gate 8 archive notice can be scheduled only from the separately signed Gate 8 entry-authorization evidence revision; neither uses the wave T+30 timer.

## Implementation checklist

### Governance and data

- [ ] Name a rollout owner, workforce-data owner, privacy owner, accessibility owner, security owner and support owner.
- [ ] Approve active employee, leave, departed and contractor eligibility sources and precedence.
- [ ] Approve event-level telemetry, manager visibility, minimum cohort size and retention period.
- [ ] Approve ordinary working windows, personal quiet-hour precedence and emergency override policy.
- [ ] Document the authoritative XeroFlow URL, sender identity and independent verification route.
- [ ] Obtain owner approval for the final role taxonomy and the transition catch-up campaign voice before enabling either in production.
- [ ] Inventory and reconcile Monday.com profile titles, `team_members.title`, department and custom role; backfill unambiguous titles and review conflicts.
- [ ] Expose the approved display title and provenance to the server-side renderer; do not rely on the current team-members response until it includes the reviewed title contract.
- [ ] Block personalised sends to unresolved high-impact recipients and route required legal/security notices for manual approval.

### Migration readiness

- [ ] Run a test migration with managers and representative champions.
- [ ] Validate role permissions, assignment ownership, attachments, comments, dates, automations and integrations.
- [ ] Export active Monday.com content and required workdocs before archive.
- [ ] Verify wave T0 copy says staff edits are policy-prohibited without claiming technical restriction; reserve effective-access verification for global Gate 7.
- [ ] Transfer ownership before deactivating departed Monday.com users.
- [ ] Define and test the incident rollback authority and message.
- [ ] Assign an immutable `wave_id`, `wave_t0`, resource scope and reference-support review time to every migration wave; derive technical restriction from the global Gate 7 process and archive dates only from signed Gate 8 entry authorization.
- [ ] Verify every resource belongs to exactly one active source-of-truth wave at a time.

### Orchestration

- [ ] Implement the adoption states and eligibility refresh before every send.
- [ ] Implement the documented cross-channel dedupe key.
- [ ] Close pending messages after acknowledgement or completion in any channel.
- [ ] Cancel scheduled jobs when a user goes on leave, departs or reaches contract end.
- [ ] Queue ordinary messages outside local working hours and Slack DND.
- [ ] Implement daily digests for multiple low-priority actions.
- [ ] Keep formal milestone announcements separate from personal reminder state.
- [ ] Reuse one global announcement key per person across waves and create resource-scoped action keys per wave.
- [ ] Reject a notice that combines resources with conflicting source-of-truth states.
- [ ] Run `WAVE-01` through `WAVE-10` for every wave before enabling scheduled sends.

### Email and Slack

- [ ] Route all new board, adoption and Platform Ops transactional mail through the provider-neutral XeroFlow delivery service with Cloudflare Email Service as primary.
- [ ] Inventory and explicitly allowlist legacy Resend message types; verify Resend is never selected as automatic fallback.
- [ ] Implement immutable `transactional_messages` parents, append-only `transactional_message_attempts` children and attempt-bound unique `transactional_quota_reservations` exactly as specified; keep channel/provider/status/quota off the parent.
- [ ] Configure the verified transactional sending subdomain, SPF, DKIM and DMARC.
- [ ] Render and test all six templates in HTML and plain text.
- [ ] Implement the versioned XeroFlow email shell, approved role-family visuals, exact-title role card, timestamped live snapshot and one primary CTA; record the visual manifest on `transactional_messages`.
- [ ] Host immutable decorative assets only on the controlled XeroFlow/Cloudflare image domain and verify alt text, images-off, forced-dark-mode, mobile and Outlook-safe rendering.
- [ ] Include the official XeroFlow origin and the no-password/no-MFA-code warning in access reminders.
- [ ] Consume delivered, deferred, bounced, failed, rejected and complained events idempotently.
- [ ] Suppress hard bounces and complaints without manual bypass.
- [ ] Provide complete accessible Slack fallback text and avoid broad mentions.
- [ ] Verify fallback behavior does not duplicate delayed email or Slack delivery.
- [ ] Verify a provider-managed retry reuses the original quota reservation and does not create a fallback attempt.

### Product and support

- [ ] Implement dismissible, recallable first-login guidance.
- [ ] Define one low-risk meaningful activation action for every role.
- [ ] Provide `Everything looks right` and `Report a migration issue` paths.
- [ ] Route access and migration blockers to named owners with response targets.
- [ ] Provide managers with private support digests using neutral language.
- [ ] Keep leave and accommodation information out of adoption reports.
- [ ] Render the authoritative display job title and the approved deterministic role-family module; expose a title/module correction path.
- [ ] Keep the proposed catch-up campaign disabled until the owner selects a voice.

### Measurement and experimentation

- [ ] Instrument the complete adoption funnel without relying on email opens.
- [ ] Capture baseline task-cycle, overdue and error measures before cutover.
- [ ] Create cohort dashboards with approved minimum group sizes.
- [ ] Pre-register each A/B test's hypothesis, assignment unit, primary outcome, window and guardrails.
- [ ] Monitor deliverability, complaints, support burden, accessibility failures and unequal cohort outcomes.
- [ ] Review results at each wave's T+7, T+14 and T+30 and document changes to thresholds.

## Acceptance criteria

The playbook is ready for production use when all of the following are true:

1. Every scheduled recipient resolves to exactly one eligible workforce state, timezone and working pattern, or the send is blocked for review.
2. A leave change cancels pending non-critical messages; a departure or contract-end change cancels every pending adoption message before its next delivery attempt.
3. The same personal required action for the same wave and resource cannot create more than one active notification across email, Slack and in-app delivery.
4. Completing or acknowledging an action in any channel cancels all pending deliveries for its dedupe key.
5. Hard-bounced, complained and provider-suppressed recipients are not retried by email.
6. Soft-bounced messages are not duplicated while provider retries remain active.
7. No adoption reminder is delivered outside the recipient's approved working window or Slack DND unless a documented emergency override applies.
8. The first-login journey is keyboard accessible, dismissible, recallable and does not require memorising an upfront tour.
9. Activation requires authentication, migrated-work review and one role-appropriate meaningful action.
10. Manager escalation occurs only after direct support, known-blocker checks and eligibility checks; its language is neutral and private.
11. Every wave has its own immutable `wave_id`, T0, resource scope and staff reference-support window; at T0, copy policy-prohibits ordinary Monday edits and all staff CTAs/deep links target already-created XeroFlow jobs without claiming technical restriction.
12. A person spanning waves receives one global program announcement and separate, correctly scoped action notices for each wave.
13. The renderer rejects a source-of-truth notice that combines resources in conflicting wave states.
14. Active Monday.com data and required workdocs are exported and verified before the signed global Gate 8 entry authorization permits archive batches; no wave-relative timer can authorize archive or retirement.
15. All six standard emails and the proposed catch-up draft pass HTML/plain-text rendering, screen-reader, meaningful-link, contrast, mobile, forced-dark-mode, images-off and Outlook-client checks.
16. Email and Slack messages identify the official XeroFlow origin and never request a password or MFA code.
17. Adoption dashboards exclude email opens as a success metric and suppress cohorts below the approved privacy threshold.
18. Cloudflare lifecycle events are processed idempotently and reconcile to append-only `transactional_message_attempts` under the correct immutable `transactional_messages` parent.
19. Cloudflare Email Service is primary for every new board, adoption and Platform Ops transactional message; Resend is legacy-only, explicitly allowlisted and never an automatic fallback.
20. Quota is reserved atomically once per intended outbound attempt, `transactional_quota_reservations` is unique by attempt and reservation key, and provider-managed retries reuse both the attempt and reservation.
21. `WAVE-03` proves Slack disconnection creates exactly one Cloudflare fallback and zero Resend attempts.
22. `WAVE-04` proves Slack DND/quiet-hours messages are deferred without any early provider call.
23. `WAVE-05` and `WAVE-06` prove leave or departure after scheduling cancels delivery before provider submission.
24. `WAVE-07` proves a delayed Cloudflare retry creates no duplicate or fallback attempt.
25. Exact display-title provenance is recorded, the owner has approved the final taxonomy version, unresolved high-impact recipients are gated, and role-family selection is deterministic and reproducible.
26. `WAVE-08` proves exact-title precedence and module selection are deterministic without free-form inference.
27. `WAVE-09` proves unresolved high-impact title conflicts block personalised delivery and create exactly one human review item.
28. `WAVE-10` proves wave T+30 cannot technically restrict, remove access, archive or retire Monday; global Gate 7 evidence and Gate 8 entry authorization alone schedule those milestones while bounded bridge writes may continue beforehand.
29. The transition catch-up campaign remains disabled until the owner chooses or revises a voice.
30. Delivery, bounce and complaint guardrails are monitored with an owned response procedure.
31. Privacy, workplace, accessibility, security and support owners approve the production rollout.
32. Every HTML email uses the versioned XeroFlow shell, exact-title role card, approved role-family visual, timestamped live snapshot and one prominent CTA; `transactional_messages` records the complete visual manifest and plain text preserves the same actionable facts.
33. Every wave/resource CTA opens the corresponding job already created in XeroFlow; it never creates a job on click or opens an editable Monday item.
34. No email visual presents surveillance, ranking or performance judgement, and all decorative assets resolve from an immutable URL on the controlled XeroFlow/Cloudflare image domain.
