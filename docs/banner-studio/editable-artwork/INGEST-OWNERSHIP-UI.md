# Dissector ownership and physical context UI

Implemented in the original shared `banner-editable-artwork` workspace on
28 October 2026. This document records the UI contract and local verification;
the coordinator owns server integration and release acceptance.

## Ownership and request context

The modal captures `state.project.id` and `state.project.clientId` when opened.
An ID or client change, including an in-place client reassignment, synchronously
invalidates pending operations and clears the selected job, history, findings,
file preview, format choice, layer overrides and physical-size selection. New
history requests use the new context; an old response cannot attach to it.
Replacing the project object without changing its IDs does not recapture the
reviewed revision/canvas and authorize an import implicitly.

- History: `GET /api/agency/banner-studio/dissect/history` with optional
  `query: { projectId, clientId }`. History summaries need not contain findings.
- Upload: multipart `file`, optional `brand`, captured `projectId` and `clientId`
  when present. A forbidden project/client request is never retried as personal.
- Saved project, client-scoped and explicit physical-size uploads accept PNG.
  JPEG/WebP remain available for unsaved personal uploads with unknown physical
  size. Client MIME checks are usability checks; server byte validation remains
  authoritative.
- Optional `physical` is JSON `{ preset: 'A4', orientation: 'portrait' | 'landscape' }`.
  The default is Unknown and omits this field. The UI never infers A4 or DPI from
  pixel dimensions. A4 selection does not alter the pixel dimensions.

## Snapshot fields

Only the `DissectionJob` interface portion of `app/types/banner-studio.ts` changed:

```ts
source?: {
  width: number
  height: number
  mimeType: string
  byteLength: number
  sha256: string
}
ingestion?: {
  ownerKind: 'user' | 'client' | 'project'
  projectId?: string
  clientId?: string
  physical: null | {
    preset: 'A4'
    orientation: 'portrait' | 'landscape'
    unit: 'mm'
    widthMm: number
    heightMm: number
  }
}
```

The UI treats absent ingestion metadata as a legacy personal job, never as
permission to import into a client project. Detail snapshots supply verified
source dimensions; history can remain a sanitized summary.

## Access, retry and import invariants

401/403/404 from history, detail, upload, cancel, retry, recovery read or import
clear the current job and history, remove findings and selected file, invalidate
pending requests, and block import. A transient refresh failure may preserve
review findings but always removes import eligibility until a successful refresh.
An empty refreshed history removes the cached selection. Access failure leaves
the captured ownership context intact rather than falling back to personal.

Retry continues to send the reviewed `expectedAttemptId`. A lost retry response
causes one saved-state read and never an automatic POST replay. Cancellation
remains latched unless a newer accepted generation is observed. Old-session
responses cannot apply to a reopened modal or another project/client.

| Source owner | Existing-project import | Create new project |
| --- | --- | --- |
| Project | Captured original project, with matching client context | Disabled |
| Client | Same captured client | Same client; sends `clientId` assertion |
| User / legacy | Personal project only | Personal context only |

Existing imports still require the reviewed saved revision, unchanged editor
canvas and clean/non-saving state. Result identity and receipt validation remain
required. A receipt produces at most one local apply/navigation, and canvas
replacement is wrapped in one undo action.

Verified source pixels take precedence over model-reported `banner_size`. An
exact preset is reused when available; otherwise `resolveBannerFormat` resolves
`custom_WxH`, such as `custom_2480x3508`. Verified-source format options contain
only that exact size. Unsupported dimensions disable import rather than choosing
a nearby preset. Physical metadata does not establish print or ICC acceptance.

Protected `/api/agency/banner-studio/dissect/{jobId}/assets/{assetId}` locators
remain unchanged in returned layers and the local canvas apply. The modal does
not flatten artwork or write thumbnails. Read-only inspection of the existing
`useBannerStudio.saveProject` path found a PATCH of canvas/name/revision without
client thumbnail generation; server storage and delivery remain integration gates.

Scoped import receipts must also include
`dissectionSource: { jobId, sourceSha256 }`. The modal validates the job ID and
hash shape (and equality with verified source SHA-256 when available), then
retains this marker on the imported format in the same one-undo canvas apply,
including text-only artwork. Missing or mismatched scoped provenance blocks the
local apply/navigation. `getCanvasData` and `restoreCanvasData` already deep-copy
whole formats, preserving the marker. The coordinator owns the corresponding
`ArtboardState` type addition and export/server enforcement.

## Local verification and remaining gates

Node `v24.18.0`:

```sh
pnpm exec vitest run test/banner/dissectionJobControls.test.ts test/banner/dissectionImportControls.test.ts
pnpm exec eslint app/components/banner/DissectorModal.client.vue app/composables/useBannerDissectionJob.ts test/banner/dissectionJobControls.test.ts test/banner/dissectionImportControls.test.ts
```

The initial regression run reproduced six failures: stale findings after
401/403/404, a stale detail request on scope change, stale modal findings after
a project switch, and verified 2480×3508 pixels being sent as `mrec`. The final
focused suite contains 59 passing tests, including context races, client
reassignment, upload fields, MIME restrictions, access revocation during retry
recovery, exact custom canvas apply, protected locator retention and one-undo
receipt behavior. Four further red regressions reproduced text-only marker loss
and accepting missing/mismatched scoped provenance before that integration fix.
Targeted ESLint passes.

These are composable and happy-dom component tests with stubbed Nuxt controls
and APIs. They do not establish real browser layout/accessibility, authenticated
server authorization, protected asset delivery, provider processing or hosted
release acceptance. Coordinator integration must validate the matching server
contract, same-owner import/create behavior, protected save/thumbnail handling
and live access revocation. No server, export-modal, sibling, deployment,
provider, Git or migration changes were made by this UI task.
