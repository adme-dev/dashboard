# Target Operating Flow — Account-Manager-Initiated, AI/MCP-Assisted, Human-Executed

- **Date:** 2026-06-28
- **Status:** Vision / north-star (Paul, Slack-driven) — frames the brief→job + budget + studio + MCP work
- **One line:** The account manager makes a request; automatic flows set the job up *almost fully* (brief → tasks → budget allocation → assignees → creative); humans still log into the ad platforms to create the live campaigns; the existing AIs/studios (Banner, Video, Traffic Controller), exposed over MCP, both *originate* briefs and *clean them up to industry standard*.

## The flow

```
Account manager (Alicia) request
        │  ← the single entry point; her request is the trigger
        ▼
AUTOMATIC FLOW  (the platform sets the job up almost fully)
   • brief from the right template (campaign type, channel split)
   • structured budget allocations (monthly/total, per campaign-type)   ← structured-job-budget-model
   • project + tasks + subtasks, with department + status + assignees    ← brief→job P0/P1 (now working)
   • creative requested from the studios (banner / video) where needed
        │
        ▼
AI / MCP ASSIST  (originate + standardise)
   • Banner Studio, Video Studio  → produce creative; can seed/attach to a brief
   • Traffic Controller AI         → orchestrate/route; can propose briefs
   • all exposed as MCP tools      → "start these briefs" + "rectify, clean up to industry standard"
   • AI proposes; the account manager confirms (human-in-the-loop)
        │
        ▼
HUMAN EXECUTION  (the firm boundary)
   • we log into Facebook/Meta/Google ourselves and create the live campaigns
   • the platform prepared everything to standard; it does NOT autonomously write to ad platforms or move spend
```

## The boundary (non-negotiable)

**The dashboard prepares and standardises; humans execute on the ad platforms.** No autonomous campaign creation or spend/budget writes to Meta/Google — consistent with every prior decision (dealer-feeds plugin has no platform writes; budget-write flags never flipped; AI proposes / human confirms). "Almost fully set up" = everything *except* the final human action on the platform.

## How the existing pieces serve this

| Asset (already built) | Role in the flow |
|---|---|
| Brief templates + `briefCampaignType` taxonomy | The structured intake — campaign type / channel split, captured not free-typed |
| Brief→job conversion (P0/P1, now working) | Auto-creates the project + tasks + assignees from the brief |
| Structured job budget model (spec) | Per-channel typed allocations — ends the Geelong-Kia-style budget confusion |
| Banner Studio / Video Studio (MCP tools, flag-gated) | Produce creative as part of the flow; can originate briefs |
| Traffic Controller AI | Orchestrate/route work; propose briefs; standardise |
| XeroFlow MCP server | The bus that lets these AIs start + clean up briefs |
| Dealer-feeds plugin (P1a) | Feeds the automotive jobs with live inventory for the briefs |

The thread that connects them: **the brief/job is the structured substrate; the studios + Traffic Controller (over MCP) are the workers that fill and standardise it; the account manager is the human in the loop; platform execution stays manual.**

## What this implies for sequencing (builds on committed work)

1. **Make AM intake the trigger** — the account manager's request reliably produces a fully-shaped job (brief→job P0/P1 ✅ makes this possible; needs the AM-facing intake UX).
2. **Structured budget at intake** — implement the budget-allocation model (P2) so jobs carry unambiguous per-channel budgets.
3. **Studios as flow steps** — when a brief needs a banner/video, auto-create the studio job (their MCP tools already exist behind flags) and link it back to the brief.
4. **Traffic Controller as originator + QA** — let it propose briefs and run a "clean to industry standard" pass (completeness, channel split, budget sanity) — AI proposes, AM confirms.
5. **Standardisation rules** — encode "industry standard" as the gatekeeper's required-field + sanity contract (e.g. a conquesting job must have a campaign-type split, a typed budget, a deadline).

## Open questions
1. What is the account manager's **intake surface** — the existing brief form, a lighter "AM request" entry, or a conversational/AI intake that drafts the brief?
2. Which studio steps auto-trigger from which brief types (e.g. Meta AIA → banner; video campaign → video studio)?
3. What concretely is "**industry standard**" for the Traffic Controller's clean-up pass — a checklist we can encode (required channel split, typed budget, disclaimers, deadline)?
4. Sequencing vs the unmerged branches (dealer-feeds, brief-mapping, brief→job) — merge order before layering this on.
