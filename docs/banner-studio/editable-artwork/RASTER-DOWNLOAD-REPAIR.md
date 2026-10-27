# Raster download handling repair

27 October 2026. Existing single-file PNG/JPG/GIF exports called `window.open` after an asynchronous rendering request and ignored its return value. A blocked popup could therefore show an export-success toast without starting a download. Multi-file exports accepted HTTP error bodies as ZIP entries without checking status, content type or length.

The dialog now fetches the private authenticated export route, rejects non-success responses, unexpected MIME, invalid advertised size and truncated/empty bytes, then downloads the verified Blob through a temporary attached download link. It no longer requires a popup. ZIP entries use the same checks. Rendering options and the filename are captured before asynchronous work, and the existing progress/success/error UI remains in place. Duplicate raster submissions are rejected while a request is active. HTML downloads also benefit from the attached link and delayed object-URL cleanup.

Owned implementation: `app/components/banner/BannerExportModal.client.vue`, `app/utils/bannerRasterExportDownload.ts`, `test/banner/rasterExportDownload.test.ts`. No database, public URL, provider or form-field contract was added. The mandatory frontend-design skill was read from the installed Claude plugin marketplace because the AGENTS.md path is stale; this repair follows the established Nuxt UI dialog and feedback structure.

Local evidence: the new regression failed before the helper existed; nine cases now pass for successful PNG/JPEG/GIF bytes, 401/403/404/503 rejection, wrong media type, empty/truncated bodies and rejected destinations/sizes before fetch. The focused raster/video/error regression passes 15 tests across three files. Scoped ESLint passes after expanding the download cleanup block. Independent review is recorded separately in `RASTER-DOWNLOAD-REVIEW.md`.

This is source and local verification. A Blob handed to the browser is not evidence that the user retained it on disk. Root owns the actual application-button export, captured-byte decoding and hosted authorization checks after release.
