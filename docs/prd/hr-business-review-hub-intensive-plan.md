# HR Business Review Hub — Intensive Product and Implementation Plan

**Status:** Foundation implemented — owner/privacy approval still required before live employee review use
**Date:** 10 July 2026
**Product area:** Agency platform / HR / business operations
**Primary sponsor:** Business owner
**Jurisdictional assumption:** Private-sector Australian employer operating primarily in Victoria

## 1. Decision summary

Build an **HR Business Review Hub** with two deliberately separate but connected processes:

1. **Business and role clarity review** — identifies workload, role drift, duplicated ownership, process friction, unclear priorities, missing authority, and organisational risks.
2. **Individual role and delivery review** — compares an employee's acknowledged role profile with agreed outcomes and attributable evidence, while preserving the employee's right to see and respond to the material used.

Build transparent, role-specific performance scorecards that can produce an overall Role Performance Score only when the role standard, weights, observation period, and minimum evidence threshold were approved before the review. Always show dimension scores, benchmark sources, operational context, and evidence confidence beside the overall score. Do **not** build a universal cross-role score, employee leaderboard, or automated adverse verdict. Do **not** treat message volume, presence, hours online, sentiment, or communication style as proxies for performance.

The first product experience is a private **Owner Discovery Onboarding**. The owner answers a structured questionnaire about the business, roles, responsibilities, workflows, review objectives, known constraints, data sources, visibility, and prohibited uses. The platform turns the approved answers into a versioned Business Context Brief.

After onboarding, approved platform, Monday, shared-channel, and shared-mailbox evidence can be used to build **process profiles**: recurring work, owners, handoffs, decision points, delays, rework, and responsibility gaps. These are business-process profiles, not inferred personality profiles or automatic employee judgements. Private messages and private mailboxes are excluded by default.

The platform then recommends a questionnaire for each team member from an approved question bank using their acknowledged role, contractual responsibilities, actual workflow involvement, and unresolved business questions. The owner must see the reason for every recommended question and approve the final questionnaire before it is sent. No questionnaire is sent automatically.

All approved context, profiles, policies, evidence definitions, questionnaires, findings, outcomes, and solution playbooks are collated into a private **HR Review Knowledge Base**. It is isolated from the platform's general knowledge/search/AI memory and exists to make each questionnaire relevant, neutral, evidence-aware, and actionable.

Every issued questionnaire has a required end date, private in-app/email notification, scheduled reminders, an overdue/extension workflow, and a calendar invitation. One-to-one review meetings also produce updateable/cancellable calendar invitations.

The first release should prove the workflow with manual role profiles, questionnaires, interviews, findings, and action plans. Existing platform and Monday data can be added next. Slack/email ingestion and AI-assisted analysis remain gated behind a privacy impact assessment, staff notice/consultation, explicit source scopes, and a separate release decision.

### 1.1 Implemented foundation — 10 July 2026

The platform now includes:

- owner-only HR administration that does not inherit broad technical-admin access;
- private owner discovery with versioned approved business context;
- a restricted employment-contract vault, document versioning, checksum duplicate protection, seven-year retention review trigger, audited access, and owner-approved role-only extracts isolated from general AI/RAG;
- versioned role profiles seeded manually or from an approved contract extract;
- optimistic-locking revision workflows for role profiles and department goals, preserving every historical version and preventing silent concurrent overwrites;
- AMI, SFIA 9, and PMI benchmark records, role-specific neutral questionnaire assembly, and question-quality gates;
- versioned department goals with periods, targets, sources, accountable owners, and explicit links to contributing role KPIs;
- role KPI definitions with target semantics, cadence, source, data owner, weights, and challengeable verified observations;
- review-cycle scheduling, required end dates, in-app/email notifications, privacy-safe ICS calendar invitations, response drafts, submission locking, and owner/reviewer access boundaries;
- idempotent hourly due-soon and overdue reminder automation with delivery claims, failed-delivery retries, bounded batches, and overdue state transitions;
- evidence-aware human scorecards that reserve 30% for verified role outcomes/KPIs, keep operational enablement separate, and abstain below 70% weighted evidence coverage;
- review follow-ups covering learning, coaching, process change, workload adjustment, role clarification, and goal adjustment, each with an owner and due date.
- participant role-baseline acknowledgement and correction, with an auditable dispute note before questionnaire completion.
- owner-only Monday evidence scope governance with board/field allowlists, bounded dates, exclusions, retention, approval, revocation, and fail-closed adapter helper; no Monday import is enabled by scope approval alone.
- a read-only Monday evidence preview adapter limited to completed, already-synced task mappings inside the approved board/date scope; raw source payloads and communication content remain excluded, with retention enforced at query time.

The next gated increment is a governed full Monday import/synchronization: idempotent board/group/item/subitem/update normalization, provenance and reconciliation, retention cleanup, and selective embedding of approved narrative process content. Structured task/KPI fields remain relational and queryable; embeddings are an additional search index, never the system of record. Slack/email content ingestion, automated contract text extraction, KPI connector collection, interview scheduling, and any AI-generated finding remain future gated increments. Employee KPI-evidence disclosure, dispute, and role-profile acknowledgement/correction are implemented. Original contract documents and questionnaire answers are never placed in the general knowledge base.

Architecture references may be maintained in Graphify/Wiki and Obsidian for navigation, decisions, and dependency mapping. Those tools document the system; private HR records and evidence remain governed inside the platform knowledge-base boundary.

## 2. Assumptions to validate

1. The first review is intended to improve business structure and operations, not to commence disciplinary action or determine termination.
2. Contract titles and position descriptions exist outside the platform and can be converted into approved role profiles.
3. The owner is the initial HR administrator; technical administrators should not automatically receive access to HR content.
4. Employees will be told what information is collected, why, who can see it, how it may be used, and how they can challenge inaccuracies.
5. The company wants identifiable role reviews and separately configurable confidential or anonymous business-health feedback.
6. The company will obtain employment/privacy advice before using connected communications as evidence in an adverse employment decision.
7. Signed employment contracts may be copied into the restricted HR vault. Originals remain owner-only and outside general AI/RAG; only an owner-approved role-only extract can seed a role profile or questionnaire.
8. Owner-onboarding answers are private to the owner and explicitly delegated HR administrators; technical admins, managers, and employees cannot read them.
9. Questionnaire recommendation is explainable and human-approved. It selects from approved questions; it does not generate or send unrestricted questions automatically.
10. Industry scoring uses published, versioned professional frameworks where applicable and owner-approved company standards where no suitable external standard exists. The interface never labels an internal target as an industry standard.

If assumptions 1, 3, or 5 are wrong, revise this specification before opening a live employee review.

## 3. Problem statement

The company needs to review workloads, processes, responsibilities, and efficiency across departments without creating an opaque surveillance system or reducing nuanced performance to a popularity or activity score.

Today the platform contains team records, departments, tasks, workload, capacity, time, internal chat, and Monday connectivity, but it lacks:

- a dated, acknowledged statement of what each role is responsible for;
- a structured way for employees to explain actual work, blockers, dependencies, and role drift;
- a controlled review cycle with clear visibility rules;
- evidence provenance and a right-of-response workflow;
- a distinction between employee-accountable findings and business-accountable findings;
- a closed-loop action plan showing what changed after the review.

## 4. Product principles

### 4.1 Expectations before evaluation

No person is assessed against a responsibility that was not present in the role-profile snapshot acknowledged for that review cycle.

### 4.2 Evidence before opinion

Every material rating or finding must include an evidence reference, observation period, author, and confidence. `Not enough evidence` is a valid and preferable outcome to speculation.

### 4.3 Context before conclusion

Delivery evidence is interpreted alongside capacity, priorities, dependencies, training, tooling, authority, and changes in scope.

### 4.4 Business accountability is first-class

Findings must be classified as one of:

- `individual` — within the person's agreed responsibility and reasonable control;
- `business` — caused primarily by structure, capacity, systems, leadership, or conflicting priorities;
- `shared` — responsibility and remedy are genuinely shared;
- `unresolved` — more evidence or discussion is required.

### 4.5 No hidden monitoring

The platform must show employees the review purpose, sources, lookback period, audience, retention rule, and whether each response is identified, confidential, or anonymous before they participate.

### 4.6 No automated adverse decisions

AI may later summarise, cluster, and suggest questions. It may not assign final ratings, rank employees, recommend warnings or dismissal, infer protected/sensitive traits, or publish a finding without human review.

### 4.7 Data minimisation

Prefer structured business records and source links over copying raw communications. Prefer aggregate process signals over individual communication analytics. Collect only what is necessary for a stated review question.

## 5. Research basis and product implications

This is product planning, not legal advice. Before production use, obtain advice tailored to the company's contracts, policies, awards or enterprise agreements, workforce composition, and actual connector scopes.

### 5.1 Fair performance process

The Fair Work Ombudsman's managing-underperformance guidance recommends clear expectations, specific examples, relevant documents provided in advance, an opportunity for the employee to respond, agreed support and actions, reasonable review periods, and a fair process. It also says employers should follow applicable processes in contracts, awards, enterprise agreements, and workplace policies.

**Product implications:**

- role profiles and review criteria are versioned and acknowledged;
- evidence can be disclosed to the participant before a meeting;
- employees can respond to and dispute evidence;
- improvement/support actions assign responsibilities to both employee and manager;
- a business review cannot silently become a disciplinary workflow;
- formal performance management requires a separate, explicit transition and policy check.

Source: [Fair Work Ombudsman — Managing underperformance best practice guide](https://www.fairwork.gov.au/tools-and-resources/best-practice-guides/managing-underperformance)

### 5.2 Consultation and significant change

Fair Work guidance notes consultation obligations can arise under legislation, awards, and enterprise agreements for significant workplace changes. Effective consultation makes the proposed change and its impact clear, invites views, considers those views, and states who makes the final decision.

**Product implications:**

- each review cycle declares its purpose and possible outcomes;
- employees can submit views on proposed organisational changes;
- findings and final decisions remain distinct records;
- the close-out report explains which feedback was acted on and why.

Source: [Fair Work Ombudsman — Consultation and cooperation in the workplace](https://www.fairwork.gov.au/tools-and-resources/best-practice-guides/consultation-and-cooperation-in-the-workplace)

### 5.3 Role clarity and psychosocial risk

Safe Work Australia identifies unclear or changing responsibilities, overlapping responsibilities, conflicting expectations, unclear reporting lines, missing task information, and unclear priorities as examples of lack of role clarity.

**Product implications:**

- role clarity is measured as a business-control question, not merely an employee rating;
- responsibilities include owner, decision authority, dependencies, expected outcome, and out-of-scope work;
- duplicated and unowned responsibilities are reported at organisational level;
- workload and role clarity findings feed a risk/action register.

Sources: [Safe Work Australia — Lack of role clarity](https://www.safeworkaustralia.gov.au/safety-topic/managing-health-and-safety/mental-health/psychosocial-hazards/lack-role-clarity), [Model Code of Practice — Managing psychosocial hazards at work](https://www.safeworkaustralia.gov.au/sites/default/files/2022-08/model_code_of_practice_-_managing_psychosocial_hazards_at_work_25082022_0.pdf)

### 5.4 Employee records and privacy are not a blanket exemption

The OAIC explains that the private-sector employee-records exemption applies only in certain circumstances where handling is directly related to a current or former employment relationship and an employee record. It does not justify assuming every email or every category of worker data is exempt, and it does not cover service providers handling another employer's employee records in the same way.

**Product implications:**

- conduct a privacy impact assessment even if an exemption may apply;
- document purpose and source for every category of evidence;
- distinguish employees, contractors, applicants, and volunteers;
- do not infer that all message or mailbox content is an employee record;
- require legal/privacy review before broad communications ingestion.

Source: [OAIC — Employee records exemption](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/organisations/employee-records-exemption)

### 5.5 Monitoring, proportionality, and transparency

Victorian privacy guidance recommends a legitimate purpose, necessity, proportionality, safeguards, transparency, minimisation, secure handling, disposal, non-discrimination, and complaint/remedy pathways for surveillance. It specifically recommends a privacy impact assessment before employee monitoring and clear communication about what is monitored and why. The Victorian private-sector legal position is evolving and should be reviewed before launch.

**Product implications:**

- connectors are disabled until their source scopes and purpose are approved;
- DMs, private channels, and private mailboxes are denied by default;
- collection has a bounded date range and explicit allowlist;
- the least intrusive source capable of answering a question is used;
- employees have an access/correction pathway;
- the platform records source approvals, notices, and policy versions.

Sources: [OVIC — Guiding Principles for Surveillance](https://ovic.vic.gov.au/privacy/resources-for-organisations/guiding-principles-for-surveillance/), [OVIC — Privacy During Employment](https://ovic.vic.gov.au/privacy/resources-for-organisations/privacy-during-employment/), [OAIC — Guide to undertaking privacy impact assessments](https://www.oaic.gov.au/privacy/privacy-guidance-for-organisations-and-government-agencies/privacy-impact-assessments/guide-to-undertaking-privacy-impact-assessments)

### 5.6 Professional competency frameworks

Current professional frameworks support role-specific assessment rather than a universal employee score:

- the Australian Marketing Institute framework covers 25 marketing competencies across five capability levels and supports individual, peer, management, and industry lenses;
- SFIA 9 combines professional skills with seven levels of responsibility and attributes such as autonomy, influence, complexity, knowledge, communication, collaboration, improvement, planning, and problem-solving;
- PMI's Project Manager Competency Development Framework separates knowledge/skills, demonstrated performance, and personal/behavioural competence and is designed to be customised for organisational context;
- Google Ads and Meta certifications can evidence platform knowledge or exam competence, but certification alone does not prove sustained workplace outcomes.

**Product implications:**

- benchmark frameworks are imported as licensed/versioned references, never copied without permission;
- each role profile maps only to applicable criteria and an expected level;
- external competency, internal outcome, and platform-certification evidence remain distinct dimensions;
- scoring always identifies whether a criterion is `industry_framework`, `company_standard`, `contractual_outcome`, or `platform_credential`;
- a framework or credential review date is mandatory because standards change;
- external standards do not override the employee's actual role, authority, resources, or agreed expectations.

Sources: [Australian Marketing Institute — Marketers' Competency Framework](https://ami.org.au/training/marketers-competency-framework/), [SFIA Foundation — How SFIA works](https://sfia-online.org/en/about-sfia/how-sfia-works), [SFIA 9 generic attributes](https://sfia-online.org/en/sfia-9/responsibilities/generic-attributes-business-skills-behaviours/generic-attributes-a-z), [PMI — Project Manager Competency Development Framework](https://www.pmi.org/standards/pm-competency-development-third-edition), [Google Skillshop — Google Ads certifications](https://skillshop.withgoogle.com/googleads/)

## 6. Users and permissions

### 6.1 Roles

| Product role | Primary capabilities | Explicit exclusions |
| --- | --- | --- |
| Business owner / HR administrator | Configure cycles, approve role profiles, appoint reviewers, view authorised identified material, publish findings/actions | Cannot reveal anonymous authors or bypass audit |
| HR reviewer | Review assigned participants, conduct interviews, draft evidence-linked findings | Cannot change source scopes or see unrelated reviews |
| Direct manager | Contribute manager assessment and agreed actions for assigned reports when invited | No automatic access to confidential business-health responses |
| Team member | View and acknowledge own role profile, complete assigned questionnaires, see disclosed evidence, respond, agree actions | Cannot see another person's identifiable review |
| Business analyst | View de-identified aggregate business findings when granted | No individual answers or interview notes |
| Technical administrator | Operate infrastructure | No HR content access merely because they are a technical admin |

### 6.2 Permission model

Add a dedicated `HR_ADMIN` permission group instead of reusing broad `ADMIN` or `MANAGEMENT` access.

- Legacy default: `owner` receives `HR_ADMIN`; `admin`, `lead`, and `project_manager` do not.
- Custom roles can receive `HR_ADMIN` only through explicit assignment.
- Cycle reviewer access is granted through `hr_review_cycle_reviewers`, not role name alone.
- Participant access is always self-only unless the endpoint also validates reviewer or `HR_ADMIN` scope.
- Export and source-configuration actions require `HR_ADMIN` plus fresh confirmation.
- All read, export, reveal, role-profile change, evidence-link, finding-publication, and permission-change events are audited.

## 7. Information architecture

Add an **HR & Business Review** section under the existing Team navigation, visible according to access:

### Owner/HR navigation

- **Overview** — active cycle, completion, outstanding acknowledgements, open actions, privacy status.
- **Owner onboarding** — private guided discovery, progress, source setup, and Business Context approval.
- **Review cycles** — create, configure, launch, monitor, close.
- **Role profiles** — titles, responsibilities, outcomes, authority, dependencies, assignments, version history.
- **Questionnaires** — templates, versions, branching, visibility labels, preview.
- **HR knowledge base** — approved role/process knowledge, question bank, evidence definitions, and solution playbooks.
- **Interviews** — schedule, interview guide, notes, participant response.
- **Findings** — role gaps, process risks, workload themes, responsibility map, evidence register.
- **Action plans** — owner, due date, support, success measure, review date, outcome.
- **Business context** — owner-authored Business Context Brief.
- **Evidence sources** — platform, Monday, approved shared chat, approved shared mailboxes.
- **Privacy & audit** — notices, source approvals, retention, access events, corrections, complaints.

### Team-member navigation

- **My role** — current acknowledged role profile and history.
- **My reviews** — assigned questionnaires, interview preparation, disclosed evidence, responses, agreed actions.
- **Business feedback** — confidential/anonymous survey when a cycle includes it.

## 8. Core domain model

### 8.1 Owner Discovery Onboarding

The onboarding questionnaire is a private, save-and-resume wizard with seven sections:

1. **Business identity and operating model** — services, locations, clients, departments, workforce types, reporting structure, and business seasonality.
2. **Review purpose** — decisions the review should inform, decisions it must not inform, desired outcomes, review period, and success measures.
3. **Roles and contractual responsibility** — titles, authoritative position descriptions, reporting lines, recurring responsibilities, shared responsibilities, and known role drift.
4. **Workflow inventory** — how work enters the business, is scoped, assigned, produced, reviewed, approved, delivered, billed, and improved.
5. **Systems and evidence** — platform data, Monday workspaces/boards, Slack/shared channels, email/shared mailboxes, date ranges, fields, and explicit exclusions.
6. **Privacy and review governance** — who can see owner answers, employee responses, interview notes, evidence, findings, exports, and aggregate reports.
7. **Hypotheses and approval** — suspected problems, evidence that would disprove them, final source scope, and approval to build draft profiles.

Owner-onboarding answers are not shown to managers or team members. The owner may explicitly delegate access to a named HR administrator. The onboarding UI shows a persistent `Private — owner and delegated HR only` label and an access-history link.

Completing onboarding produces drafts, never final judgements:

- Business Context Brief version 1;
- organisation and responsibility map;
- source-governance plan;
- initial process inventory;
- draft role profiles for owner review;
- unanswered questions and evidence gaps;
- candidate questionnaire assignment rules.

### 8.2 Business Context Brief

Owner-authored, versioned context that governs questionnaire selection and business-level analysis:

- review purpose and explicit non-purposes;
- strategic priorities and current constraints;
- departments, reporting lines, and decision owners;
- known process concerns to validate rather than presume true;
- client/service delivery model;
- workload period and material seasonal events;
- approved evidence sources and lookback windows;
- planned decisions that may be informed by the review;
- policy, contract, award, or agreement references requiring human review;
- sign-off and effective dates.

This record is not an inferred psychological or personality profile of the owner.

### 8.3 Process profile

A process profile describes how work actually flows through the business:

- process name, purpose, trigger, and desired outcome;
- steps and their accountable role, supporting roles, and approver;
- source systems and approved evidence references;
- handoffs, decision points, waiting time, rework, and exceptions;
- expected versus observed ownership;
- unclear, duplicated, or unowned responsibilities;
- confidence and evidence limitations;
- owner validation status and version.

Process profiles are built first from owner onboarding and structured platform/Monday data. Approved shared-channel or shared-mailbox evidence can refine a profile later. The platform must not convert communication frequency, writing style, tone, or responsiveness into employee performance ratings.

### 8.4 Questionnaire recommendation

For each participant, the recommendation engine combines:

- acknowledged role-profile responsibilities;
- contract/position-description source reference;
- approved process steps in which the role participates;
- expected versus observed allocation and handoffs;
- role-clarity, authority, dependency, workload, and tooling gaps;
- core business-health questions selected for the cycle;
- questions required by the owner-approved review purpose.

Every recommendation records `question_id`, reason, source responsibility/process, visibility mode, risk flag, and approval state. The owner can accept, edit, replace, or remove it. Questions about sensitive traits, private life, personality, loyalty, emotion, health, union activity, or unrelated conduct are blocked. A questionnaire cannot be issued until the owner approves its complete preview.

### 8.5 Role profile

Each role-profile version contains:

- contractual title and internal display title;
- department and reporting line;
- source contract/position-description reference and source date;
- purpose of the role;
- responsibilities with priority and expected allocation percentage;
- expected outcomes and service/quality standards;
- decision authority and required approvals;
- recurring duties and review cadence;
- dependencies and handoffs;
- required capabilities and provided training;
- explicitly shared responsibilities;
- explicitly out-of-scope responsibilities;
- employee, manager, and HR acknowledgements;
- effective dates and superseded version.

Role profiles are immutable after acknowledgement. Changes create a new version.

### 8.6 Review cycle

Statuses:

`draft -> governance_review -> ready -> open -> interviews -> synthesis -> action_planning -> closed`

Separate exceptional status: `cancelled`.

The cycle records:

- purpose: `business_review`, `role_clarity`, `development`, or `performance`;
- included departments and participants;
- selected Business Context Brief version;
- role-profile snapshot per participant;
- response visibility mode per questionnaire;
- source allowlist and lookback period;
- required opening date, questionnaire end date, interview window, and cycle closing date;
- review timezone, defaulting to the organisation timezone (`Australia/Melbourne` for the initial business);
- reviewers and conflict-of-interest declarations;
- disclosure and correction deadlines;
- retention schedule identifier;
- published close-out summary.

### 8.7 Questionnaire and responses

Supported question types:

- anchored five-point scale;
- single choice and multi-select;
- yes / no / not sure / not applicable;
- percentage allocation with a 100% total;
- short and long text;
- responsibility confirmation;
- evidence/source link;
- ranked priorities.

Every questionnaire version declares:

- intended audience;
- purpose;
- visibility: `identified`, `confidential`, or `anonymous_aggregate`;
- minimum aggregate cohort size;
- required/optional questions;
- branching predicates;
- version and published timestamp.

Do not label a response anonymous if a re-identifiable participant link is retained. `Confidential` means a restricted named audience; `anonymous_aggregate` means author identity is not available through product interfaces and small cohorts are suppressed.

#### Assignment, deadline, notification, and calendar rules

- Every questionnaire assignment requires an `opens_at` and `due_at`; `due_at` cannot be after the cycle closing date.
- The employee sees the due date and timezone before opening and throughout the questionnaire.
- Default reminders are sent at assignment, seven days before, three days before, one day before, and when overdue; HR can reduce the cadence but cannot remove the initial assignment notification.
- Notifications are delivered in-app and by work email unless the approved notification policy disables email. They contain purpose, due date, estimated completion time, and a secure route—never answers, findings, or evidence text.
- A calendar invitation is issued for the questionnaire deadline and a timed invitation is issued for the one-to-one interview. Initial MVP delivery uses a standards-based calendar invite attached to email; direct Google/Microsoft calendar writes require separate connector approval.
- Calendar events use a stable UID so deadline/interview changes update the existing event. Cancellation sends a cancellation update rather than leaving a stale invite.
- All scheduling uses the cycle timezone and stores UTC timestamps plus the intended timezone.
- After the deadline, late submission is disabled by default. HR may grant a named extension with a reason and new due date; the action is audited and the employee receives an updated notification/calendar invitation.
- Saved drafts remain private and are not deleted merely because the deadline passed.
- Notification and calendar delivery are idempotent; retries cannot create duplicate notices or events.
- Owner/HR dashboards show not started, in progress, submitted, overdue, extension granted, and interview scheduled/completed states.

### 8.8 Evidence item

An evidence item is a reviewable claim with provenance, not a raw data dump:

- source system and source object reference;
- source owner/scope and approved purpose;
- observed period;
- factual description;
- optional minimal excerpt where authorised;
- linked responsibility or business question;
- collector: human or system;
- confidence and limitations;
- participant disclosure status;
- participant response/correction;
- tamper-evident content hash where practical;
- expiry or deletion date.

### 8.9 Finding

Each finding contains:

- statement written as an observable gap or strength;
- category: role clarity, delivery, quality, capacity, process, dependency, authority, capability, risk, or recognition;
- accountability: individual, business, shared, or unresolved;
- linked evidence and contrary evidence;
- participant response;
- materiality and confidence;
- reviewer and approver;
- published status;
- action or explicit no-action rationale.

### 8.10 Action plan

- outcome sought;
- employee responsibility, if any;
- manager/business responsibility, if any;
- support, training, tools, or authority to be provided;
- measurable success indicator;
- owner, due date, and follow-up date;
- progress notes visible to the relevant participant;
- outcome and closure acknowledgement.

### 8.11 Private HR Review Knowledge Base

The knowledge base is a governed corpus, not a folder of unverified text. Entries are typed, versioned, permissioned, and source-cited:

- Business Context Briefs and owner-approved hypotheses;
- role profiles, contractual responsibility references, and acknowledgements;
- process profiles, responsibility maps, handoffs, and decision rights;
- approved policies and standards, including attendance or flexible-work expectations where applicable;
- evidence definitions explaining what each metric can and cannot prove;
- approved questionnaire questions, neutral wording reviews, answer options, and branching rules;
- recurring blocker taxonomy and validated business themes;
- published findings, participant responses, completed actions, and measured outcomes;
- solution playbooks mapped to blocker/finding categories;
- source-governance, privacy notices, retention policies, and limitations.

Every entry includes source, author/owner, effective date, review date, confidentiality level, permitted uses, superseded version, and provenance. Draft or disputed material is labelled and cannot silently become an established fact.

The first implementation uses structured PostgreSQL retrieval. Semantic/vector retrieval is optional later and must use a dedicated HR-only index partition, exclude anonymous raw answers, enforce access before retrieval, and never feed the general AI assistant memory.

### 8.12 Solution playbooks

The system should recommend possible remedies after a blocker or gap is supported, but the owner/reviewer chooses the action with the employee where appropriate.

| Finding/blocker | Candidate solutions |
| --- | --- |
| Unclear role or priority | revise role profile; name priority owner; define decision rights; remove conflicting expectation |
| Excess workload | stop/defer low-value work; rebalance allocation; add capacity; change service level; automate a proven repetitive step |
| Unowned or duplicated responsibility | assign accountable owner; clarify supporting roles; update process/role versions |
| Dependency or handoff delay | define entry/exit criteria; owner; expected turnaround; escalation route; shared checklist |
| Skill/capability gap | training; coaching; paired work; examples/standards; staged responsibility with review date |
| Tool/access/information gap | provision access; repair source of truth; document process; remove duplicate systems |
| Quality inconsistency | define acceptance criteria; QA checklist; peer review; calibration examples; feedback cadence |
| Timeliness gap | clarify priority/deadline; expose blockers earlier; milestone plan; capacity adjustment; focused improvement plan if within control |
| Attendance/reliability concern | verify schedule/policy and authorised attendance data; invite explanation; consider approved arrangements; agree support/expectations; use separate fair formal process if unresolved |
| Management/system blocker | assign a management action with the same owner, deadline, evidence, and follow-up discipline as an employee action |

Solutions are suggestions, not predetermined consequences. The interface always includes `No recommendation — more context required` and records the reasoning behind the selected remedy.

## 9. Objective assessment framework

### 9.1 Benchmark hierarchy

Each scored criterion must resolve through this hierarchy:

1. employee's acknowledged contractual responsibility and role-profile outcome;
2. published company quality/service/performance standard that existed before the review period;
3. applicable current professional competency framework and expected role level;
4. applicable platform credential or product-standard knowledge requirement;
5. comparable internal historical baseline, only when role, level, workload, resources, and period are materially comparable.

The UI shows the source type, publisher, version/effective date, criterion, expected level, evidence rule, weight, and reviewer. If a suitable external source is unavailable, the criterion is labelled `Company standard`, never `Industry standard`.

### 9.2 Role Performance Score

The system may calculate a weighted **Role Performance Score from 1.00 to 5.00**:

- **1 — materially below standard**;
- **2 — partially meets standard**;
- **3 — consistently meets standard**;
- **4 — exceeds standard**;
- **5 — exceptional, sustained performance materially above standard**.

Rules:

- scorecard dimensions and weights are versioned and acknowledged before the review opens;
- weights total 100% and reflect the person's actual role, not a generic title;
- `not applicable` weight is removed and remaining weights are normalised;
- `not enough evidence` is not silently converted to a low score;
- no overall score is published unless at least 70% of weighted criteria have sufficient evidence;
- each scored criterion requires an evidence reference, reviewer rationale, and employee response status;
- the employee sees the benchmark, calculation, evidence, context, and correction/appeal route;
- score changes after calibration or correction create a new result version with an audit trail;
- score bands are never used for cross-role ranking or automatic adverse action.

Display the score as `3.42 / 5 — consistently meets the approved role standard`, not as an unexplained percentage.

### 9.3 Scored dimensions

Keep dimension results visible beside the overall score:

| Dimension | Core question | Evidence examples | Must not use alone |
| --- | --- | --- | --- |
| Scope alignment | Is actual work within the acknowledged role? | role profile, assigned work categories, employee allocation | title assumption |
| Delivery | Were agreed outcomes delivered? | completed deliverables, agreed milestones, client acceptance | task count |
| Quality | Did output meet agreed standards? | revision history, QA outcome, substantiated feedback | sentiment |
| Timeliness | Were agreed deadlines met with dependencies considered? | baseline and changed deadlines, blocker records | online hours |
| Capacity | Was demand reasonable against available capacity? | capacity, leave, workload, priority changes | utilisation alone |
| Process contribution | Were required processes followed and improved? | approvals, handoffs, documented improvement | message volume |
| Collaboration | Were agreed handoffs and responsibilities fulfilled? | handoff outcomes, specific examples and responses | popularity |
| Capability/learning | Is the required capability demonstrated and developing at the expected level? | credential, work evidence, learning application, knowledge sharing | course count alone |
| Communication | Does communication enable agreed work, decisions, handoffs, and escalation? | complete briefs/handoffs, decision records, specific examples | message volume or tone score |

### 9.4 Anchored rubric

- **Not enough evidence** — no defensible conclusion.
- **Below agreed expectation** — specific agreed outcome was not met, after accounting for material context.
- **Partially meets expectation** — some agreed outcomes met; material gaps remain.
- **Consistently meets expectation** — agreed outcomes met at the expected standard.
- **Exceeds agreed expectation** — sustained outcomes materially above the agreed standard without relying on unsustainable overwork.
- **Not applicable** — responsibility or dimension did not apply during the period.

Ratings require a narrative and at least one disclosed evidence item. `Exceeds` should not reward excessive hours or permanent role drift.

### 9.5 Operational context and evidence confidence

Never hide operating conditions inside the employee score. Display two separate companions:

- **Operational Enablement (1–5):** clarity, reasonable capacity, authority, tooling, information, management support, and dependency health supplied by the business.
- **Evidence Confidence (low/medium/high plus coverage percentage):** source quality, directness, consistency, recency, contrary evidence, and scorable weight.

Example: `Role Performance 3.6/5 | Operational Enablement 2.1/5 | Evidence confidence: Medium (78% coverage)`. This makes an under-supported strong contributor visible and prevents business failures being silently charged to the employee.

### 9.6 Reconciliation matrix

For each participant, compare:

1. contract/position-description source against approved role profile;
2. role-profile allocation against employee-reported actual allocation;
3. assigned work against agreed responsibilities;
4. agreed outcomes against delivery evidence;
5. available capacity against demand and priority changes;
6. manager assessment against employee self-assessment;
7. evidence supporting a concern against evidence contradicting it.

The reconciliation output is a set of gaps and discussion prompts, not an automatic verdict.

### 9.7 Operational Contribution Profile, not personality persona

After the questionnaire and evidence reconciliation, the system builds a time-bound profile for the review period across these signals:

- outcome delivery and quality;
- operational reliability and follow-through;
- role alignment or hidden role drift;
- process ownership and improvement contribution;
- cross-team handoffs and coordination;
- decision clarity and appropriate escalation;
- blocker exposure and blocker resolution;
- workload/capacity strain;
- learning, adaptation, mentoring, documentation, and knowledge sharing;
- recognised and previously unrecognised contributions;
- connection to current priorities and operating processes;
- strength of evidence and self/manager agreement.

The profile may surface evidence-backed, non-exclusive patterns such as:

- reliable specialist;
- process owner;
- cross-team connector;
- improvement driver;
- developing capability;
- hidden contributor / role drift;
- overloaded or bottleneck risk;
- under-supported contributor;
- operational-connection concern requiring discussion;
- insufficient evidence.

Patterns are hypotheses for interview and action planning. They expire with the review period, cannot be treated as personality, and must show supporting evidence, contrary evidence, confidence, and employee response. The system must not label someone `disengaged`, `quiet quitter`, `poor communicator`, or similar based on low digital activity.

### 9.8 Smart post-questionnaire synthesis

The synthesis pipeline produces separate outputs:

1. **Facts** — role, outcomes, attendance records where authorised, deadlines, approvals, and questionnaire responses.
2. **Agreements/disagreements** — where employee, manager, and system evidence align or conflict.
3. **Strengths and contributions** — visible delivery plus hidden operational, mentoring, learning, documentation, recovery, and support work.
4. **Blockers and context** — individual, business, shared, or unresolved.
5. **Scorecard** — criterion ratings, weights, overall role score when coverage permits, enablement, and confidence.
6. **Operational profile** — time-bound contribution patterns with evidence and limitations.
7. **Interview guide** — neutral questions for gaps, contradictions, and low-confidence areas.
8. **Solution candidates** — employee and business actions from approved playbooks.

Human review remains mandatory before any score/profile is published. AI can organise and draft; deterministic policy code enforces calculations, evidence coverage, access, prohibited inferences, and state transitions.

## 10. Questionnaire design

### 10.1 Team-member core questionnaire

Target completion time: 12–15 minutes before optional detail.

1. **Role accuracy** — Does the role profile accurately describe your work today?
2. **Responsibility check** — For each responsibility: own / share / support / not performed / unclear.
3. **Actual allocation** — Approximate percentage of time across approved responsibilities, unplanned work, administration, and other work.
4. **Priorities** — How clear are your top three priorities?
5. **Authority** — Can you make the decisions required to deliver your responsibilities?
6. **Dependencies** — Which handoffs regularly block or delay outcomes?
7. **Workload** — Is workload sustainable in a normal week, and what creates peaks?
8. **Process friction** — Which process creates the most avoidable rework or waiting?
9. **Tools/information** — What access, information, or tooling is missing?
10. **Outcome evidence** — Which outcomes are you most proud of during the period?
11. **Scope drift** — What do you now do that is absent from your role profile?
12. **Duplication/gaps** — What is owned by multiple people or nobody?
13. **Support/development** — What support or capability would most improve results?
14. **Business improvement** — If one company process could change, which should it be and why?
15. **Anything material missing** — optional confidential response with its audience clearly shown.

### 10.2 Manager questionnaire

- Confirm the role-profile snapshot and changed priorities.
- Rate each responsibility using the anchored rubric or `not enough evidence`.
- Link specific evidence and disclose limitations.
- Identify business-controlled blockers and support already provided.
- Identify strengths and recognition, not only gaps.
- Propose no more than three priority actions.
- Declare conflicts or incomplete observation.

### 10.3 Business-health questionnaire

Use a separate confidential or anonymous-aggregate instrument covering:

- role clarity;
- workload sustainability;
- priority consistency;
- process effectiveness;
- quality of handoffs;
- decision speed;
- access to information/tools;
- psychological safety to raise operational issues;
- confidence that review feedback will lead to action.

Do not merge these answers into an individual's delivery assessment.

### 10.4 Owner questionnaire / Business Context Brief wizard

- What decisions should this review inform?
- What decisions must it not inform?
- What are the three most important business outcomes for the next 12 months?
- What constraints are known: capacity, cash, capability, systems, clients, or leadership bandwidth?
- Which responsibilities appear duplicated, unclear, or unowned?
- Which processes are suspected problems, and what evidence would disprove that suspicion?
- Which source systems are necessary, and what is the least intrusive scope?
- Who may see identified responses, evidence, interview notes, and aggregate reports?
- What will be communicated back to staff, and by when?

### 10.5 Neutral-question standard

The system runs a question-quality review before a question can be published. Questions must:

- ask about one concept at a time;
- use a defined review period rather than `usually` or `always` without context;
- avoid assuming a problem, fault, motive, or desired answer;
- separate observable fact, personal experience, interpretation, and preferred solution;
- use balanced answer options with `not applicable`, `not sure`, and optional comment where appropriate;
- use behaviourally anchored frequencies or outcomes instead of moral labels;
- avoid agreement bias by not presenting the owner's hypothesis as fact;
- avoid asking employees to diagnose colleagues or speculate about motives;
- show why the question is being asked and who can see the answer;
- provide a free-text route for relevant context the options missed.

Examples:

| Avoid | Use instead |
| --- | --- |
| `Poor communication regularly causes your work to be late, doesn't it?` | `During this review period, how often did missing or delayed information affect an agreed deadline?` |
| `Why do you struggle to arrive on time?` | `During this review period, how often did you arrive after your agreed start time, excluding approved arrangements or leave?` |
| `Do you agree Monday is inefficient?` | `Which tools or steps create avoidable duplication or waiting, if any?` |
| `Is your manager supportive?` | `When you raised a work blocker, how often did you receive the decision, information, or support needed to proceed?` |

### 10.6 Comprehensive individual review coverage

The recommendation engine checks coverage but does not force irrelevant questions. A full individual review considers:

- acknowledged role and responsibility fit;
- agreed outcomes, work quality, and recognition;
- timeliness, changed deadlines, and attributable blockers;
- attendance/reliability against an agreed schedule and policy, where relevant to the role;
- workload sustainability, capacity, leave, and competing priorities;
- process compliance, handoffs, and decision authority;
- client/stakeholder outcomes where substantiated and disclosed;
- collaboration through specific work outcomes, not popularity or message volume;
- tools, information, training, and management support;
- employee experience: clarity, workload, confidence, fairness, support, and ability to raise issues;
- role drift, career interests, capability development, and future goals;
- proposed employee and business actions, support, success measures, and follow-up.

Questions about feelings use respectful experience language and do not seek diagnoses. For example: `How sustainable has your workload felt during the review period?` followed by `What most influenced your answer?` Sensitive personal disclosure is optional and unnecessary detail is not requested.

### 10.7 Recommended questionnaire composition and neutral multiple choice

Each individual questionnaire should remain short enough to complete thoughtfully:

- 8–10 common review questions;
- one responsibility check for each material role responsibility, capped at 8;
- 3–5 questions selected from the person's approved process involvement;
- up to 5 conditional follow-ups triggered by answers;
- optional comments after each section;
- target 12–15 minutes, with a visible progress estimate.

Representative neutral questions:

**Role fit**
`How accurately did your acknowledged role profile reflect the work you were expected to perform during this review period?`

- Completely accurate
- Mostly accurate
- Partly accurate
- Mostly inaccurate
- Completely inaccurate
- Not sure

Follow-up: `Which responsibilities should be added, removed, clarified, or reassigned?`

**Workload experience**
`How sustainable did your assigned workload feel during a normal week in this review period?`

- Very sustainable
- Mostly sustainable
- Mixed
- Mostly unsustainable
- Very unsustainable
- The period did not contain a normal week
- Prefer to discuss privately

Follow-up selections: volume of work; changing priorities; unclear scope; waiting for approval; missing information; tooling; capability/training; unplanned requests; leave/availability; other; no material blocker.

**Blockers**
`How often did a blocker outside your immediate control affect an agreed outcome or deadline?`

- Never
- Once
- Two or three times
- About weekly
- More than weekly
- Not sure / not applicable

Follow-up: select the blocker, affected responsibility, whether it was raised, what happened next, and what would reduce recurrence.

**Attendance/reliability, only when relevant and authorised**
`Compared with your agreed working schedule, excluding approved leave or flexible arrangements, how often did you arrive after the agreed start time during this review period?`

- Never
- Once
- Two or three times
- Four or more times
- My schedule/arrangement changed or is unclear
- I do not believe this question applies to my role
- Prefer to discuss privately

The manager version presents the same options and must link the authorised attendance source. A discrepancy becomes an interview question, not an automatic finding.

**Support**
`When you raised a work blocker, how often did you receive the information, decision, access, or support needed to proceed?`

- Every time
- Most times
- About half the time
- Occasionally
- Never
- I did not raise a blocker
- Not applicable

**Overall experience**
`Which statement best describes how you felt about your ability to perform your role during this review period?`

- I had the clarity, capacity, and support I needed
- I generally had what I needed, with minor gaps
- My experience was mixed
- Material gaps regularly made delivery difficult
- I did not have what I needed to perform the role effectively
- Prefer to discuss privately

Follow-up: `What most influenced your answer?` with multi-select categories plus optional free text.

**Solutions**
Only after the employee has described the issue, show: `Which changes, if any, would most improve this situation? Select up to three.` Options come from approved solution playbooks and always include `No change needed`, `None of these`, `Other`, and `I would prefer to discuss this`.

## 11. Data-source policy

### 11.1 Source order

Use the least intrusive source first:

1. acknowledged role profile and direct employee/manager input;
2. structured platform records: assigned work, status history, approved time/capacity, deliverable acceptance;
3. Monday structured board/item data already authorised for business operations;
4. approved shared internal channels;
5. approved shared functional mailboxes;
6. private-channel or individual-mailbox content only after separate legal/privacy review and explicit governance approval.

### 11.2 Allowed initial signals

- assigned responsibility and owner;
- agreed due date and documented changes;
- deliverable status and approval outcome;
- workload/capacity over the chosen period;
- repeated handoff delays at process level;
- unowned or multiply-owned work;
- authorised attendance/time records compared with an agreed schedule and policy, only where attendance is relevant to the role;
- employee-submitted source links;
- substantiated client or stakeholder feedback with right of response.

### 11.3 Prohibited initial signals

- message count, email count, response speed, presence, or hours online as performance measures;
- inferring arrival, departure, attendance, or hours worked from first/last Slack activity, email activity, online presence, or device telemetry;
- tone, sentiment, emotion, personality, loyalty, health, union activity, political opinion, family status, or other sensitive-trait inference;
- private DMs, private channels, or personal mailbox folders;
- deleted-message recovery for review purposes;
- covert monitoring;
- keyword watchlists targeting an individual;
- AI-generated misconduct or termination recommendations;
- cross-employee ranking.

### 11.4 Connector governance record

Each connector scope requires:

- owner and technical custodian;
- legitimate business question;
- approved source types and explicit allowlist;
- excluded source types;
- date range and sync frequency;
- data fields collected;
- use and prohibited-use statement;
- employee notice/policy version;
- retention/deletion rule;
- reviewer and approval date;
- last access and next review date;
- emergency disable switch.

### 11.5 Communications as work evidence

When approved communications are in scope, evaluate their contribution to work processes rather than personality or activity level:

- whether a brief, request, handoff, decision, approval, risk, or blocker was communicated clearly enough for the next step;
- whether relevant context and ownership were preserved;
- whether blockers were escalated through the agreed path and timeframe;
- whether decisions and changes were documented where the process requires it;
- whether knowledge, learning, mentoring, or reusable guidance was contributed;
- whether repeated ambiguity or missing information created attributable rework;
- whether a response met an agreed operational service level, accounting for working hours, leave, role, and priority.

The system cites the minimal authorised evidence, states limitations, and offers contrary examples. It does not score grammar, accent, verbosity, tone, sociability, after-hours activity, or raw response speed. A communication concern is scored only when the role standard defined the required work outcome before the review period.

## 12. Privacy, security, and threat model

### 12.1 Assets

- role profiles and contract references;
- identified and confidential questionnaire answers;
- interview notes;
- evidence excerpts and source links;
- ratings, findings, actions, and disputes;
- connector tokens and source-scope configuration;
- exports and audit records.

### 12.2 Trust boundaries

- browser to Nitro API;
- API to PostgreSQL;
- API to R2 if document storage is later enabled;
- platform to Monday/Slack/email providers;
- connector content to any AI model;
- HR records to exports/downloads;
- anonymous aggregate queries to small cohorts.

### 12.3 Primary abuse cases and controls

| Abuse case | Required control |
| --- | --- |
| Technical admin reads HR records | Dedicated `HR_ADMIN`; deny by default; read audit |
| Manager enumerates another employee's review ID | Object-level authorisation on every endpoint; UUID is not authorisation |
| Anonymous response is re-identified from a small team | Minimum cohort threshold (default 5), suppression, no raw-answer endpoint |
| Role expectations are changed after the period | Immutable acknowledged snapshot per cycle |
| Reviewer cherry-picks evidence | Contrary-evidence field, disclosure, participant response, approver review |
| Raw communication contains prompt injection | Treat connector content as untrusted; isolate, delimit, no tool execution, validate model output |
| Sensitive information is inferred by AI | Prohibited inference policy, prompt/output filters, human approval, audit |
| Export leaks data | HR-only export, re-auth/confirmation, watermark, field allowlist, audit, expiry |
| Connector scope silently expands | Provider scope check, stored allowlist, diff approval, fail closed |
| Data persists indefinitely | Configurable retention jobs and legal-hold override with audit |
| Reviewer has conflict of interest | Required declaration and reassignment mechanism |

### 12.4 Retention

Do not hard-code a legal retention period without advice. Implement named, configurable policies.

Pilot recommendation:

- avoid copying raw communications where a stable authorised source link is sufficient;
- retain minimal excerpts only through evidence disclosure and cycle close-out, then delete or redact according to the approved policy;
- retain role-profile versions, agreed outcomes, findings, responses, and actions according to the employment-record policy;
- make legal hold explicit, time-bounded where possible, and fully audited;
- do not use backups as an undocumented indefinite archive.

### 12.5 Private-by-default handling

Owner onboarding, identified employee answers, interview notes, evidence responses, and draft findings are classified as restricted HR data.

- owner-onboarding drafts are readable only by the owner and explicitly delegated HR administrators;
- HR endpoints return `Cache-Control: no-store` and must not place response bodies in shared caches;
- HR routes and fields are excluded from product analytics, session replay, general search, general knowledge bases, and ordinary AI memory;
- notifications contain only a neutral action prompt and route, never answer text, finding text, or evidence excerpts;
- application logs contain record IDs and action types, not questionnaire answers or evidence content;
- high-sensitivity free text requires an approved field-level/envelope-encryption design before production storage, with keys held outside the database;
- access to decrypted content is authorised at object level and audited;
- exports require fresh confirmation, use a field allowlist, and are never attached to ordinary email notifications;
- connector credentials are encrypted and isolated from review content;
- owner onboarding and questionnaire drafts save safely without exposing content in URLs, browser history, or client-side persistent storage.

### 12.6 Required pre-launch governance artefacts

- privacy impact assessment;
- employee-facing collection/monitoring notice;
- HR Business Review policy;
- access and correction process;
- complaint/escalation pathway;
- retention schedule;
- connector scope register;
- AI acceptable-use and prohibited-decision policy;
- incident response procedure for HR data;
- reviewer training and calibration guide.

## 13. Technical architecture

### 13.1 Detected stack

- Nuxt 4.3 / Vue 3 / TypeScript
- Nuxt UI 4.9
- Nitro server API
- PostgreSQL on Neon via existing parameterised query helpers
- Zod 4 for input validation
- Vitest 4 and happy-dom
- Cloudflare Pages/Workers/R2 where required

No new runtime dependency is required for the MVP.

### 13.2 Proposed project structure

```text
app/
  components/hr/                  HR-specific focused components
  composables/useHr*.ts           Typed fetch/mutation state where reuse earns it
  pages/agency/hr/                HR routes and participant routes
  utils/permissions.ts            HR_ADMIN permission constant
server/
  api/agency/hr/                  Protected HR endpoints
  database/migrations/            Additive HR schema migrations
  utils/hr/access.ts              Object-level HR access decisions
  utils/hr/schemas.ts             Shared server-side Zod schemas
  utils/hr/audit.ts               Fail-closed HR audit writer
  utils/hr/evidence.ts            Evidence normalisation and provenance rules
  utils/hr/knowledge.ts           HR-only knowledge retrieval and provenance
  utils/hr/questionPolicy.ts      Neutral wording and prohibited-topic checks
  utils/hr/solutions.ts           Finding-to-playbook candidates
  utils/permissions.ts            Server HR_ADMIN permission constant
test/
  app/hr/                         UI source/behaviour contracts
  server/api/hr/                  Endpoint access and response tests
  server/utils/hr/                Pure access, rubric, evidence, aggregation tests
docs/prd/                         Living specification and implementation plan
docs/decisions/                   Accepted architectural decisions after review
```

### 13.3 Dependency graph

```text
Governance decisions + PIA
          |
          v
Dedicated HR permission + access policy
          |
          v
Private Owner Discovery Onboarding
          |
          v
Business Context + source governance
          |
          v
Draft process profiles + role profiles
          |
          +-----------------------+
          v                       v
Approved role versions      Approved process versions
          |                       |
          +-----------+-----------+
                      |
                      v
Explainable questionnaire recommendations
                      |
                      v
Owner preview + approval
                      |
                      v
Review cycles + participant invitations
          |                       |
          v                       |
Private questionnaires + responses
          |
          v
Disclosure + interviews + evidence
          |
          v
Internal structured evidence
          |
          v
Monday + separately gated Slack/email evidence
          |
          v
Evidence reconciliation + findings + employee response
          |
          v
Versioned role scorecard calculation
          |
          v
Operational Contribution Profile + optional AI synthesis
          |
          v
Action plans + close-out + governed knowledge
```

### 13.4 Proposed database tables

Use an additive migration, provisionally `220_hr_business_review_foundation.sql`; confirm the next available number immediately before implementation.

Foundation:

- `hr_owner_onboarding_sessions`
- `hr_owner_onboarding_answers`
- `hr_business_context_versions`
- `hr_process_profiles`
- `hr_process_profile_versions`
- `hr_process_steps`
- `hr_role_profiles`
- `hr_role_profile_versions`
- `hr_role_profile_responsibilities`
- `hr_role_assignments`
- `hr_role_acknowledgements`
- `hr_review_cycles`
- `hr_review_cycle_reviewers`
- `hr_review_participants`
- `hr_questionnaire_templates`
- `hr_questionnaire_versions`
- `hr_questions`
- `hr_questionnaire_recommendations`
- `hr_questionnaire_assignments`
- `hr_review_schedules`
- `hr_notification_deliveries`
- `hr_calendar_invites`
- `hr_responses`
- `hr_answers`
- `hr_knowledge_entries`
- `hr_solution_playbooks`
- `hr_question_quality_reviews`
- `hr_benchmark_frameworks`
- `hr_benchmark_criteria`
- `hr_role_scorecards`
- `hr_role_scorecard_versions`
- `hr_scorecard_results`
- `hr_score_evidence`
- `hr_operational_profiles`
- `hr_operational_profile_signals`
- `hr_audit_events`

Second migration:

- `hr_interviews`
- `hr_evidence_items`
- `hr_evidence_responses`
- `hr_findings`
- `hr_finding_evidence`
- `hr_actions`
- `hr_action_updates`
- `hr_source_governance`
- `hr_retention_policies`
- `hr_correction_requests`

Design rules:

- immutable published/acknowledged versions;
- JSONB only for bounded metadata and question configuration, not core access relationships;
- foreign keys and check constraints for states and visibility modes;
- timestamps in UTC;
- soft-close/version rather than destructive update for employment-review records;
- raw anonymous answers isolated from participant identity;
- restricted free-text ciphertext is stored separately from searchable metadata;
- onboarding drafts, response bodies, and interview content are never stored in URLs, analytics, or general-purpose caches;
- benchmark, scorecard, weight, calculation, and result versions are immutable once a review opens;
- score results store criterion-level evidence coverage and calculation inputs so the result is reproducible;
- operational profile signals expire with the review period and cannot be promoted as permanent personality facts;
- indexes start from real read paths: participant, cycle, reviewer, status, due date, and audit time;
- audit table is append-only to the application role.

### 13.5 API shape

Representative endpoints:

```text
GET    /api/agency/hr/overview
GET    /api/agency/hr/onboarding
PUT    /api/agency/hr/onboarding
POST   /api/agency/hr/onboarding/complete
GET    /api/agency/hr/onboarding/access-history
GET    /api/agency/hr/process-profiles
POST   /api/agency/hr/process-profiles/:id/approve
GET    /api/agency/hr/knowledge
POST   /api/agency/hr/knowledge
GET    /api/agency/hr/solution-playbooks
POST   /api/agency/hr/questions/:id/quality-review
GET    /api/agency/hr/benchmarks
POST   /api/agency/hr/benchmarks
GET    /api/agency/hr/scorecards
POST   /api/agency/hr/scorecards
POST   /api/agency/hr/reviews/:participantId/score
GET    /api/agency/hr/reviews/:participantId/score
POST   /api/agency/hr/reviews/:participantId/operational-profile
GET    /api/agency/hr/reviews/:participantId/operational-profile
GET    /api/agency/hr/my-role
GET    /api/agency/hr/my-reviews
GET    /api/agency/hr/role-profiles
POST   /api/agency/hr/role-profiles
POST   /api/agency/hr/role-profiles/:id/versions
POST   /api/agency/hr/role-profiles/:id/acknowledge
GET    /api/agency/hr/cycles
POST   /api/agency/hr/cycles
GET    /api/agency/hr/cycles/:id
POST   /api/agency/hr/cycles/:id/launch
POST   /api/agency/hr/cycles/:id/close
GET    /api/agency/hr/cycles/:id/questionnaire-recommendations
PATCH  /api/agency/hr/cycles/:id/questionnaire-recommendations/:id
POST   /api/agency/hr/cycles/:id/questionnaire-recommendations/approve
POST   /api/agency/hr/cycles/:id/invitations/send
PATCH  /api/agency/hr/assignments/:id/deadline
POST   /api/agency/hr/assignments/:id/extension
POST   /api/agency/hr/assignments/:id/remind
GET    /api/agency/hr/assignments/:id/calendar-invite
POST   /api/agency/hr/interviews/:id/schedule
PATCH  /api/agency/hr/interviews/:id/schedule
POST   /api/agency/hr/interviews/:id/cancel
GET    /api/agency/hr/reviews/:participantId
PUT    /api/agency/hr/reviews/:participantId/response
POST   /api/agency/hr/reviews/:participantId/submit
POST   /api/agency/hr/evidence
POST   /api/agency/hr/evidence/:id/respond
POST   /api/agency/hr/findings
POST   /api/agency/hr/findings/:id/publish
POST   /api/agency/hr/actions
PATCH  /api/agency/hr/actions/:id
GET    /api/agency/hr/aggregates/:cycleId
GET    /api/agency/hr/audit
```

API responses use field allowlists. Endpoint names do not imply access: each request performs object-level checks through `server/utils/hr/access.ts`.

### 13.6 Code style example

```ts
const UpdateResponseSchema = z.object({
  answers: z.array(z.object({
    questionId: z.string().uuid(),
    value: z.unknown()
  })).max(100)
})

export default defineEventHandler(async (event) => {
  const user = await requireAuth(event)
  const participantId = getRouterParam(event, 'participantId')
  const input = UpdateResponseSchema.parse(await readBody(event))

  const access = await requireHrParticipantAccess(user, participantId, 'edit-own-response')
  return saveDraftResponse(access, input)
})
```

Conventions:

- validate every boundary with Zod;
- use parameterised database queries;
- centralise object-level access rules, not data queries;
- return neutral errors that do not reveal whether a restricted record exists;
- keep Vue pages as containers and HR components focused;
- never render connector or AI text as unsanitised HTML;
- use Australian English in user-facing HR copy.

## 14. Delivery plan

### Phase 0 — Governance gate and prototype agreement

#### Task 0.1: Confirm review purpose and decision boundary

**Acceptance:**

- [ ] Owner records whether the first cycle is business review, role clarity, development, or formal performance.
- [ ] Explicit prohibited uses are approved.
- [ ] Transition into formal performance management requires a separate human decision.

**Verify:** Signed decision record attached to this PRD.
**Dependencies:** None.
**Files:** This PRD and, after acceptance, one ADR.
**Scope:** S.

#### Task 0.2: Complete data map and privacy threshold assessment

**Acceptance:**

- [ ] Every proposed field/source has purpose, audience, retention, and legal/policy owner.
- [ ] Employees, contractors, applicants, and volunteers are distinguished.
- [ ] Slack/email remain disabled unless the assessment approves a precise scope.

**Verify:** PIA/data-flow review signed off by owner and qualified adviser.
**Dependencies:** 0.1.
**Files:** Governance artefacts only.
**Scope:** M.

#### Task 0.3: Validate prototype with representatives

**Acceptance:**

- [ ] Owner, one manager, and at least two team members review questionnaire language and visibility labels.
- [ ] Participants can correctly explain who sees each response type.
- [ ] Top usability/privacy concerns are resolved or documented.

**Verify:** Moderated walkthrough notes and go/no-go decision.
**Dependencies:** 0.1.
**Files:** Prototype/design artefacts only.
**Scope:** M.

### Phase 1 — Access control and audit foundation

#### Task 1.1: Add dedicated HR permission contract

**Acceptance:**

- [ ] `HR_ADMIN` exists in client and server permission utilities.
- [ ] Owner has legacy access; ordinary admin/management roles do not.
- [ ] Route middleware and server checks fail closed.

**Verify:** `pnpm vitest run test/server/utils/hr/access.test.ts test/app/hr/hrPermissionContract.test.ts`.
**Dependencies:** Phase 0 approval.
**Files:** `app/utils/permissions.ts`, `server/utils/permissions.ts`, HR access test files.
**Scope:** M.

#### Task 1.2: Create HR foundation schema and audit log

**Acceptance:**

- [ ] Migration is additive, idempotent where project convention requires, and has constraints/indexes.
- [ ] Audit events capture actor, action, target, cycle, metadata allowlist, and timestamp.
- [ ] Application code cannot update/delete audit rows through normal APIs.

**Verify:** Migration contract test plus audit parameter unit tests.
**Dependencies:** 1.1.
**Files:** migration, `server/utils/hr/audit.ts`, two focused tests.
**Scope:** M.

#### Task 1.3: Add HR shell and access-aware navigation

**Acceptance:**

- [ ] Owner sees HR navigation; unauthorised users do not.
- [ ] Team members can reach only My role/My reviews routes when assigned.
- [ ] Empty, loading, and access-denied states are accessible and responsive.

**Verify:** focused source test, `pnpm typecheck`, manual keyboard check at 320/768/1440 px.
**Dependencies:** 1.1.
**Files:** agency layout, HR overview page, at most two components/tests.
**Scope:** M.

#### Task 1.4: Build private Owner Discovery Onboarding

**Acceptance:**

- [ ] Owner can save/resume the seven onboarding sections and publish a versioned Business Context Brief.
- [ ] Only the owner and explicitly delegated HR administrators can read answers; ordinary admins/managers cannot.
- [ ] Responses use `no-store`, are excluded from analytics/search/log content, and high-sensitivity text follows the approved encryption design.
- [ ] Completion creates only draft role/process profiles and candidate questionnaire rules.

**Verify:** access-matrix tests, cache-header tests, log-redaction tests, save/resume browser test, and owner walkthrough.
**Dependencies:** 1.1, 1.2, 1.3, approved private-data design.
**Files:** split into separate onboarding schema/API, wizard-section component, page, and focused tests.
**Scope:** M per wizard section.

### Checkpoint A — Foundation

- [ ] Threat model reviewed.
- [ ] HR content is inaccessible to ordinary admin, management, and unrelated participants.
- [ ] Read/write audit events are demonstrated.
- [ ] Owner-onboarding content is absent from analytics, logs, shared caches, and unauthorised API responses.
- [ ] Focused tests, typecheck, and build pass.

### Phase 2 — Role accountability vertical slice

#### Task 2.1: Create and version role profiles

**Acceptance:**

- [ ] HR admin can create a profile with responsibilities, outcomes, authority, dependencies, and out-of-scope work.
- [ ] Publishing creates an immutable version.
- [ ] Source contract/position-description metadata is recorded without uploading the signed contract.

**Verify:** API tests cover validation, immutable versioning, and forbidden access.
**Dependencies:** 1.2, 1.4.
**Files:** role API endpoints, schemas, test, minimal page.
**Scope:** M per endpoint/UI slice.

#### Task 2.2: Assign and acknowledge role profiles

**Acceptance:**

- [ ] HR assigns an effective role version to a team member.
- [x] The member sees the exact version and can acknowledge or request correction.
- [ ] Acknowledgement timestamp and version cannot be rewritten.

**Verify:** endpoint and UI tests; manual employee flow.
**Dependencies:** 2.1.
**Files:** assignment endpoint, acknowledgement endpoint, My role page/component, tests.
**Scope:** M.

#### Task 2.3: Build responsibility map

**Acceptance:**

- [ ] HR sees responsibilities grouped by owner, shared owner, and unowned status.
- [ ] Duplicates are suggestions requiring human confirmation.
- [ ] No individual performance rating is produced.

**Verify:** pure responsibility-map tests and manual review with pilot profiles.
**Dependencies:** 2.1.
**Files:** query endpoint, pure mapper, page component, tests.
**Scope:** M.

#### Task 2.4: Establish the private HR Review Knowledge Base

**Acceptance:**

- [ ] Owner-approved context, role/process profiles, policies, evidence definitions, question bank, and limitations are stored as typed/versioned entries.
- [ ] Draft, disputed, superseded, and approved knowledge have distinct states and cannot be confused in retrieval.
- [ ] Access is HR-specific, audited, excluded from general search/AI memory, and enforced before content retrieval.

**Verify:** knowledge-state tests, provenance tests, cross-user access tests, and general-search exclusion test.
**Dependencies:** 1.4, 2.1, 2.3.
**Files:** knowledge schema/helper, protected API, knowledge page/component, focused tests.
**Scope:** M per entry/retrieval slice.

### Phase 3 — Review cycle and questionnaire vertical slice

#### Task 3.1: Create a draft review cycle

**Acceptance:**

- [ ] HR selects purpose, participants, reviewers, dates, Business Context version, and visibility modes.
- [ ] Each participant receives a frozen role-profile snapshot.
- [ ] Launch is blocked if purpose, notice, reviewer, role snapshot, timezone, required questionnaire end date, or cycle closing date is missing.
- [ ] Questionnaire end date must be after opening and no later than cycle closing.

**Verify:** cycle state-machine and launch-gate tests.
**Dependencies:** 2.2.
**Files:** cycle schema/API, launch API, page, tests.
**Scope:** M per slice.

#### Task 3.2: Build versioned questionnaire templates

**Acceptance:**

- [ ] HR can compose supported question types and role-responsibility branches.
- [ ] Preview shows exact visibility/audience language.
- [ ] Published templates are immutable.
- [ ] Publication is blocked until neutral-wording, balanced-options, prohibited-topic, and single-concept checks pass or an HR override is reasoned and audited.

**Verify:** schema tests, branching tests, keyboard-accessible preview.
**Dependencies:** 3.1.
**Files:** template endpoints, schema, builder/preview component, tests.
**Scope:** M per question/editor slice.

#### Task 3.3: Build deterministic questionnaire recommendations

**Acceptance:**

- [ ] Engine selects only published questions using role responsibilities, process steps, cycle purpose, and approved business questions.
- [ ] Every recommendation displays a plain-language reason and its role/process source.
- [ ] Sensitive or prohibited topics are blocked and no questionnaire can be sent without owner approval.

**Verify:** recommendation-policy unit tests, prohibited-question fixtures, stable-output tests, and owner preview test.
**Dependencies:** 1.4, 2.1, 2.3, 2.4, 3.2.
**Files:** recommendation helper/policy, API, preview component, focused tests.
**Scope:** M.

#### Task 3.4: Approve and issue private individual questionnaires

**Acceptance:**

- [ ] Owner can accept, edit, replace, or remove each recommendation before approval.
- [ ] Final preview shows recipient, purpose, visibility, sections, expected completion time, required end date, and timezone.
- [ ] Sending requires explicit confirmation and invitations contain no response or evidence content.

**Verify:** approval-state tests, unauthorised-send tests, duplicate-send idempotency test, and invitation-content test.
**Dependencies:** 3.3.
**Files:** approval/send APIs, preview page/component, notification template, tests split into focused slices.
**Scope:** M per approval/send slice.

#### Task 3.5: Deliver notifications, reminders, and calendar invitations

**Acceptance:**

- [ ] Assignment produces one in-app notification, one neutral email, and one standards-based calendar invitation with a stable UID.
- [ ] Configured reminders and overdue notices run idempotently and never include answer/evidence content.
- [ ] Interview schedule, reschedule, and cancellation update the same calendar event.
- [ ] A reasoned extension updates the due date, reopens late submission, notifies the employee, updates the calendar event, and is audited.

**Verify:** notification-content tests, reminder-boundary/timezone tests, duplicate-delivery tests, calendar REQUEST/UPDATE/CANCEL tests, and extension access tests.
**Dependencies:** 3.1, 3.4.
**Files:** split into schedule helper, notification delivery, calendar invite builder, endpoint/job, and focused tests.
**Scope:** M per notification/calendar slice.

#### Task 3.6: Complete, save, and submit an identified self-review

**Acceptance:**

- [ ] Participant can save a draft and resume.
- [ ] Server validates answer type, question membership, and submission completeness.
- [ ] Submitted answers are read-only except through a visible reopen action; late submission is blocked unless an audited extension is active.

**Verify:** TDD for draft/submit/reopen permissions; manual mobile/keyboard flow.
**Dependencies:** 3.5.
**Files:** response APIs, My review page, questionnaire renderer, tests.
**Scope:** M per mutation.

#### Task 3.7: Add confidential and anonymous-aggregate business feedback

**Acceptance:**

- [ ] Confidential answers expose their named audience before submission.
- [ ] Anonymous aggregates suppress cohorts below the configured threshold, default 5.
- [ ] No product endpoint maps anonymous answers back to participant identity.

**Verify:** re-identification abuse-case tests and small-cohort suppression tests.
**Dependencies:** 3.6.
**Files:** anonymous storage/API, aggregate helper, business-feedback page, tests.
**Scope:** M per storage/aggregate slice.

### Checkpoint B — Pilot-ready questionnaire

- [ ] One owner, one manager, and one participant complete the end-to-end flow in staging.
- [ ] Visibility language is understood without explanation.
- [ ] Small-cohort anonymity tests pass.
- [ ] Assignment notification, deadline reminder, calendar update/cancellation, overdue state, and extension work end to end without duplicates.
- [ ] No opaque or cross-role composite score exists; any scoring-enabled cycle shows role-specific criteria, weights, benchmark versions, context, confidence, and calculation.

### Phase 4 — Evidence, interviews, findings, and actions

#### Task 4.1: Add evidence register and right of response

**Acceptance:**

- [ ] Reviewer links minimal evidence to a responsibility/finding with source and observation period.
- [ ] Participant sees disclosed evidence and can respond or request correction.
- [ ] Undisclosed evidence cannot support a published individual finding.

**Verify:** access, disclosure-gate, and correction tests.
**Dependencies:** 3.3.
**Files:** evidence APIs, evidence component, tests, audit helper update.
**Scope:** M.

#### Task 4.2: Generate interview guide and record agreed notes

**Acceptance:**

- [ ] Guide highlights self/manager differences and missing evidence without deciding who is correct.
- [ ] Notes distinguish reviewer note, participant statement, and agreed fact.
- [ ] Participant can comment on the interview summary.

**Verify:** pure prompt-generation tests and interview access tests.
**Dependencies:** 4.1.
**Files:** guide helper/API, interview API/page, tests.
**Scope:** M.

#### Task 4.3: Draft, review, and publish findings

**Acceptance:**

- [ ] Finding requires accountability class, evidence, contrary evidence review, confidence, and participant response status.
- [ ] Publication requires a second human approval for adverse individual findings.
- [ ] Every published finding has an action or no-action rationale.

**Verify:** finding state-machine and dual-approval tests.
**Dependencies:** 4.1.
**Files:** finding APIs, schema/helper, findings panel, tests.
**Scope:** M per state transition.

#### Task 4.4: Create and close action plans

**Acceptance:**

- [ ] Actions separately state employee and business responsibilities.
- [ ] Owner, support, success measure, due date, and review date are mandatory.
- [ ] Relevant participant can see progress and acknowledge closure.

**Verify:** action validation tests, notification test, manual close-out flow.
**Dependencies:** 4.3.
**Files:** action APIs, action component, tests, existing notification integration if approved.
**Scope:** M.

#### Task 4.5: Recommend governed solution options

**Acceptance:**

- [ ] Published blocker/finding categories retrieve candidate solutions from approved playbooks with provenance and limitations.
- [ ] Options include employee support and business/management remedies where applicable, plus `more context required`.
- [ ] No remedy is automatically imposed; reviewer and participant-facing rationale is recorded for the selected action.

**Verify:** solution-mapping tests, attendance/process/role-clarity fixtures, and automatic-adverse-action prohibition test.
**Dependencies:** 2.4, 4.3, 4.4.
**Files:** solution helper/API, playbook component, focused tests.
**Scope:** M.

### Phase 5 — Business context and structured evidence

#### Task 5.1: Build Business Context Brief wizard

**Acceptance:**

- [ ] Owner records objectives, non-purposes, assumptions, constraints, decisions, and source scopes.
- [ ] Publishing creates an immutable version used by a cycle.
- [ ] Suspected problems are labelled hypotheses until supported.

**Verify:** versioning tests and owner walkthrough.
**Dependencies:** 3.1.
**Files:** context API/schema, wizard page/components, tests.
**Scope:** M per wizard section.

#### Task 5.2: Add existing platform workload evidence adapter

**Acceptance:**

- [ ] Adapter reads the existing workload/capacity source for the approved period.
- [ ] Output states limitations and never treats utilisation as a performance rating.
- [ ] Evidence uses stable internal references and does not duplicate unnecessary raw data.

**Verify:** pure normalisation tests against representative workload responses.
**Dependencies:** 4.1, 5.1.
**Files:** adapter, API, tests, evidence UI metadata.
**Scope:** M.

#### Task 5.3: Add existing platform task/outcome evidence adapter

**Acceptance:**

- [ ] Only tasks linked to approved responsibilities and periods are considered.
- [ ] Deadline changes, blockers, reassignment, and approvals remain visible.
- [ ] Task counts are not converted into productivity scores.

**Verify:** context and provenance tests with changed-deadline/blocker fixtures.
**Dependencies:** 4.1, 5.1.
**Files:** adapter, API, tests, evidence UI metadata.
**Scope:** M.

#### Task 5.4: Add aggregate business findings dashboard

**Acceptance:**

- [ ] Dashboard shows role gaps, duplicated/unowned responsibilities, workload/process themes, and actions.
- [ ] Small groups are suppressed and filters cannot be combined to re-identify respondents.
- [ ] Users can drill from a business claim to authorised supporting evidence.

**Verify:** aggregation/privacy tests plus responsive and accessibility checks.
**Dependencies:** 3.4, 4.3, 5.2, 5.3.
**Files:** aggregate endpoint/helper, dashboard page/components, tests.
**Scope:** M per panel.

#### Task 5.5: Collate review learning into governed knowledge

**Acceptance:**

- [ ] Approved findings, participant corrections, completed actions, and measured outcomes can be promoted as versioned HR knowledge.
- [ ] Promotion is manual, source-cited, access-controlled, and never includes anonymous raw answers or unnecessary personal detail.
- [ ] Future questionnaire recommendations distinguish established knowledge, unresolved hypotheses, and superseded information.

**Verify:** promotion-state tests, redaction tests, provenance display, and questionnaire-recommendation regression test.
**Dependencies:** 2.4, 4.3, 4.5.
**Files:** promotion API/helper, knowledge review UI, focused tests.
**Scope:** M.

### Checkpoint C — Core MVP

- [ ] Full business-review cycle can run without Slack, email, or AI.
- [ ] Private owner onboarding produces approved context, role/process drafts, and questionnaire recommendations.
- [ ] The HR Review Knowledge Base is access-isolated from general search and AI memory.
- [ ] Questionnaire quality checks catch leading, double-barrelled, unbalanced, and prohibited questions.
- [ ] Role drift and business-accountable findings are visible.
- [ ] Employees can see/respond to identified evidence and actions.
- [ ] Owner can publish a close-out summary.
- [ ] Security, privacy, accessibility, typecheck, test, and build gates pass.

### Phase 6 — Monday evidence, after MVP validation

#### Task 6.1: Add Monday source-governance scope

**Acceptance:**

- [x] Owner selects approved workspaces/boards, fields, date range, purpose, exclusions, and retention.
- [x] Existing Monday connection permissions are displayed before activation.
- [x] Scope expansion requires a new approval and audit event.

**Verify:** scope-diff and fail-closed tests.
**Dependencies:** Checkpoint C and approved PIA.
**Files:** source-governance API/schema, settings page, tests.
**Scope:** M.

#### Task 6.2: Normalise Monday work evidence

**Acceptance:**

- [x] Import only allowlisted boards/fields and bounded dates.
- [x] Preserve provenance, assignment changes, status history where available, and limitations.
- [ ] Store evidence references/minimal extracts, not an unrestricted mirror.
- [ ] Produce owner-reviewable process-profile updates and questionnaire recommendations rather than automatic employee conclusions.

**Verify:** connector fixture tests, scope-escape tests, and audit checks.
**Dependencies:** 6.1.
**Files:** Monday HR adapter, endpoint/job, tests, audit integration.
**Scope:** M per resource type.

### Phase 7 — Slack/channel and email/mailbox evidence gates

These are planned full-vision capabilities, delivered after the manual/structured-data MVP. Each source is separately gated. Shared channels and functional mailboxes are the safest starting scope; individual corporate channels/mailboxes require an additional explicit decision, notice/policy review, strict work-process purpose, and minimised fields. Personal accounts and non-work content remain out of scope.

#### Task 7.1: Complete provider-specific feasibility and privacy review

**Acceptance:**

- [ ] Provider, account type, API scopes, retention, admin controls, and export restrictions are documented.
- [ ] Shared channels/mailboxes are explicitly allowlisted; DMs/private channels/personal mailboxes remain denied.
- [ ] Staff notice, policy, PIA, and legal review are approved before any production token is connected.

**Verify:** governance sign-off and least-privilege scope demonstration in a sandbox tenant.
**Dependencies:** Checkpoint C plus approved provider-specific PIA, source scope, notice/policy, and access design.
**Files:** research/ADR only.
**Scope:** M.

#### Task 7.2: Implement one connector as a bounded evidence adapter

**Acceptance:**

- [ ] Connector cannot read outside its stored allowlist.
- [ ] Raw content is not used as a communication-volume or sentiment score.
- [ ] Disable, token revocation, retention deletion, and audit work end to end.
- [ ] Extracted process/handoff claims remain drafts until owner validation and retain source provenance.

**Verify:** permission/scope tests, prompt-injection fixture tests, revocation test, privacy review.
**Dependencies:** 7.1.
**Files:** connector client, adapter, job/API, tests; split by resource type.
**Scope:** M per slice.

### Phase 8 — Role scoring and intelligent synthesis

#### Task 8.1: Establish the benchmark framework registry

**Acceptance:**

- [ ] HR can register an applicable AMI, SFIA, PMI, platform credential, contractual outcome, or company-standard source with publisher, version, licence/use terms, role family, level, criteria, and review date.
- [ ] The system cannot label a criterion `industry standard` without an approved external source.
- [ ] Superseded standards remain reproducible for historical reviews but cannot be assigned to new cycles.

**Verify:** source/version/state tests, missing-provenance rejection test, and framework licence-field review.
**Dependencies:** 2.4 and approved benchmark choices per role family.
**Files:** benchmark schema/helper, protected API, registry UI, focused tests.
**Scope:** M.

#### Task 8.2: Build versioned role scorecards

**Acceptance:**

- [ ] Owner maps applicable benchmark criteria to a role level, expected outcome, evidence rule, and weight totalling 100%.
- [ ] Employee can see and acknowledge the complete scorecard before the review opens.
- [ ] Open-review scorecards are immutable; changes create a future version.

**Verify:** weight, version, acknowledgement, and immutability tests plus role-family preview.
**Dependencies:** 2.2, 8.1.
**Files:** scorecard schema/API, builder/preview component, focused tests.
**Scope:** M per builder/version slice.

#### Task 8.3: Calculate reproducible Role Performance Scores

**Acceptance:**

- [ ] Deterministic calculation produces criterion and dimension ratings plus a 1.00–5.00 role score only when at least 70% of weighted criteria have sufficient evidence.
- [ ] Output separately shows Operational Enablement and Evidence Confidence/coverage.
- [ ] Every result preserves inputs, benchmark/scorecard versions, evidence references, rationale, employee response, calculation version, and audit history.
- [ ] No score creates a ranking or automatic warning/adverse action.

**Verify:** golden calculation fixtures, missing-evidence normalisation, context separation, reproducibility, correction/versioning, and no-ranking tests.
**Dependencies:** 4.1, 4.3, 8.2.
**Files:** pure scoring engine, result API, scorecard result component, focused tests.
**Scope:** M per calculation/publication slice.

#### Task 8.4: Build Operational Contribution Profiles

**Acceptance:**

- [ ] Profile surfaces time-bound strengths, contributions, blockers, learning, operational connection, role drift, capacity strain, and hidden work.
- [ ] Each signal shows supporting and contrary evidence, confidence, review period, and employee response.
- [ ] Prohibited personality/disengagement labels and conclusions based on low digital activity are rejected.

**Verify:** contribution-strength fixtures, under-supported-strong-performer fixture, low-activity false-positive fixture, expiry test, and prohibited-label test.
**Dependencies:** 4.2, 5.5, 7.2 where connected evidence is approved, 8.3.
**Files:** profile policy/helper, protected API, profile UI, focused tests.
**Scope:** M.

#### Task 8.5: Add AI theme suggestions behind human review

**Acceptance:**

- [ ] AI operates on the minimum authorised evidence set and is told source text is untrusted.
- [ ] Output schema contains strength/theme, evidence references, contrary evidence, confidence, limitations, and neutral interview question.
- [ ] AI output is a draft and cannot calculate scores or publish profiles/findings/actions.
- [ ] Retrieval is restricted to the dedicated HR knowledge scope and cannot write to general AI memory.

**Verify:** injection, cross-participant leakage, unsupported-claim, prohibited-inference, and schema-validation evals.
**Dependencies:** 8.3, approved AI/privacy policy, and proven manual analysis burden.
**Files:** AI schema/service, protected endpoint, review UI, tests/evals.
**Scope:** M per capability.

#### Task 8.6: Add role-aware question suggestions

**Acceptance:**

- [ ] Suggestions derive only from acknowledged responsibilities, scorecard gaps, low-confidence evidence, approved business hypotheses, and operational-profile drafts.
- [ ] Biased, leading, sensitive-trait, persona, and disciplinary questions are rejected.
- [ ] HR must edit/approve before questionnaire or interview-guide publication.
- [ ] Suggestions separate factual, experience, interpretation, and solution questions and always include balanced answer options.

**Verify:** question-policy unit tests and red-team evaluation set.
**Dependencies:** 8.4, 8.5.
**Files:** question policy, generator, review component, tests/evals.
**Scope:** M.

### Phase 9 — Pilot, hardening, and launch

#### Task 9.1: Run one-department pilot

**Acceptance:**

- [ ] Pilot includes 3–8 participants without connected communications.
- [ ] Completion, comprehension, correction, reviewer time, and action quality are measured.
- [ ] No employment decision relies solely on the pilot output.

**Verify:** pilot close-out and participant feedback.
**Dependencies:** Checkpoint C.
**Files:** Operational records, no feature expansion.
**Scope:** M.

#### Task 9.2: Security and privacy release gate

**Acceptance:**

- [ ] Object-level authorisation and ID-enumeration tests pass.
- [ ] Anonymous aggregation resists filter-based re-identification.
- [ ] Audit, export, retention, correction, backup, and incident paths are exercised.
- [ ] No critical/high reachable dependency vulnerability remains.

**Verify:** `pnpm test:run`, `pnpm typecheck`, `pnpm lint`, `pnpm build`, targeted manual security test.
**Dependencies:** 9.1 fixes complete.
**Files:** Tests/config/focused fixes only.
**Scope:** M.

#### Task 9.3: Production launch and first-cycle support

**Acceptance:**

- [ ] Launch notice, reviewer training, support route, and incident owner are active.
- [ ] Feature is enabled only for approved users/cohort.
- [ ] Rollback disables access/connectors without destroying audit/evidence integrity.

**Verify:** production smoke test with synthetic records; owner go/no-go.
**Dependencies:** 9.2.
**Files:** Feature/config/operations documentation.
**Scope:** S.

## 15. Testing strategy

### Unit tests

- role-profile version immutability;
- review state transitions;
- permission decisions for every actor/action pair;
- questionnaire branching and answer validation;
- neutral-question policy: leading assumptions, double-barrelled wording, unbalanced options, missing `not applicable`, and prohibited topics;
- HR knowledge provenance, version state, access-before-retrieval, and general-search exclusion;
- solution playbook mapping with `more context required` and no automatic adverse action;
- attendance evidence rules that reject Slack/email/presence proxies;
- benchmark source/version resolution and prevention of false `industry standard` labels;
- scorecard weight/version immutability and employee acknowledgement;
- deterministic score calculation, 70% evidence threshold, context separation, and reproducibility;
- operational-profile evidence/contrary-evidence, expiry, and prohibited-label rules;
- deadline/timezone calculations, reminder windows, extensions, and overdue transitions;
- calendar invite stable UID, update, and cancellation generation;
- notification idempotency and sensitive-content redaction;
- responsibility reconciliation;
- evidence normalisation and limitations;
- aggregate suppression and anti-differencing rules;
- retention decisions;
- AI output validation if enabled.

### API integration tests

- self, assigned reviewer, HR admin, ordinary admin, manager, unrelated member;
- object enumeration and cross-review access;
- draft, submit, reopen, disclose, respond, approve, publish, close;
- export confirmation and audit;
- connector allowlist escape attempts;
- assignment/extension authorisation and manual-reminder rate limits;
- neutral 403/404 behaviour without sensitive existence leaks.

### UI tests

- visibility notice before answering;
- role acknowledgement/correction;
- draft recovery;
- required end date, timezone, reminder state, overdue state, and extension display;
- calendar invitation download/acceptance and interview reschedule/cancellation;
- evidence disclosure and response;
- action plan with employee/business responsibilities;
- accessible validation and focus movement;
- meaningful empty/loading/error states.

### Browser verification

- keyboard-only flow;
- screen-reader headings, labels, errors, tables, dialogs, and status messages;
- 320, 768, 1024, and 1440 px layouts;
- no console errors;
- no restricted content in network responses or page source;
- session expiry and unauthorised-route handling.

### Security/privacy tests

- STRIDE abuse cases from section 12.3;
- minimum-cohort bypass through filter combinations;
- CSV/formula injection in exports;
- stored XSS in free text and connector excerpts;
- prompt injection in message/email evidence;
- oversized answers and upload limits if documents are later added;
- audit coverage for reads, exports, and permission changes;
- deletion/retention and legal-hold behaviour.

## 16. Commands

```bash
pnpm dev
pnpm vitest run <focused-test-files>
pnpm test:run
pnpm typecheck
pnpm lint
pnpm build
```

Do not repeatedly run the full suite between tiny edits. Use focused tests for each slice, then the full gates at checkpoints and release.

## 17. Delivery estimate and rollout

Indicative estimate for one experienced engineer working incrementally with product access:

- governance, prototype, and PIA: 1–2 elapsed weeks, dependent on stakeholders;
- core MVP through Checkpoint C: 8–10 engineering weeks;
- Monday adapter: 1–2 engineering weeks;
- each Slack/email connector: 2–4 engineering weeks plus provider/security approval;
- AI assistance: 2–3 engineering weeks after a manual-review baseline exists;
- benchmark registry, role scorecards, deterministic scoring, and operational profiles: 3–5 engineering weeks after role standards are approved;
- pilot and hardening: 2 elapsed weeks.

Recommended rollout:

1. One department, manual evidence only.
2. Company-wide role clarity and questionnaire workflow.
3. Existing platform structured evidence.
4. Monday evidence.
5. Only then decide whether shared-channel/mailbox evidence is necessary.
6. Only then decide whether AI reduces a measured manual-analysis cost.

## 18. Success metrics

### Product/process

- at least 90% of pilot participants acknowledge or correct their role profile before review;
- at least 85% questionnaire completion within the agreed window;
- 100% of issued questionnaires have a required end date and timezone;
- 100% of assignment, reminder, extension, interview, and cancellation deliveries are idempotency-keyed;
- median core questionnaire completion at or below 15 minutes;
- every published material individual finding has disclosed evidence and participant response status;
- every action has owner, support, success measure, due date, and review date;
- close-out summary published within 10 business days of cycle close;
- role gaps, duplicated ownership, and unowned responsibilities produce measurable actions.

### Trust/safety

- zero unauthorised cross-user access in automated and manual testing;
- zero individual rankings or communication-volume productivity metrics;
- zero attendance or arrival conclusions inferred from Slack, email, presence, or first/last activity;
- 100% of participants shown purpose, audience, source, and visibility notice before submission;
- 100% of connected sources have approved scope, retention, and disable controls;
- anonymous aggregates never render below cohort threshold;
- all HR reads, exports, permission changes, and publications are audited.
- all issued questionnaires have an owner-approved recommendation reason and passed neutral-question review.
- 100% of published scores identify benchmark/scorecard/calculation versions and evidence coverage;
- zero overall scores published below the 70% weighted-evidence threshold;
- zero cross-role leaderboards or automatic adverse actions triggered from a score/profile;
- 100% of operational-profile signals are time-bounded and show confidence plus supporting/contrary evidence.

### Outcome

Measure after 60–90 days:

- percentage of role-clarity actions completed;
- reduction in unowned or duplicated responsibilities;
- reduction in reported process blockers;
- improvement in role/priority clarity questions;
- percentage of business-accountable actions delivered by management;
- employee confidence that review feedback resulted in visible action.

## 19. Boundaries

### Always

- use dedicated HR access checks and object-level authorisation;
- version expectations before assessment;
- disclose evidence used for individual findings;
- provide response/correction mechanisms;
- classify business accountability separately;
- validate input, parameterise queries, escape output, and audit sensitive actions;
- run focused tests per slice and full gates at checkpoints.

### Ask first

- storing signed contracts or health/sensitive information;
- enabling a new external connector or expanding scopes;
- changing who can see identified/confidential responses;
- changing anonymity thresholds;
- exporting individual review data;
- using outputs for formal performance management or adverse decisions;
- enabling AI on individual-level data;
- changing retention or legal-hold policy.

### Never

- covertly monitor employees;
- ingest private communications by default;
- use message/email volume, presence, or online hours as performance;
- infer attendance, arrival, departure, or hours worked from communication activity;
- infer sensitive traits, emotion, personality, or loyalty;
- create automatic employee rankings or adverse recommendations;
- use an unexplained, unversioned, or cross-role universal score;
- label an internal expectation as an industry standard;
- call confidential responses anonymous;
- let broad admin access substitute for HR authorisation;
- publish an adverse finding without evidence disclosure and opportunity to respond;
- silently change acknowledged expectations retrospectively;
- expose HR knowledge or responses through general search, general AI memory, analytics, or session replay.

## 20. Not doing in the MVP

- payroll, leave, recruitment, employee onboarding, benefits, or a general HRIS;
- signed-contract document vault;
- formal disciplinary warnings or dismissal workflows;
- 360-degree peer scoring;
- private Slack/Teams/DM analysis;
- individual mailbox analysis;
- sentiment, emotion, personality, or culture-fit scoring;
- opaque employee score, universal cross-role score, or leaderboard;
- AI-authored final findings;
- mobile native application;
- external percentile/ranking comparison without a validated, role-comparable, licensed dataset.

## 21. Open decisions requiring owner approval

1. Is the first cycle strictly `business_review`/`role_clarity`, or may it initiate formal performance action?
2. Who besides the owner may receive `HR_ADMIN`?
3. Are direct managers reviewers, contributors, or neither in the first cycle?
4. Which responses are identified, confidential, or genuinely anonymous aggregate?
5. What minimum cohort threshold should apply? Recommended default: 5.
6. What authoritative contract/position-description repository is referenced?
7. Are contractors included, and under what privacy/contractual process?
8. What retention schedule will qualified advice approve?
9. Which department should pilot first?
10. After the manual pilot, is there a demonstrated need for Monday, shared-channel, or shared-mailbox evidence?
11. What authorised system is the source of truth for scheduled hours, attendance, approved leave, and flexible arrangements? Slack/email activity is not acceptable.
12. Which named people, if any, may access private owner-onboarding answers besides the owner?
13. Should high-sensitivity free text use application-level encryption in the first pilot, or should the pilot avoid collecting that content until the encryption design is approved?
14. Confirm the default reminder cadence: assignment, 7 days, 3 days, 1 day, and overdue.
15. Should late submissions remain locked until HR grants an extension, as recommended, or enter a visible late-submission state automatically?
16. Is email plus a standards-based calendar invite sufficient for the MVP, or is direct Google Workspace/Microsoft 365 calendar write access required?
17. Which role families should receive external benchmark frameworks first: marketing/media, project/account management, development/technology, creative, or operations?
18. Approve the default scoring scale (1–5), 70% minimum weighted-evidence coverage, and the requirement to show Operational Enablement and Evidence Confidence separately.
19. Which company-specific KPIs are sufficiently stable and within the employee's control to become scorecard criteria?

## 22. Approval gates

- [ ] **Gate 0 — Direction:** Owner accepts the product split, prohibited uses, and MVP boundary.
- [ ] **Gate 1 — Governance:** PIA, staff notice, access model, retention, and policy are approved.
- [ ] **Gate 2 — Architecture:** Schema/access/audit ADR is accepted.
- [ ] **Gate 3 — MVP:** Checkpoint C passes and pilot is authorised.
- [ ] **Gate 4 — Connected evidence:** Each connector is separately approved.
- [ ] **Gate 5 — Scoring:** Benchmark sources, role levels, weights, evidence rules, context separation, calibration, and employee visibility are approved.
- [ ] **Gate 6 — AI:** Manual baseline proves value and AI/privacy controls pass evaluation.
- [ ] **Gate 7 — Production:** Security/privacy release gate and owner go/no-go pass.
