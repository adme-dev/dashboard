# XeroFlow dealer-feed connector control plane

Captured: 2026-08-13
Priority: P0
Status: pending
Source: Geelong GWM Haval campaign/feed setup

## Outcome

An authorised operator must be able to complete the whole dealership campaign-feed workflow inside XeroFlow. Browser automation, direct database edits, provider dashboards and Monday comments may supply evidence or exceptional recovery, but must not be required for the normal workflow.

The remote XeroFlow MCP must expose the same governed application services and policy checks. It must not implement a second feed-management path.

## Required workflow

1. Resolve or create the canonical agency client from a verified Xero contact without conflating a dealership with its broader motor group.
2. Discover and link the client's Google Ads, Merchant Center, Meta ad-account and catalog identities through their connectors.
3. Discover inventory sources and seller/store identities; prove client ownership and condition coverage before publication.
4. Build, preview and validate platform-specific feeds for explicit New, Demo and Used scopes.
5. Bind each feed to its campaign brief and external campaign/catalog resource.
6. Publish only after deterministic readiness checks and human approval, then read back and reconcile provider state.
7. Surface blocking evidence, remediation steps and durable audit history in XeroFlow.
8. Offer equivalent MCP tools for authorised client resolution, connector discovery, mapping, feed preview/validation, approved publication and reconciliation.

## Gaps exposed by Geelong GWM Haval

- Dealer Feeds currently lists internal `agency_clients`, not verified Xero contacts that have not yet been synced.
- The exact Xero customer and the broader `Geelong Motor Group` record can diverge.
- Campaign evidence is split between Monday, XeroFlow launch records, inventory sources and provider dashboards.
- A feed workspace cannot safely publish New + Demo + Used until every seller/store scope is verified.
- The existing website Google feed is not acceptable evidence when its dealership label and inventory sources conflict.
- Google/Meta account and catalog discovery must be connector-driven and visible from the same client workspace.

## Acceptance criteria

- Selecting an unsynced verified Xero customer offers a reviewed, idempotent create/link action inside XeroFlow.
- XeroFlow preserves distinct dealership and motor-group identities unless an operator explicitly merges them.
- One client workspace shows Xero, inventory, Google Ads, Merchant Center, Meta and campaign bindings with freshness/readiness states.
- Operators can create or update separate Google and Meta feeds using exact condition and seller/store filters.
- Preview shows matched, valid and rejected inventory with reasons before any provider mutation.
- Publication fails closed for missing or ambiguous client, seller, store, account, catalog or data-source identity.
- Provider readback proves the exact feed/catalog resource, item counts, conditions and deletion handling.
- Monday can be linked as evidence and updated from XeroFlow, but it is not the system of authority for feed configuration.
- MCP calls use the same services, authorisation, approval, idempotency, audit and reconciliation as the XeroFlow UI.
- End-to-end tests cover Xero client sync, Google and Meta feed setup, campaign binding, provider readback, revocation and cross-client isolation.

## Current Geelong safety state

- Canonical Xero contact: `Geelong GWM Haval` (`23c8c676-9e99-46d4-b66c-a4a9c87996da`).
- Exact XeroFlow client: `ef849136-7368-4650-bf89-853cbfa6a24a`.
- Broader `Geelong Motor Group` remains separate.
- Monday PMax item `11204153481` requests New, Demo and Used.
- Publication remains blocked until the exact New/Demo seller scope and Merchant data-source identity are verified.
