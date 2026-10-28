# Digital marketing department through MCP — research and delivery specification

Research date: 28 October 2026, Australia/Melbourne. Source baseline: `b87589958e6e068f712a8f387693ea073436cf60`, freshly fetched `origin/main`. Status: research and proposed delivery scope; this document does not activate tools or change permissions.

## Decision

Treat the MCP as the department's working interface: investigate, plan, prepare, review, execute where authorised, and verify the outcome. Access to a dashboard or a long tool list does not establish that a marketer can finish a workflow.

The current staff release is a useful foundation, but **does not provide complete professional marketing department coverage**. The largest gaps are portfolio reporting, budget operations, inventory/feed operations, lead-quality reporting, SEO/content, creative production and department work management. Some underlying features already exist; some need safer scoped service boundaries; some remain provider-dependent or incomplete.

Both selected employees have access configured for all 93 currently active clients. This is a snapshot of explicit assignments, not a rule that automatically enrolls future clients. Keep their marketing authority distinct from owner administration, payroll and agency accounting.

## Evidence and personnel

- The [release record](../runbooks/marketing-staff-mcp-release-20261028.md) records the deployed source, grants, role groups, assignments and pending host/provider acceptance. Do not replace it with this proposal.
- Fresh read-only canonical HR lookup found no effective role-profile assignment or active role KPI definitions for either Garrix Lopena or Hannah Lavina. Their `team_members.role` value is not an authoritative department job description. The owner has been asked who is department head; do not infer that from name order or grant approval authority by assumption.
- Both currently use Media Buyer with `CLIENTS`, `CREATIVE`, `MEDIA_BUYING`, `QR_CODES`. Their four MCP grants are `reporting`, `social_draft`, `ads_plan`, `tracking_plan`. Head/team profiles below are proposed operating responsibilities, not changes to their employment records or performance assessments.
- Research uses public occupational standards and official platform documentation. The workflow design, priorities, cadence and KPI contract below are our synthesis for this agency, not universal industry targets.

## Roles and accountability

O*NET describes marketing management as strategy, coordination, financial evaluation and team leadership. Australia's current OSCA profiles separately cover marketing planning, digital analysis, advertising production and content publishing. These support a department model with several functions, even when two people share them. Sources: [Marketing Managers](https://www.onetonline.org/link/summary/11-2021.00), [Marketing Specialist](https://www.jobsandskills.gov.au/data/occupation-and-industry-profiles/occupations-osca/221534-marketing-specialist), [Digital Marketing Analyst](https://www.jobsandskills.gov.au/data/occupation-and-industry-profiles/occupations-osca/221532-digital-marketing-analyst), [Content Creator](https://www.jobsandskills.gov.au/data/occupation-and-industry-profiles/occupations-osca/221531-content-creator-marketing), [Advertising Specialist](https://www.jobsandskills.gov.au/data/occupation-and-industry-profiles/occupations-osca/221131-advertising-specialist).

| Function | Work to own | Accountability | Required MCP access |
| --- | --- | --- | --- |
| Department head | Client strategy, channel mix, objectives, budget allocation, forecasts, campaign priorities, quality standards, team capacity, client escalation and performance reviews | Client outcomes, spend stewardship, delivery reliability, measurement quality and justified decisions | All-active-client portfolio views, drilldowns, plans, work allocation, review queue and narrowly delegated approvals |
| Paid-media specialist | Account mapping, campaign/ad-group/ad/keyword/audience setup, location and schedule controls, creative testing, optimisation and policy issues | Qualified demand within agreed budgets; launch accuracy; explainable changes | Campaign inventory, pacing, diagnostic reads, draft/validate/submit changes, approved execution and receipts |
| Marketing analyst / measurement | KPI definitions, dashboards, attribution, UTMs, tracking ownership, data reconciliation, lead quality and reporting | Accurate, timely, reproducible reporting; clear uncertainty | Scoped metrics, source freshness, conversion diagnostics, report preparation and tracking proposals |
| Social / content specialist | Calendar, copy, assets, revisions, scheduled publishing, community triage, website content and SEO improvements | Useful content, reliable delivery, timely responses and qualified engagement | Brand/asset lookup, drafting, review, publishing status, inbox queues, search insights and content proposals |
| Inventory / feed operator | Dealer/account/catalog mapping, source setup, field validation, availability, price/image/URL checks, feed refresh and rejection remediation | Advertisable current inventory with correct destinations and traceable errors | Feed inventory, preview, diagnostics, setup/change proposals, authorised generation and provider status |
| Coordinator / crew | Brief collection, task updates, dependencies, approvals chasing, report preparation and handovers | On-time work, complete briefs, clear ownership and closed follow-ups | Client briefs, boards/tasks, due dates, approved templates, status updates and exception escalation |

These are functions, not a requirement to create six job titles. The head can also perform hands-on work. A deputy can review work only through explicit delegated authority; the author must not approve their own immutable revision. Leave the existing owner/admin reviewer boundary intact until that delegation is implemented and verified.

## Operating rhythm

| Cadence | Department head | Team / crew | MCP output that proves useful completion |
| --- | --- | --- | --- |
| Start of day | Review portfolio exceptions, spend risk, overdue approvals and client escalations; assign priorities | Check connections, sync freshness, delivery failures, disapprovals, inventory changes, lead queues and tasks | Ranked action queue with affected client, evidence timestamp, severity, owner, due time and safe next action |
| During day | Review consequential changes against strategy and authority; resolve blockers | Research, prepare campaigns/assets/content/feed fixes; validate; submit; complete authorised actions | Durable plan/draft IDs, exact change previews, approval status, execution receipts and linked tasks |
| End of day | Check unresolved high-impact issues and next-day readiness | Reconcile attempted actions, close tasks, hand over unknown outcomes; check scheduled content | Change log and unresolved-items handover; no unsupported claim that queued work is published |
| Weekly | Review outcome trends, pacing and forecasts; reprioritise channels and workload | Search-term/creative/audience analysis, SEO opportunities, lead-quality review, content calendar and experiments | Weekly client summary and next-week plan with comparisons, sample sizes and dependencies |
| Monthly | Client reviews, budget decisions, agreed KPI results, capacity and next-month plan | Reconcile spend and outcomes, produce reports, refresh content/feed/account checks | Reproducible client report, explained variance, signed-off next-month plan and delivery commitments |
| Quarterly / new client | Revisit strategy, measurement design, authority and onboarding completeness | Audit access, destinations, tracking, inventory, assets, landing pages and stale campaigns | Client readiness checklist with verified mappings, blockers and evidence; no implicit provider activation |

Do not turn every daily fluctuation into a campaign edit. Respect configured observation windows, conversion lag, campaign learning and experiment plans. Automated scheduled briefs must run as the staff actor with fresh scope; delivery to people or external channels requires a separately configured destination and authority.

## KPI dictionary

Targets must be agreed per client and campaign objective, using business economics, baseline and seasonality. Do not invent a universal ROAS, CPL, posting quota or response SLA. Mark missing targets as `not_configured`.

| KPI | Definition / denominator | Primary owner and cadence | Required qualification |
| --- | --- | --- | --- |
| Budget pacing | Actual spend to date minus planned spend to date; percentage variance divides by planned spend to date | Head + media buyer, daily | Use the approved time-phased plan, not automatically a linear month; zero plan means undefined ratio |
| Forecast variance | Projected period-end spend minus approved period budget | Head + media buyer, daily/weekly | Name forecast method, remaining days, assumptions and source freshness |
| Qualified leads and CPQL | Unique leads meeting the client's agreed qualification rule; eligible media cost divided by qualified leads | Analyst + media buyer, weekly/monthly | Exclude test/spam/duplicates; preserve acquisition cohort and qualification lag; no qualified-lead source means unavailable |
| Lead progression | Qualified-to-appointment, appointment-to-sale and other agreed stage ratios | Head + client sales owner, weekly/monthly | Separate marketing delivery from client follow-up; stage definitions and CRM coverage required |
| ROAS | Attributed conversion value divided by advertising spend | Head + analyst, weekly/monthly | State whether value is actual revenue, modelled lead value or another value; never label it profit |
| ROI / acquisition economics | Agreed net return relative to included costs; CAC uses agreed acquisition costs per acquired customer | Head, monthly/quarterly | Requires verified sales and cost coverage; supply a scoped approved metric rather than broad finance access |
| Funnel conversion | Relevant next-stage outcomes divided by eligible previous-stage users/leads | Analyst, weekly | Specify user/session/click/lead denominator; avoid mixing platform and canonical events |
| Organic search contribution | Search clicks, impressions, CTR, and qualified organic enquiries | SEO/content, weekly/monthly | Segment branded/non-branded where supported; average position is diagnostic, not a revenue outcome |
| Content / creative effectiveness | Objective-specific engagement, landing-page actions and qualified outcomes per creative | Content + media buyer, weekly | State engagement denominator, placement, spend and sample size; comparisons need comparable objectives |
| Community / email service | First-response time, unresolved queue age, delivery/bounce/complaint/unsubscribe rates and meaningful clicks/outcomes | Content + coordinator, daily/weekly | Use agreed service hours and denominators; report platform coverage; opens alone are not a business outcome |
| Delivery reliability | On-time launches/reports/posts divided by items due; review age and rework reasons | Head + coordinator, weekly | Approved briefs and due dates define the denominator; output volume alone does not prove value |
| Inventory readiness | Eligible/approved vehicles divided by intended available inventory; stale-price, unavailable-stock and rejection counts | Feed operator, daily | Keep source completeness, generated-feed validity, provider acceptance and actual serving separate |
| Measurement / data health | Freshness, missing mappings, duplicate signals, delivery failures and reconciled event counts | Analyst, daily | Native enquiry receipt, conversion transport and provider reporting are distinct states |
| Client service | Report timeliness, agreed action closure, client feedback/renewal where authorised | Head, monthly | Satisfaction and retention are shared outcomes; do not infer them from ad clicks |

Google distinguishes profit-oriented ROI from advertising results; its lead measurement guidance recognises qualified and converted lead events. GA4 attribution changes how credit is distributed. Search Console provides search visibility metrics, while TikTok explicitly supports comparing attribution windows and reporting sources. Sources: [Google ROI](https://support.google.com/google-ads/answer/1722066?hl=en), [lead measurement checklist](https://support.google.com/google-ads/answer/16782203?hl=en), [GA4 attribution](https://support.google.com/analytics/answer/10597962), [Search Console performance](https://support.google.com/webmasters/answer/7576553?hl=en), [TikTok attribution analysis](https://ads.tiktok.com/resources/help/article/about-attribution-analytics).

Every metric response should contain client/account IDs, period, timezone, currency, definition/version, numerator/denominator where relevant, attribution model/window, source, last successful sync, missing coverage and comparison period. A missing connector or zero denominator must not become a successful zero. Do not add platforms' attributed conversions together and call the sum unique customers. Aggregate ratios from compatible totals rather than averaging client percentages; separate currencies unless a documented exchange-rate basis exists.

## Existing platform versus staff MCP

The following is source evidence, not a claim of staff-host or provider acceptance. The ordinary-staff allowlist in `server/utils/ai/mcp/marketingPolicy.ts` is authoritative for discovery and invocation. A registered owner tool is not automatically a staff tool.

| Workflow | Existing foundation | Staff MCP position at baseline | Required completion |
| --- | --- | --- | --- |
| Client context and portfolio | Clients, assignments, client analytics dashboards | `get_client_overview` is reviewed; client scope is explicit assignments | Complete paginated client inventory, coverage counts, client objective/KPI/context lookup and portfolio exceptions |
| Paid-media reporting | Campaign/ad/creative/search-term/spend/social services | Six reviewed pilot reads: `get_campaign_breakdown`, `get_ad_breakdown`, `get_ad_creative_text`, `get_search_terms`, `get_adspend_pacing`, `get_social_performance` | Broader trends, funnels, comparisons, health and source-aware report exports |
| Budget health and changes | Budget health, budget alerts, allocated budgets, automation and actions | Pacing is admitted; `get_budget_health` and legacy budget proposals are not in staff allowlist | Scope-safe budget health/forecast, allocation proposals, limits, review and exact approved execution |
| Google Ads campaign setup | Google Ads inventory and extensive typed action plans | Reviewed read/plan names exist in `marketingTask4Names.ts`; production suite flags remain disabled per release record | Resolve activation capacity, prove account authority, enable intended read/plan surface, then delegated review/execution if approved |
| Meta ads / bulk creative launch | Banner ad publishing and Meta campaign/ad-set routes | Not covered by social-post drafting grant | Separate paid-ad workflow, scoped assets/account mapping, campaign budget/targeting preview, review and provider receipt |
| PMax / inventory campaigns | PMax onboarding, preflight and launch services | No complete ordinary-staff workflow demonstrated | Merchant readiness plus explicit permitted campaign types; expose the supported service contract with its actual limits |
| Dealer inventory feeds | Dealer Feeds UI, admin APIs, registered inventory MCP suite | UI middleware is admin-only; inventory suite is not admitted for ordinary staff | Dedicated scoped feed access; source setup, preview, validate, propose changes, regenerate and read provider diagnostics |
| Social publishing | Reviewed draft/revision/review pipeline and publishing status | Six staff tools cover account/media lookup, draft create/update, review submission and status | Calendar/listing and appropriate reviewer queue; exact provider readiness and receipts; retain independent approval |
| Social community operations | Inbox and listening services/tools | `get_social_inbox` is not admitted | Scoped triage, SLA views, draft responses and separately authorised response execution |
| Leads and business outcomes | Canonical leads, rules, CRM pipeline and lifecycle | `get_leads` / CRM reads are not admitted | Scoped aggregate quality/funnel first; minimised lead drilldown, follow-up visibility and reviewed routing changes |
| SEO / local search / content | Search Authority reporting, opportunities, Google Business and content tools | No complete ordinary-staff path in current policy | Stored search/website diagnostics, opportunities, content briefs and reviewed content changes |
| Landing pages / conversion improvement | Page Studio and site analytics; Search Authority editorial publishing is a separate service | Page Studio has its own VIEW/EDIT/APPROVE/PUBLISH permissions, absent from the four current groups | Audit the actual site entitlement and reusable-form contract; scoped draft/preview/review before any website publication |
| Creative production | Banner, video, brand assets, Page Studio and generation suites | Asset lookup for social is narrow; production suites are not admitted | Scoped brief/asset/template access, reusable creative preparation, previews, export and review |
| Email marketing | Campaign metrics and email operations | Existing email performance tool requires MANAGEMENT and is not admitted | Scoped marketing-only reporting and drafts; explicit audience/suppression/approval checks before any sending |
| Work management | Boards, briefs, projects, tasks and capacity | Own `get_tasks` admitted; `create_task` and broad department tools are not | Client/board-scoped work allocation and updates; head workload visibility without HR/payroll access |
| Tracking / GTM | Ownership, inventory and proposal contracts | Reviewed GTM staff proposals/read names exist; execution remains reviewed | Complete evidence/status workflow; preserve native conversion ownership and consent; no duplicate script installation |
| QR / campaign utilities | QR navigation and permission group | QR permission is not evidence of a reviewed staff MCP tool | Audit and expose scoped QR/UTM creation, destinations and analytics if part of supported campaign workflow |

Key source seams: `server/utils/ai/mcp/{marketingPolicy,marketingTask4Names,socialToolNames,registry,staffAuthority}.ts`; `server/utils/ai/tools/{budgetHealth,proposeBudgetChange,leads,crmPipeline,socialInbox,emailCampaigns,createTask}.ts`; `app/pages/agency/dealer-feeds.vue`; `server/api/admin/dealer-feeds/`; `server/api/agency/{analytics,search-authority,banner-studio,social}/`.

Inventory needs business checks as well as technical feed validation. Google's vehicle-ad policy requires accurate prices, landing pages, required attributes and store mapping, with provider review after changes. Do not confuse a generated file with approved/serving vehicles, or vehicle ads with a separate free-listing integration. [Google vehicle-ad policies](https://support.google.com/google-ads/answer/11544533?hl=en).

### Specific implementation traps found during this audit

- `staffAuthority.ts` requests at most 101 assignment rows and returns 503 when more than 100 are found. At 93 assignments there are seven remaining slots; exceeding the ceiling fails the staff authority resolution rather than returning a partial client list. This needs a designed scope/pagination change before portfolio growth reaches that limit.
- `server/api/admin/roles/index.get.ts` reads through cached `queryRows`. The release record documents stale readback during consecutive permission toggles. Use a fresh authoritative read contract and test concurrent/stale edits; a checkbox alone is not proof of persisted authority.
- `server/api/agency/social/spend/bulk-budget.patch.ts` starts from write access and caller-supplied spend IDs. It must not be wrapped as a staff MCP operation without auditing and enforcing client/tenant resource scope throughout the shared mutation service. Allocated budget, agency commission and provider campaign budget are different fields/actions.
- `server/api/agency/banner-studio/ad-publish/google.post.ts` records a pending publication intent; its comments describe the HTML5 bundle upload steps still needed. Do not call this complete Google HTML5 ad publication. This limitation is separate from the implemented Google Ads action-plan services.
- `server/api/internal/mcp/call.post.ts` includes Google Ads planning tools in the generation counter; `rateLimit.ts` caps that class at 20 calls per actor per ten minutes. Multi-client workflows need resumable progress, retry timing and a deliberate cost/rate policy; do not silently bypass the limiter.
- In-app department packs and owner registries list more tools than ordinary staff receive. The policy header/operator prose also contains older wording about client overview, while the actual allowlist now admits `get_client_overview`. Current executable policy wins; reconcile wording during the relevant source slice.

## MCP design requirements

1. **One authority model across UI and MCP.** Use fresh actor identity, tenant, marketing capabilities, client/account/resource scope, signed write scope and read-only policy at list, call, approval and execution. Never grant MANAGEMENT/ADMIN merely to reuse a tool. Browser availability alone does not prove the handler is safe to expose.
2. **Explicit all-active-client marketing scope.** Preserve the authorised 93-client snapshot today. Design a tenant-scoped `all_active_clients` marketing entitlement with revocation and inactive-client exclusion, independent of agency management permissions. Use bounded pagination and completeness metadata; do not remove the current 100-assignment guard without a replacement contract and tests.
3. **Capability-sized delegation.** Separate reporting, budget planning, ads planning, feed operations, creative/content operations, lead operations, work management and review authority. Exact grant names are implementation design, not existing configuration. Reads, local drafts, approvals and provider execution must be distinct.
4. **Discoverable readiness.** Return supported operations and actionable reasons such as missing grant, disabled suite, unconnected account, expired consent, provider product unavailable or review required. Do not hide all context behind an empty tool list or imply unsupported LinkedIn/TikTok paid-ad execution exists.
5. **Reuse scoped domain services.** Harden shared services first, then adapt both UI and MCP. Do not call broad admin HTTP routes with an owner credential. Check supplied resource IDs against the caller's allowed client/account before reading, mutating or fetching provider data.
6. **Complete reviewed operations.** Prepare a durable revision, show exact destination and before/after diff, validate limits, submit for an independent reviewer, and execute only that approved revision. Staff should be able to complete review through MCP once explicit reviewer authority is implemented; a browser link is a useful fallback, not full MCP completion.
7. **No invisible external effects.** Report draft, validation, approval, queued, dispatched, provider-accepted, published/serving, failed and unknown separately. Bind idempotency to actor/client/revision/action. An unknown provider outcome needs reconciliation, not a blind retry.
8. **Read-only reporting stays read-only.** Default to stored data with freshness. Refresh/sync/expensive analysis must be explicit operations with budgets and permissions. A request for a report must not trigger publishing, ad spend, tracking installation or messages.
9. **Protect underlying ownership.** For tracking, establish exact client/dealer/host/form/backend and conversion owner before planning. Native DriveAgent server delivery remains authoritative; browser attribution and consent are separate. No fabricated enquiry for acceptance proof.
10. **Usable outputs.** Provide evidence links, stable IDs, time/currency units, next actions and concise result summaries. Keep provider secrets, customer payloads and administrative implementation detail out of ordinary answers and audit logs.
11. **Safe account onboarding.** Let staff inspect client/account/property/catalog mappings and start supported connection flows. OAuth consent belongs to the authorised person and provider; the assistant must never ask for passwords or copy owner tokens. Report expired grants and reauthorisation needs without claiming they have been repaired.

## Delivery sequence and acceptance

| Work package | Concrete result | Completion test |
| --- | --- | --- |
| P0 — access truth and activation | Accurate capabilities/readiness, fresh role reads, department scope design, binding-capacity plan and actual staff-host verification | Each employee connects using their own login; expected tools list and execute; unsupported tools explain readiness; revoked/inactive client access rejects immediately; 93/93 coverage is explicit |
| P1 — daily command centre | Portfolio health, budget pacing/forecast, campaign status, lead-quality aggregates, inventory health and overdue work | A daily brief covers every authorised active client, flags stale/missing data, links evidence and assigns no fabricated outcomes; 101+ client fixture proves bounded completeness |
| P2 — budgets and campaign operations | Scoped budget allocation and paid-campaign planning/review; supported Google/Meta operations | Exact client/account targeting; limits and stale revisions rejected; independent approval; no cross-client IDs; actual provider receipt distinguished from plan-only success |
| P3 — inventory/feed operations | Scoped feed setup, mappings, previews, validation, changes and regeneration | Wrong-client feed rejected; price/availability/URL defects surfaced; approved diff applied idempotently; generation and provider review/serving evidence remain separate |
| P4 — content, creative and service delivery | Calendar, assets, creative preparation, SEO opportunities, inbox triage, client-scoped tasks and reports | A staff member completes a brief-to-review-to-status workflow; review authority enforced; content/board/customer boundaries preserved; external messages remain explicit |
| P5 — department leadership | Head scorecard, priorities, capacity, delegated review queue and monthly client packs | Confirmed head sees scoped team delivery and business KPIs; no payroll/accounting expansion; every report can be reproduced from recorded sources and definitions |

P0 and P1 are first because they establish what the department can see and whether the data is trustworthy. Budgets/ad setup and inventory are the next priorities explicitly named by the owner. Work packages can share audited domain services; they are not six new systems.

The existing Pages release has a recorded 150/150 text-binding estimate. Resolve capacity deliberately before new provider flags/secrets; do not remove settings based on a name match. Google Ads MCP flags are absent; LinkedIn credentials and TikTok external acceptance remain unresolved in the release record. These are deployment/provider gates, not missing role checkboxes.

Before each implementation PR: re-fetch main, inspect the final diff, run meaningful scope/revocation/revision/idempotency tests, preserve established QR/navigation behavior and update relevant public feature pages only for delivered behavior. This research-only change requires document/source/link verification, not a production build or deployment.

## Example acceptance prompts

These describe the target experience; they are not claims that the current staff MCP can complete them all.

- “Across all active clients, show today's budget risks, stale feeds, campaign failures, overdue approvals and unassigned marketing work. Explain what is missing.”
- “For this client, compare spend and qualified leads with last month. State the attribution windows, data freshness and whether sales are available.”
- “Prepare next month's channel budget within the agreed total. Show the changes and submit them for review.”
- “Prepare the supported Google search campaign from this approved brief, validate targeting and conversion ownership, and show the review link.”
- “Show this dealer's inventory readiness. Preview a feed correction for missing images and stale availability before applying anything.”
- “Create next week's social drafts using approved assets, submit the exact revisions for review, and show publication status afterwards.”
- “Turn the approved SEO and creative actions into client-board tasks with owners and due dates.”
- “As the delegated department reviewer, show the queued changes I may approve, exclude my own submissions, and explain any blocked execution.”

## Research limitations

The occupational sources describe functions, not these employees' agreed employment duties. The KPI dictionary is a proposed operating contract; no personal performance scores or confidential compensation were inspected. Current source was audited, but no new employee host session, provider action, live campaign, customer communication or tracking event was created during this R&D. Existing implementation, deployed configuration and real provider acceptance remain separate evidence levels.

## Research provenance

Claude completed the department workflow/acceptance plan; Codex completed the source audit and coordinator synthesis. Kimi gathered occupational and provider sources but reached its weekly provider quota before producing its final report; the coordinator independently completed the online research cited above. This is not described as a completed three-model review.

Local evidence is retained in `.superpowers/sdd/2026-10-27-marketing-staff-mcp/department-rd-claude-plan.md`, `department-rd-source-audit.md` and `department-rd-kimi-quota-receipt.json`. The tracked document carries the substantive conclusions; those local reports are supporting evidence, not release authority. No new runtime feature or permission was deployed by this research.
