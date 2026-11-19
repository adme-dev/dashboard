# New client tracking setup

Use the **New client tracking setup** role skill in XeroFlow AI Chat, or ask an external MCP assistant to call `get_client_tracking_onboarding` for the exact client. The read returns the procedure and safe stored site, mapping and proposal stages, including unbound tracking sites. It never calls Google or returns a write key, script or credential.

## Team onboarding checklist

- Enrol the employee with `tracking_plan`, current client access and signed `mcp:write` for proposals. The published role skill is attached to MEDIA_BUYING and MARKETING_MANAGEMENT; its actual tool availability remains a separate gate. Assigning the skill never grants tools, provider access or permission groups.
- Connect their own MCP login and refresh the host catalog. Confirm `get_client_tracking_onboarding`, ownership recording, binding/installation/publish proposal tools and status are available. Use their own identity, not the owner's tool preview.
- Teach the staff member to identify exact host/platform/form endpoint, accepted-enquiry conversion owner, browser requirement, consent owner, existing hooks and current source/documentary evidence. Native DriveAgent enquiries retain native server conversion delivery; this installer is withheld for them.
- Identify the independent reviewer. A first connection mapping specifically requires an independent owner/admin. Later supported tracking changes retain the existing independently authorised review workflow.
- Walk through a client-authorised setup and record the actual OAuth/container permissions, proposal hashes, exact version and live-host evidence. Do not generate a fake enquiry for proof.

## New client sequence

1. Call `get_client_tracking_onboarding` with `clientId`. If there are no active sites, an authorised operator creates the site in `/agency/tracking`. Site creation is not an MCP operation in this workflow.
2. An owner/admin completes Google GTM OAuth in that screen. The operator provides the non-secret connection UUID and exact `accounts/<account>/containers/<container>` path. An MCP login does not replace Google OAuth; staff cannot enumerate unassigned identities or containers. The website must already load its intended GTM container; adding that loader may require its website operator.
3. Record exact ownership and consent using `record_gtm_tracking_ownership`. Disclose unavailable or stale graph/wiki evidence. Inspect the external backend and existing provider hooks; avoid overlapping accepted-lead senders.
4. For an unbound site, call `propose_gtm_container_binding` with `initialMapping: true`, `siteId`, `ownershipEvidenceId`, `connectionId` and `containerPath`. This creates a local request with no provider reads or effects. It cannot replace an existing mapping. The independent owner/admin reviews the hash and executes it through the GTM review page or authorised review MCP tools. Execution checks Google's exact web container and public host, then inserts the mapping only if it remains eligible and unbound. It does not install or publish tags.
5. Inspect the bound inventory. Call `propose_gtm_xeroflow_installation` for a justified external-site browser requirement. Independent review/execution compiles an isolated version. General arbitrary HTML and JavaScript remain unsupported.
6. Call `propose_gtm_publish` for that exact compiled `sourceProposalId`. Publication is independently reviewed again. Read the result with `get_gtm_change_status`. Changed authority, ownership, live versions and uncertain outcomes can block execution.
7. Verify the exact public host, GTM tag and consent behaviour. Record browser receipt, collector receipt and provider reporting separately. A verified mapping is not a published tag; a tag verified in GTM is not proof it executed in a browser or delivered customer conversions.

Example first-mapping arguments (placeholders only):

```json
{
  "siteId": "<authorised tracking-site UUID>",
  "ownershipEvidenceId": "<current ownership evidence UUID>",
  "connectionId": "<operator-provided GTM connection UUID>",
  "containerPath": "accounts/<account>/containers/<container>",
  "initialMapping": true
}
```

## Status and evidence

The guide exposes stored progress such as `site_setup_needed`, `ownership_evidence_needed`, `proposal_expired`, `connection_needed`, `awaiting_mapping_approval`, `ready_to_execute_mapping`, `ready_to_install`, `awaiting_installation_approval`, `awaiting_publication`, `awaiting_publish_approval` and `tag_verified_in_gtm`. Executing/unknown operations need inspection and cannot be retried blindly. `native_server_route` directs the operator to the native delivery path. Reads are bounded to 100 authorised active sites and disclose truncation.

The response labels its evidence as stored configuration/proposal status, with conversion delivery unverified. Refresh provider/live-host evidence before claiming current acceptance. No employee enrollment, Google OAuth or customer-event acceptance is established by source tests.

## Source and documentation freshness

Implementation base: `f3234eabc` (19 November 2026). Canonical companion guides are [staff MCP](marketing-staff-mcp.md), [reviewed tracking operations](marketing-ads-tracking-review.md) and [Persona tracking](../persona-360-tracking-guide.md). The dashboard does not contain the native DriveAgent tracking architecture/claims guides; inspect them in the target website repository for any dealer-specific task.

No `graphify-out` checkout was present. `docs/graphify.md` describes a July graph snapshot and is not evidence of this workflow. GitHub wiki discovery returned Repository not found; its revision and contents could not be verified. Generated graph/wiki descriptions of staff first-mapping restrictions may be stale. No dealer/container was selected or changed for this implementation.

## Operator handoff without changing the binding

An owner/admin can obtain the non-secret identifiers through existing read-only owner MCP tools (`list_gtm_connections`, `list_gtm_accounts`, `list_gtm_containers`). Share only the selected connection `id` and container `path` with the requester. These tools do not create the mapping. An owner/admin using the authenticated application can also read:

- `GET /api/agency/tracking/gtm/connections` → selected `connections[].id`.
- `GET /api/agency/tracking/gtm/accounts?connectionId=<id>` → selected `accounts[].path`.
- `GET /api/agency/tracking/gtm/containers?connectionId=<id>&accountPath=<exact path>` → selected `containers[].path` and `publicId`.

Do not click Link container when the intention is to let staff submit the first-mapping request. Container names/emails and GTM public IDs are not the connection UUID/resource path. Never share OAuth tokens.

A first mapping requires explicit intent even if a sibling site already uses the same Google identity. Ordinary remaps may read only an exact container already mapped to that client; an unproven new target on an existing site remains an owner-reviewed browser task. First mappings reject provider containers declaring domains outside the site's explicit approved origins. Shared containers require a separate owner-managed assessment.

Native chat tracking writes use server-proven authenticated chat provenance and retain their native confirmation flow. A caller-supplied `source: chat` flag does not waive signed MCP write consent. The latest ownership assessment is authoritative: recording a new assessment invalidates older evidence IDs for new/reviewed execution. A previously external installer cannot be published after native DriveAgent ownership is established.

Progress prioritises nonretryable connection holds, then current ownership and connection readiness. It never reveals the operation identity held by another client. Tag verification requires an installation-origin publication on the current binding that is still the latest recorded container change; a generic publication, rollback or verification timestamp is insufficient. A stored tag check remains historical evidence and is not live-host/customer-delivery proof.
