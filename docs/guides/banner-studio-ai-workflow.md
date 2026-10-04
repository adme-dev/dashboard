# Banner Studio: brief to social draft

Updated 4 October 2026. Manual editing and optional **Create with AI** share the same native canvas. The assistant proposes changes; you control which revision is saved and published.

## Everyday workflow

1. Open or duplicate a Banner Studio project and assign the correct client. Keep DriveAgent and DriveAgent News separate. Save the project before using the design assistant.
2. Choose **Create with AI** in the editor toolbar. Add a brief: audience, message, offer, tone, required artwork and anything that must stay unchanged.
3. Enter a request or choose **Edit layout**, **Animate** or **Social variants**. Review the explanation and playable preview. Change the preview format to inspect each proposed artboard.
4. Refine with a follow-up prompt. An unapplied proposal remains the basis for the next request while your original canvas stays unchanged. Choose **Apply** to make one undoable revision or **Discard** to keep the original.
5. Use **Prepare social export** after applying. XeroFlow saves and verifies the project before opening MP4 export. Select the intended format and queue the render.
6. Rendering continues when you close the dialog. Reopen **Export → MP4** to see queued, rendering, ready or failed jobs. Temporary status errors retry without submitting replacements. Eligible failed or stale queued jobs offer Retry render, which redispatches the original job rather than creating a replacement. Running jobs are not manually restarted.
7. Preview the completed video and choose **Create social draft**. Review the proposed caption, select the connected client account, choose the exact time and timezone if scheduling, then use the normal approval and publishing workflow.

The existing November DriveAgent post is a separate scheduled item. Creating or applying a design does not change it.

## Example brief and prompts

**Brief:** Introduce DriveAgent to Australian dealership owners and marketing managers. Use the approved black, white and lime style and existing logo/artwork. Keep the Book a demo CTA and driveagent.io. Avoid invented product capabilities or performance claims.

**First request:** Create a portrait social version with a clearer headline hierarchy. Fade the background in, reveal the headline, then bring in the CTA. Keep the message readable throughout the animation.

**Follow-up:** Make the headline larger, reduce background movement and add matching square and story versions. Suggest a short caption that invites dealership teams to book a demo.

**Another edit:** Keep the logo and CTA unchanged. Add a restrained highlight movement to the background and adjust the headline reveal. Do not replace the supplied vehicle photography.

Native masks, motion paths and supported layer animation can be proposed. Inspect the actual preview: a text reply alone is not proof of a successful effect. Requests for unsupported effects or invalid output leave the original unchanged.

## Model choices and images

| Control | Behaviour |
| --- | --- |
| Automatic | Uses the platform's existing Banner assistant model assignment. The response identifies the actual model. |
| Fast | Workers AI Llama 3.1 8B, with the supported Groq 8B fallback when unavailable. |
| Quality | Groq Llama 3.3 70B. |
| Generate image | Existing image tool, using Recraft V4.1 through Cloudflare AI Gateway for backgrounds and non-vehicle imagery. |

Ordinary design chat edits native layers and reuses authorised assets; it does not regenerate every image. Generated images require a successful quality review before they can be added as an image or artboard-filling background.

The image panel currently displays an estimated **US$0.04 per generation**, excluding inspection and storage charges, based on [Cloudflare's Recraft V4.1 pricing](https://developers.cloudflare.com/ai/models/recraft/recraftv4-1/) checked 4 October 2026. This is an estimate, not a quote for the entire workflow. Removed controls for obsolete guidance, inference-step and seed settings that this provider does not support.

## Context, recovery and limits

- Server-side context comes from the saved project's client, brand kit and authorised assets. The model cannot introduce arbitrary external artwork URLs or executable code.
- Existing locked layers remain protected unless **Allow changes to locked layers** is explicitly enabled.
- Changing the canvas or project/client invalidates the previous proposal. An in-flight response cannot silently overwrite a newer client or design.
- Each applied proposal is one undoable revision, including new formats. Changing projects resets undo history and clipboard data.
- Saving preserves edits made while a previous save is still running. Reloads use fresh project reads.
- Conversation and pending caption/timing suggestions are retained in the current browser tab's session, scoped to their project/client or render job. They are not a cross-device conversation archive. Once a social draft is created, its caption and timing suggestion are saved on the draft.
- The suggested posting time is text for review. Set an exact date, time and timezone in the composer. No new post is automatically scheduled just because a model suggests a time.
- Reopening a draft for an existing render does not overwrite its caption or approval state.
- Social size labels describe shape and dimensions. HTML ad compliance warnings apply to HTML exports rather than confusing the MP4 workflow.

## Implementation and verification

The implementation plan and recorded release results are in `docs/plans/2026-10-04-banner-studio-ai-workflow.md`. Focused tests cover save races, project/client switching, undo, native validation, locked layers, authorised assets, provider failures, animation/export parity, render recovery and draft deduplication. Repository-wide lint has substantial pre-existing failures; release evidence distinguishes focused passing checks from that baseline.
