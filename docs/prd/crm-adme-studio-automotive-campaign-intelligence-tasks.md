# ADME Studio Automotive Campaign Intelligence Task List

Status: Planned
Parent: `docs/prd/crm-adme-studio-automotive-campaign-intelligence-rnd.md`

## Phase 0: Governance and contracts

- [ ] ADME360-001 Register ADME as a shared public-evidence provider, not a tenant data source.
- [ ] ADME360-002 Confirm the canonical production MCP endpoint before any configured-domain cutover.
- [ ] ADME360-003 Freeze an allowlist for supported read-only MCP tools.
- [ ] ADME360-004 Define evidence, derivative-AI, image-rights, and attribution fields.
- [ ] ADME360-005 Define tenant projection and privacy-safe aggregate contracts.
- [ ] ADME360-006 Add MCP prompt-injection, SSRF, redirect, payload-size, and schema controls to the threat model.

## Phase 1: Canonical evidence projection

- [x] ADME360-010 Promote source type, original source URL, image credit, coverage count, outlets, summary bullets, dealer note, and strategic angle from the retained raw payload.
- [x] ADME360-011 Add stable provider cluster identity, raw checksum, fetched-at time, and connector version.
- [ ] ADME360-012 Map makes, models, topics, entities, geography, and source types into canonical automotive taxonomy.
- [x] ADME360-013 Record provenance and derivative labels on every normalized field.
- [ ] ADME360-014 Add schema-drift telemetry and a dead-letter path.
- [x] ADME360-015 Reuse the canonical projection in social publishing instead of creating a parallel feed.

## Phase 2: Shared trend intelligence

- [ ] ADME360-020 Compute deterministic freshness, velocity, novelty, and source-diversity features.
- [ ] ADME360-021 Add daily `list_topics` taxonomy synchronization.
- [ ] ADME360-022 Add controlled warm `list_stories` refresh with request coalescing and stale-while-revalidate behavior.
- [ ] ADME360-023 Reserve `get_story` for shortlisted candidates.
- [ ] ADME360-024 Use `search_history` and `get_archive_day` for research, backtesting, and recovery.
- [ ] ADME360-025 Add provider health, last-success, latency, volume, and freshness monitoring.

## Phase 3: Tenant projection

- [ ] ADME360-030 Match evidence to authorized client makes, models, services, geography, and audiences.
- [ ] ADME360-031 Join tenant inventory, SKU/stock ID, days in market, sold status, and price-band context.
- [ ] ADME360-032 Join website behavior, onsite searches, top pages, device mix, funnel events, and attribution.
- [ ] ADME360-033 Join current campaign, creative, objective, landing-page, and budget context.
- [ ] ADME360-034 Join canonical lead, qualified, won/lost, sale, and revenue outcomes.
- [ ] ADME360-035 Enforce tenant isolation and prohibit cross-client persona joins.

## Phase 4: Recommendation surfaces

- [ ] ADME360-040 Add a read-only `recommend_automotive_campaign_context` AI tool.
- [ ] ADME360-041 Include evidence links, attribution, relevance reasons, disqualifiers, expiry, and confidence in every result.
- [ ] ADME360-042 Surface evidence-backed ideas in social publishing.
- [ ] ADME360-043 Surface market context in portal website and funnel analytics.
- [ ] ADME360-044 Surface campaign hypotheses in Google, Meta, LinkedIn, and TikTok planning views when those channels exist.
- [ ] ADME360-045 Surface cited context to CRM and future AI receptionist workflows without granting mutation authority.
- [ ] ADME360-046 Add inventory, offer, legal, tracking, landing-page, image-rights, and platform-policy checks.

## Phase 5: Approval and activation

- [ ] ADME360-050 Convert an accepted recommendation into a versioned brief.
- [ ] ADME360-051 Require human approval before post scheduling, campaign creation, creative changes, or budget changes.
- [ ] ADME360-052 Record recommendation view, dismissal, approval, expiry, and activation events.
- [ ] ADME360-053 Link activation IDs to campaign, content, landing-page experiment, and CRM outcome IDs.
- [ ] ADME360-054 Prevent expired, contradicted, or rights-blocked evidence from activation.

## Phase 6: Learning and reporting

- [ ] ADME360-060 Report the chain from evidence to recommendation, action, and outcome.
- [ ] ADME360-061 Measure engagement, assisted conversion, CPL, cost per qualified lead, cost per sale, and revenue.
- [ ] ADME360-062 Add inventory movement and days-in-market measures where applicable.
- [ ] ADME360-063 Add recommendation effectiveness by topic, make, model, source diversity, objective, and channel.
- [ ] ADME360-064 Introduce minimum-cohort and privacy thresholds before shared aggregate learning.
- [ ] ADME360-065 Add integration-health alerts for stale feeds, schema drift, missing attribution, and broken outcome joins.

## Phase 7: Controlled intelligence expansion

- [ ] ADME360-070 Add Google Trends as a separately attributed relative-interest signal.
- [ ] ADME360-071 Add marketplace sold and on-market velocity features.
- [ ] ADME360-072 Add product-feed and stock-pressure features.
- [ ] ADME360-073 Add 360 audience and persona cohort summaries with consent and minimum-cohort controls.
- [ ] ADME360-074 Add experiment holdouts before claiming recommendation lift.
- [ ] ADME360-075 Expose approved read-only intelligence through the client MCP with tenant-scoped authorization and audit.
