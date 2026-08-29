# Board Files Library Design

## Outcome

Every XeroFlow board gains a Files view beside Table, Kanban, Timeline, Calendar, List, and Gallery. The view is the board's document library: users can upload board-wide reference material and can discover task attachments without opening tasks one by one.

The feature keeps ownership explicit. Board documents remain board-owned. Task evidence remains task-owned and is only aggregated into the board view. No file is copied between those scopes.

## User experience

- Add a `Files` entry to the existing board view switcher and persist it in the `?view=files` route state.
- The Files view shows a concise summary of board documents and task evidence, a search field, scope and category filters, and a responsive file table.
- Each row shows the file name, scope, related task when applicable, category/source, uploader, size, and upload date.
- Board documents can be downloaded and deleted from the Files view. Task attachments link back to their task and are managed from that task's Files section.
- An `Upload board file` action opens a Nuxt UI modal. The form uses `UFormField`, `UInput type="file"`, `USelect`, and `UTextarea` and explains that the upload is visible across the whole board.
- Loading, error, empty-search, and empty-library states are distinct. All actions have visible labels or accessible tooltips and work in dark mode.

## Data model

Create `board_files` with:

- `id`, `department_id`, `uploaded_by`
- `file_name`, `file_url`, `file_type`, `file_size`, `storage_key`
- `category`: `reference`, `policy`, `template`, or `other`
- optional `description`
- `source`: initially `xeroflow`, with room for `monday` and `xero`
- optional `source_reference`
- `checksum_sha256`
- `created_at`, `updated_at`

The board and checksum pair is unique. Re-uploading identical content to the same board returns a conflict instead of creating duplicate records. The same file may exist on two different boards.

Task files are read from `task_attachments` joined through `tasks.department_id`. A Monday file mapping, when present, labels the source as Monday; otherwise the source is the task. Task attachments do not move into `board_files`.

## Server interfaces

### `GET /api/agency/boards/:id/files`

Accept a UUID or slug, require board access, and return:

```ts
interface BoardFileListResponse {
  files: BoardFileItem[]
  summary: {
    total: number
    boardDocuments: number
    taskEvidence: number
  }
}
```

`BoardFileItem` uses camelCase and includes `scope: 'board' | 'task'`, the task identity when applicable, uploader identity, source, category, and a download URL. Board-file download URLs point to an authenticated download endpoint; task attachments use their current stored URL.

### `POST /api/agency/boards/:id/files`

Require write and board access, accept multipart form data with one `file`, `category`, and optional `description`, validate against the existing attachment MIME and 50 MB limits, reject duplicate content, upload through the existing storage utility, and insert the board record.

If the database insert fails after storage succeeds, delete the just-uploaded object so an orphan is not left behind.

### `GET /api/agency/boards/:id/files/:fileId/download`

Require board access and verify that the file belongs to the board. Redirect to a short-lived signed R2 URL, the configured public URL, or the stored local-development URL.

### `DELETE /api/agency/boards/:id/files/:fileId`

Require write and board access. Owners and admins may delete any board file; other users may delete files they uploaded. Delete the database record first, then remove the storage object. Storage cleanup failure is logged without restoring a database record that users can no longer manage.

## Security and integrity

- Every route performs server-side board authorization; filtering is never treated as authorization.
- User-supplied names and descriptions are stored as data and rendered by Vue, not injected as HTML.
- Uploads reuse the central MIME and size allowlists and generate server-owned storage keys.
- The SHA-256 checksum is calculated from bytes on the server.
- Downloads never accept a caller-supplied storage key or URL.
- Task files are only returned after access to their parent board is established.

## Marketing synchronization

Update the public Boards feature card and detailed Boards feature entry to describe the sixth connected board view and its board-wide searchable file library. The existing Work Management mega-menu already links to Boards, so its structure does not need a new top-level item.

## Verification

- Route tests cover authorization calls, aggregation, Monday provenance, duplicate rejection, validation, rollback cleanup, ownership-based deletion, and board-scoped download resolution.
- Component tests cover file filtering, upload payloads, error states, and task navigation.
- Existing board view tests confirm `files` is accepted and appears in the switcher.
- Run the focused Vitest files, the full Vitest suite, typecheck (reporting known baseline failures separately), production build, and browser checks at mobile and desktop widths.

## Deliberate exclusions

- No folder hierarchy, versioning workflow, bulk ZIP download, or OCR in this increment.
- No automatic upload of board documents into Monday or Xero. Monday task attachments are surfaced from their existing imported records.
- No task-attachment deletion from the board-wide view; it stays in task context to preserve evidence ownership.
