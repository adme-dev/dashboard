# Social image recomposition

Use the existing Qwen image editor from a saved, editable social draft. Select an attached image, choose portrait (4:5), square (1:1) or story (9:16), optionally add instructions, generate a new asset, inspect both versions, then explicitly use the new version. Saving remains separate and invalidates existing approval through the existing composer flow. Published posts remain locked.

Use existing semantic Nuxt UI colours and typography. A wide comparison modal gives the artwork most of the space; format and instruction fields precede the comparison. Mobile stacks original and result. Primary actions describe their effect: Generate preview, Use this version, Keep original. The original URL is retained in composer metadata and the stored asset is never overwritten.

Backend accepts saved post ID and source URL, authorises the post's client, verifies the source is attached to that post, and resolves only owned first-party R2 assets. Do not fetch arbitrary URLs. Output is validated by content signature, stored as a new client asset using signed delivery, and logged to the AI invocation ledger. Generation does not update, approve or publish the post.

First fix the existing provider's outdated Gradio Gallery payload and result extraction against the published provider API schema. Bound all output downloads and reject redirected or foreign output URLs. Test client access, attached-source verification, published locks and output validation before exposing the UI.

Presets use model-compatible dimensions at or above standard feed resolution: 1152×1440, 1152×1152, 1152×2048. Explain these are target sizes; compare actual returned dimensions before accepting. AI can alter lettering and product details; require a visual review of copy, logos and vehicle details, without claiming lossless generation.

Verification: focused provider/endpoint tests, lint, production build/deployment guard, live Safari generation and preview with one held DriveAgent image. Record unavailable-provider or quota failures accurately; never substitute a simple crop and call it AI.
