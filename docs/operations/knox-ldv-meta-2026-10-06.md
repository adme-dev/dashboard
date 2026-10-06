# Knox LDV October clearance — operational handoff

Source brief: https://adme2.monday.com/boards/13392458/pulses/13202517942

## Live feed

- Catalogue: `2872228549799937` (Knox LDV, vehicles).
- Meta product feed: `2291641504926312`, Knox LDV Demo Inventory – XeroFlow.
- Serve URL: https://socials.driveagent.io/api/feeds/143ee994-0e74-41a2-bb28-734be4493669/serve
- Schedule: hourly, AUD, GMT+11.
- Source: official dealer website's DealerStudio search inventory, location 7471, make LDV; saleable demo stock only.
- Both listings accepted by Meta at 19:36 Melbourne time; upload summary: 2 added, 0 failed, 0 issues. Both appear in the catalogue Items table.
- Stocks 515238 ($48,888) and 515424 ($42,888); their official listing URLs were verified against stock/VIN.
- Required address fields repaired using the brief: 780 Burwood Highway, Ferntree Gully VIC 3156, Australia.

## Campaign preparation — not published

- Ad account `996711612319413`, Knox LDV, AUD, Australia/Melbourne.
- Safari draft campaign `120250015698200143`, ad set `120250015698190143`, ad `120250015698210143`.
- Name: Knox LDV | Meta AIA Traffic + Video Card | October Clearance.
- Objective: Traffic; website; landing page views. Shared lifetime budget $700.
- End: 31 October 2026 at 23:59 Melbourne time; start ASAP.
- Catalogue media plus approved square seven-second video intro card.
- Approved primary text and clearance headline entered; AI text variations disabled; Shop now CTA.
- Inventory destination: https://www.knoxldv.com.au/search/demo-cars
- Video intro destination: https://www.knoxldv.com.au/search/new-and-demo-cars
- Ad set switched off while launch prerequisites remain unresolved. Never publish this draft without resolving Page identity and targeting: the current default identity is an unrelated dealer and location remains Australia.

## Launch blockers

Existing Knox LDV ads reference Facebook Page `953534784499308`. The current Safari Page selector returns zero results for that exact ID. The dashboard's existing active Meta tokens also cannot read that Page. Owner must supply an existing login with advertising access or identify the approved replacement Page; do not substitute Knox GWM or another dealer.

Brief specifies PMA but no boundary. Existing Knox LDV ads use a 15-mile radius around latitude -37.88157, longitude 145.27158, ages 25–65. This is evidence of prior targeting, not proof of the current OEM PMA boundary. User was asked for approved PMA details. Do not publish Australia-wide or silently guess a PMA.

No Monday update or other outbound message was posted.

## MCP work

First fix: inventory feed health now lists unbound/paused feeds, uses validated counts rather than all matching candidates, and preserves aggregate issue totals rather than counting only sampled errors. Focused tests pass; not deployed.

Remaining approved work: discover dealer setup and mapped Meta assets; preview feeds; create/edit source, filters, mappings and URL settings; activate/pause; validate listing destinations; preserve existing attach/refresh confirmation and audit behavior. No additional tools or campaign-launch capability have been implemented yet. OAuth, authentication and Page-access grants still require a valid authorized connection.

Work branch: `fix/mcp-dealer-feed-setup-20261006`; base `23ab2f936`. Keep it as active unfinished work, not a future deployment base without fetching and reconciling current main.
