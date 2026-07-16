# Spec: Client-intelligent News Inbox

## Objective

Turn the aggregated MCP news source into a client-scoped publishing inbox. Agency users choose a client, see news ranked and filtered against that client's industry and content brief, optionally rewrite selected stories in the client's voice for each connected social platform, then create approval-safe drafts or scheduled posts through the existing publishing workflow.

This is not a dealer inventory feed. The MCP endpoint remains a configurable news-source plug-in and source stories remain immutable.

## Assumptions

1. A client has one active social content profile in V1. The profile may reference a brief, but stores a durable snapshot so changing an old project brief does not silently change future recommendations.
2. Relevance ranking is deterministic and explainable in V1: topic, industry, make, include-keyword, and exclude-keyword matches. AI may rewrite selected content, but does not decide what is published.
3. Creating a news post defaults to `draft`. Scheduling is explicit; any existing approval requirement remains a hard gate before publishing.
4. One story may be reused for multiple clients. Each client receives a separate social post with its own platform variants, accounts, voice, and schedule.
5. Existing `social_accounts`, `social_slot_schedules`, `social_posts`, per-platform overrides, and approval endpoints remain the publishing source of truth.

## Product Contract

### Client content profile

Each active client may define:

- industry and target audience;
- content pillars/topics;
- included and excluded keywords;
- relevant vehicle makes or other brand terms;
- brand voice, default tone, and additional AI instructions;
- preferred platforms and timezone;
- default workflow (`draft` or explicit schedule); XeroFlow's approval gate remains mandatory in V1;
- optional source brief and the time the brief was imported.

### Reusable social content packages

- Admins may define reusable industry playbooks (for example Automotive Dealer, Caravan/RV, or Professional Services) containing default pillars, sources, exclusions, audience angles, platform mix, cadence, approval policy, and AI guidance.
- A client package assignment snapshots the package defaults into the client's approved profile and records the package/version used. Client overrides remain explicit and survive later package-template changes.
- Packages reference existing XeroFlow commercial records (rate-card item, project/retainer, and budget allocation) rather than creating a separate finance ledger.
- Commercial scope includes a period, budget/cap, included draft/published volumes by platform, AI or production allowance, approval SLA, and overage policy.
- Usage is measured from existing post provenance and status: selected, drafted, scheduled, approved, published, and failed. The UI can show included-versus-used volume and forecast overage before scheduling.

### News discovery

- Selecting a client filters available accounts to that client and ranks stories for that profile.
- Users can filter by text, topic, make/brand, source, recency, relevance, and inbox state.
- Every relevance result exposes concise reasons such as `Topic: EV` or `Keyword: fleet`.
- Excluded terms remove an item from the relevant view but do not delete the source story.
- A user can still view all stories and manually select an unmatched story.

### AI rewrite

- Rewriting is opt-in and produces a distinct caption per selected platform.
- The prompt includes the client's audience, voice, content pillars, and additional instructions.
- Source content is delimited and treated as untrusted data; links and factual attribution are preserved.
- Users can regenerate, edit, or revert in Compose. AI output never bypasses account access, approval, or scheduling rules.

### Scheduling and approvals

- Connected accounts are scoped by the selected client and selected platforms.
- Users may save as drafts, choose a specific time, or use the client's next available recurring posting slot.
- Scheduled posts that require approval stay blocked until approved; a missed approval does not publish late automatically.
- News provenance is retained in post metadata for reporting and audit.

### Dashboard AI knowledge and recommendations

- A client's content profile, connected social profiles, recurring slots, recent publishing history, and aggregate engagement become a client-scoped social knowledge record.
- The embedding metadata is typed and client-scoped. It is retrieved through a dedicated permission-checked social recommendation tool, not the agency-wide SOP knowledge search.
- The AI can recommend a story, client, account/platform, audience angle, and posting window and must explain the evidence used.
- Timing recommendations use this evidence order: the client's own account history, then saved client slots, then an explicitly labelled industry heuristic. A lack of evidence is reported rather than disguised as certainty.
- Dismissals, selections, edits, approvals, published results, and engagement are feedback signals. They may improve later ranking but do not create autonomous publishing authority.

## Tech Stack

- Nuxt `^4.4.8`
- Nuxt UI `^4.9.0`
- TypeScript `^5.9.3`
- PostgreSQL via `pg ^8.22.0`
- Vitest `4.1.10`

## Commands

- Focused tests: `pnpm vitest run test/social/socialNews.test.ts test/social/socialNewsPublishing.test.ts`
- Publishing regression: `pnpm run test:social-publishing`
- Typecheck: `pnpm run typecheck`
- Build: `pnpm run build`

## Project Structure

- `server/database/migrations/` — durable content-profile schema
- `server/utils/socialNews*.ts` — source normalization, relevance, and AI prompt logic
- `server/api/agency/social/news/` — inbox, profile, refresh, and draft handoff APIs
- `app/pages/agency/social/publishing/news.vue` — client-first inbox and profile settings
- `test/social/` — relevance, prompt, route, and publishing contract tests

## Testing Strategy

- Unit-test deterministic scoring, exclusions, relevance reasons, profile normalization, and prompt safety.
- Contract-test route permissions and client scoping.
- Regression-test the complete social-publishing suite and TypeScript build.
- Verify production with an authenticated browser: select a client, filter stories, create a draft, and confirm it appears in Compose/Approvals with the correct account targets and provenance.

## Boundaries

- Always: enforce client access server-side; validate all IDs and profile input; preserve source provenance; create separate posts per client; retain approval gates.
- Ask first: enabling automatic publishing, changing external account connections, or replacing the platform-wide approval model.
- Never: send an MCP story directly to a network; let AI choose accounts or publish autonomously; treat source text as instructions; expose another client's profile or accounts.

## Success Criteria

1. An agency user can select a client and see explainable, relevant stories based on that client's saved content profile.
2. Topic/industry/keyword/make filters narrow the inbox without mutating source data.
3. AI rewrites use the selected client's brief context and create per-platform variants.
4. Draft, specific-time, and next-slot choices hand off to existing publishing, account, and approval controls.
5. The source URL remains admin-configurable as a plug-in and a URL change requires no application deployment.
6. Dashboard AI can retrieve client-scoped social context and return an explainable what/client/account/audience/time recommendation without leaking another client's data.
7. A reusable package can seed a client profile and report content usage against its linked XeroFlow budget without duplicating accounting data.
8. Tests, typecheck, deployment, and authenticated production verification pass.

## Later Enhancements

- Import/update a content profile from a selected approved brief with a reviewable diff.
- Learn relevance weights from user selections and dismissals.
- Recommend posting times from per-account engagement history once sufficient data exists.
- Learn audience and time recommendations from per-account performance once a statistically useful history exists.
- Campaign-level content goals and frequency caps.
- Versioned industry packages, budget usage, and overage alerts after the client-profile pilot is proven.
