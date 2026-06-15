# AI-managed campaign tooling — vendor scan + build/skip roadmap

**Date:** 2026-06-16
**Method:** deep-research harness (5 angles, 23 sources, 25 extracted claims) — note: the harness's adversarial *verification* phase was rate-limited and did not complete, so claims below are search-extracted + corroborated against domain knowledge. The most load-bearing / time-sensitive claims were then **re-verified by live browsing of primary sources** (Google Ads API docs, Google Ads Help, Meta Business Help via search) — those are marked ✅ VERIFIED.

## Strategic frame (the key finding)
The ad platforms have **absorbed bid-level optimization.** Google Smart Bidding / PMax and Meta Advantage+ now own target-CPA/ROAS bidding, placement, and much audience selection; both now also ship in-account AI assistants (Google **"Ask Advisor"**, a Gemini agentic experience ✅ VERIFIED; Meta Advantage+ AI). Industry framing has shifted from "manual bid levers" to **"signal management"** — optimizing the *inputs* the algorithm learns from (conversion values, exclusions, budgets, creative volume).

**Implication for us:** don't rebuild platform bidding — we'd lose. The durable agency value (and where Revealbot / Madgicx / Optmyzr actually live) is the **orchestration + guardrail + auto-action + accountability layer on top, across many accounts.** Our spend-sync + guard-railed write + approve/apply + audit foundation makes that layer cheap.

## Prioritized roadmap (value vs. effort)

| # | Capability | Value | Effort | Cheap on our foundation? | Verdict |
|---|---|---|---|---|---|
| 1 | **Guardrailed auto-action engine** (our 6 detectors → notify→approve→autopilot via existing write+audit) | ★★★ | Low–Med | **Yes** | **BUILD next** |
| 2 | **Google Recommendations passthrough** (`RecommendationService` → approve→apply; `RecommendationSubscriptionService` for autopilot) | ★★★ | Low | **Yes** | **BUILD next** |
| 4 | **Conversion-tracking health** (zero-conv detector + `IMPROVE_GOOGLE_TAG_COVERAGE` rec + leads-flow) | ★★ | Low | **Yes** (folds into #2) | **BUILD** |
| 3 | **Cross-campaign / pacing-to-goal reallocation** (shift budget across a client's campaigns toward monthly target) | ★★★ | Med | Partly | **BUILD after 1–2** |
| 5 | **Value-based "signal" feeding** (push dealership lead values to Meta/Google as conversion values) | ★★★ (strategic) | Med–High | Partly (leads + Xero supply values) | **BET / spike** |
| 6 | **Negative-keyword mining** (Google search-terms → suggest → apply) | ★★ | Med | Partly | **BUILD (SEM)** |
| 7 | **Creative fatigue detection** (frequency/CTR-decay, read-only signal) | ★★ | Med | Partly | **Signal only; don't auto-act** |
| 8 | Own bidding algorithm / bid-strategy micro-switching | ★ | High | No | **SKIP** (platform owns it) |
| 9 | DCO / real-time creative serving | ★ | High | No | **SKIP/partner** (Advantage+ Creative, Google Asset Studio) |
| 10 | Audience / lookalike management | ★ | Med | No | **SKIP** (platform-native) |

## By capability area

### 1. Budget & bid optimization
- **Vendors:** Revealbot = deterministic IF/THEN rules (ROAS/CPA/CPM/CTR/frequency/spend) on 15-min→daily schedules; actions pause/enable/budget±(flat or %)/bid-cap/duplicate/notify. Madgicx = predictive-ROAS budget allocation (~14-day forecast) shifting budget across campaigns on top of Meta CBO. Optmyzr Rule Engine = scheduled, **guardrail expressions capping new bid vs current**, edit-locking when a run is imminent.
- **Guardrail patterns to copy:** relative caps (new ≤ X×current), scheduled runs + concurrency locks, upper limits. We already have ±20% clamp / max-multiple / rate-limit / read-back — ahead on safety.
- **API:** Google `CampaignBudgetService` (have), bidding strategy / tCPA-tROAS; Meta campaign/adset `daily_budget` (have), `bid_amount`/`bid_strategy`.
- **Recommendation:** BUILD cross-campaign reallocation + pacing-to-goal (we own monthly client budgets). SKIP own bidding algorithm.

### 2. Creative & copy
- **Vendors/native:** Meta **Advantage+ Creative** and Google **Asset Studio** (text→image, bulk transform up to 100 product photos to lifestyle, **video** generation ✅ VERIFIED via Google blog) do generation/DCO natively. Madgicx DCO serves best combo per user. Fatigue detection (frequency + CTR-decay) is a common third-party signal.
- **API:** Meta creative via `object_story_spec` (we already create ads in banner-studio); Google `AssetService`. Fatigue = read-only Insights.
- **Recommendation:** Don't rebuild DCO/generation — platforms + our own Banner/Video/Audio studios cover supply. BUILD fatigue detection as a signal; tie creative refresh to our studios.

### 3. Audience & targeting
- **Vendors/native:** Meta removed the **ASC Existing-Customer Budget Cap on 2025-02-06** ✅ VERIFIED — cold acquisition now needs manual exclusions / split ad sets. Google **customer lifecycle goals** ✅ VERIFIED (renamed from earlier "new customer" framing): *New Customer Acquisition* incl. **"New Customer Value Mode"** (bid higher for new customers; needs value-based bidding + Customer Match), and *Retention*; spans Search/PMax/Shopping/Demand Gen. PMax also supports campaign-level negative keywords.
- **API:** Google `CustomerNegativeCriterionService.mutateCustomerNegativeCriteria` = account-wide negatives ✅ VERIFIED; ad-group/campaign negatives via `AdGroupCriterion`. Meta Custom/Lookalike via API.
- **Recommendation:** BUILD negative-keyword mining for SEM. SKIP lookalike/audience tooling (platform-native).

### 4. Auto-action & monitoring
- **Vendors:** Core of Revealbot/Madgicx — compound multi-condition rules (e.g. *frequency>3.5 AND ROAS<1.8 → pause; re-enable after 48h if CPM normalizes*), pause/scale/budget/notify, Slack/email. Google native automated rules: pause keyword after 100 clicks/0 conv; bid +25% with enforced upper limit; conditional budget increases.
- **Recommendation:** Our **#1 build.** We already *detect* (under/over-spend, stopped, paused-with-budget, stale-sync, zero-conversion) and *write with guardrails + audit*. Wire detectors → guardrailed actions in tiers (**notify → human-approve → autopilot**), reusing the plan→approve→apply chain. Differentiates on safety + multi-account accountability.

## What I'd build next
1. **Guardrailed auto-action engine** (tiered notify→approve→autopilot) on existing detectors — biggest leverage; reuses everything.
2. **Google Recommendations passthrough** (`RecommendationService` retrieve/apply/dismiss + `RecommendationSubscriptionService` autopilot). ✅ VERIFIED rich type set: `CAMPAIGN_BUDGET`, `FORECASTING_CAMPAIGN_BUDGET`, `FORECASTING_SET_TARGET_CPA`/`ROAS`, `KEYWORD`, `IMPROVE_PERFORMANCE_MAX_AD_STRENGTH`, `IMPROVE_GOOGLE_TAG_COVERAGE`. Near-free: Google does the analysis; we wrap in approve/apply/audit. **Folds in #4** (tag-coverage = conversion-tracking health).
3. **Pacing-to-goal cross-campaign reallocation** — natural extension of pacing + write; serves monthly client-budget management.
Then the **value-based signal-feeding spike** as the strategic bet.

**Skip:** own bidding algorithms, DCO/creative-serving engines, audience/lookalike tooling — platforms own these; rebuilding is negative ROI.

## Sources (selected)
- Google Ads API — Recommendations overview + `RecommendationTypeEnum` (primary, ✅ live-verified)
- Google Ads API — `CustomerNegativeCriterionService` sample (primary, ✅ live-verified)
- Google Ads Help — Customer lifecycle goals (primary, ✅ live-verified)
- Google blog — AI Asset Studio (primary)
- Optmyzr help — Rule Engine FAQs (primary)
- bir.ch — Facebook / Google automated rules (secondary)
- Madgicx, Revealbot reviews, adlibrary comparison, almcorp "signal management" (blog/secondary)
- Meta ASC budget-cap removal 2025-02-06 (multiple secondary, corroborated; ✅ date-verified)

## Caveat
Deep-research adversarial verification did not complete (API rate-limit). Vendor-blog claims (Madgicx/Revealbot specifics) are not independently verified beyond the cited blogs + domain knowledge; treat exact feature/pricing specifics as directional. Primary-source items marked ✅ VERIFIED were confirmed by live browsing.
