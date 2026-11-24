# TheBrief ZIP preparation service

Private service for the authenticated Banner Studio ZIP endpoint. It returns
prepared editable packages and named design holds; it does not write projects,
upload assets or hold database/storage credentials. Original export scripts are
parsed as bounded literal data and never executed.

## Runtime and limits

- Use Node 22.18+ and the pinned package-manager/dependency versions.
- The container needs FFmpeg, Sharp and the existing TheBrief static converter.
- Two fixed pool IDs, one active request per container, `standard-1` / 4 GiB,
  sleep after 60 seconds. A busy instance returns a retryable status.
- One reusable conversion process per ZIP. The complete archive is validated before
  conversion, and layouts read their verified bytes directly from the ZIP. Each
  size still has a 60-second deadline.
- 64 MiB input; 128 MiB aggregate prepared JSON; 50 designs / 20 sizes per design;
  standard independent child-archive limits. Three-minute preparation deadline,
  four-minute service timeout. Large request/response bodies stream at the edge.
- TheBrief folder and original creation dates require operator confirmation.
  All sizes of an incompatible design are held together.

The Docker-specific ignore file is an allowlist. Do not replace it with the
repository-wide context: source downloads, credentials and unrelated files must
stay outside the image. The image contains the converter, its schema/helpers and
runtime dependencies. It has no public Worker route or `workers.dev` endpoint.

## Release order

1. Fetch current `origin/main`, reconcile the candidate and record the source
   revision. Run the banner/TheBrief and deployment/navigation regression checks.
2. Install the isolated Worker dependencies from this directory with
   `pnpm install --ignore-workspace --frozen-lockfile`. Build the Linux/amd64
   candidate explicitly from the repository root using
   `docker build --platform linux/amd64 -f workers/thebrief-import/container/Dockerfile -t thebrief-import:candidate .`.
   Run the original archive and negative fixtures against that exact image under
   the production memory cap. A Wrangler dry run validates the Worker bundle;
   the digest-pinned configuration does not rebuild the container.
3. Obtain any required approval for uploading this application-source/dependency
   image to the existing Cloudflare account's container registry. Push the tested
   image, record its immutable registry digest and update the configuration's
   pinned `image` digest before the production Worker deploy.
   Do not substitute an untested rebuild or a public registry.
4. Deploy the private Worker using its package's `deploy` script. Keep the fixed
   account, pool bounds and private ingress settings in `wrangler.toml`.
5. From the repository root run `pnpm deploy:check`, then release Pages using
   `pnpm deploy:production` to `agency-dashboard`. The production service binding
   is `THEBRIEF_IMPORT`; environments without it return a clear 503 while prepared
   JSON imports remain usable. Do not use direct Pages Wrangler commands.
   When the existing binding and package schema already support the converter
   change, verify the guard and live caller and release only the private Worker.
   When a change adds optional prepared-package fields, first release and
   verify the compatible Pages caller against the current Worker. Then enable
   the new output on the private Worker so clients can parse it as it rolls out.
6. In the signed-in app, upload the original Alfa ZIP, assign its client/folder,
   acknowledge undated drafts, confirm three designs / six sizes and skip the
   verified existing Traffic draft. Save the other two drafts. Reopen every size,
   compare early/settled/end and transition frames with TheBrief, then check the
   saved compiled proofs, sound and QR/navigation. Record deployment and project
   IDs in the verification record. Keep `import:needs-review` until producer review.
   For a converter-only update, test the original ZIP that prompted the change
   in the live importer and verify that an existing draft is matched by its
   source IDs before any new draft is created.

## Rollback

Restore the previous qualified Pages deployment if the caller fails. Prepared JSON
imports continue without this service. The stateless importer does not alter any
source ZIP, existing draft or uploaded asset; disable its binding or restore its
previous image independently. Do not remove saved drafts as a deployment rollback.

See [the import runbook](../../docs/runbooks/thebrief-banner-import.md) and
[the Alfa qualification record](../../docs/migrations/alfa-direct-zip-import-20261124.md).
