# Social image recomposition

Use Nano Banana 2 through the existing Cloudflare AI Gateway from a saved, editable social draft. Select an attached image, choose portrait (4:5), square (1:1) or story (9:16), optionally add instructions, generate a new asset, inspect both versions, then explicitly use the new version. Saving remains separate and invalidates existing approval through the existing composer flow. Published posts remain locked.

Use existing semantic Nuxt UI colours and typography. A wide comparison modal gives the artwork most of the space; format and instruction fields precede the comparison. Mobile stacks original and result. Primary actions describe their effect: Generate preview, Use this version, Keep original. The original URL is retained in composer metadata and the stored asset is never overwritten.

Backend accepts saved post ID and source URL, authorises the post's client, verifies the source is attached to that post, and resolves only owned first-party R2 assets. Do not fetch arbitrary URLs. Output is validated by content signature, stored as a new client asset using signed delivery, and logged to the AI invocation ledger. Generation does not update, approve or publish the post.

The Qwen Gradio Gallery payload/parser was repaired, but its real-image smoke test still returned an empty provider error. Use the verified `google/nano-banana-2` gateway model instead, with the original full-resolution image as a data URI and 2K output. Keep the existing gateway spending control and native AI binding. Bound all output downloads and reject redirected or foreign output URLs. Test client access, attached-source verification, published locks and output validation before exposing the UI.

Presets request 4:5, 1:1 or 9:16 at 2K resolution. Show actual returned dimensions and verify the ratio before accepting; save actual dimensions in the recomposition history. AI can alter lettering and product details; require a visual review of copy, logos and vehicle details, without claiming lossless generation.

Verification: focused provider/endpoint tests, lint, production build/deployment guard, live Safari generation and preview with one held DriveAgent image. Record unavailable-provider or quota failures accurately; never substitute a simple crop and call it AI.

Provider reference: https://developers.cloudflare.com/ai/models/google/nano-banana-2/ — `image_input`, `aspect_ratio`, `resolution`; https://developers.cloudflare.com/ai-gateway/usage/worker-binding-methods/ — authenticated native binding and gateway metadata. Full-resolution DriveAgent hero smoke test succeeded on 3 October 2026. Live composer validation follows deployment.
