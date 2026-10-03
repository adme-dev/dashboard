# Prepare an existing video for social publishing

1. Open Video Studio and create an AV project for the intended client. Reuse saved campaign settings where appropriate; review the campaign and social caption brief.
2. Choose **Footage**, then select the finished MP4, WebM or MOV. The upload stores the original bytes and registers the video in the library with the client and project. Browser-reported dimensions and duration are validated; older upload clients can omit them.
3. Select the uploaded video in the library and choose **Create social draft**. This hands the original file to Compose without rendering it again, retaining its dimensions and audio. Creating the draft can generate a caption from the saved social brief; review the resulting copy.
4. Review the client, campaign, networks, caption, media and destination link. **Save draft** works before account onboarding is complete. Approval, queue and scheduling actions still require selected publishing accounts.
5. Connect the intended client's social account and complete the normal approval/scheduling workflow. A different client's account must not be used as a substitute.

The editing timeline defaults to its own render format and muted footage audio. An original-file social draft preserves the uploaded file; rendering the timeline is a separate editing operation. Current render profiles are 9:16, 1:1 and 16:9, so use the original-file handoff for an approved 4:5 video.

New uploads are registered automatically. Existing uploads made before this release are not backfilled. Upload execution uses the existing God-mode ledger; if an upload reports a possibly-applied failure, inspect the library before starting a new attempt.

Upload access follows the project creator/admin/owner and client access checks. Registration also checks for project reassignment after storage dispatch. Video metadata never authorizes client access or determines file storage keys.

Regression coverage: `test/server/api/mediaUploadLibrary.test.ts` and `test/app/socialComposerDraftWithoutAccount.test.ts`.

## Caption failure recovery

Video Studio retains the media and campaign in a draft if the caption provider fails, returns empty copy, or returns its failure sentinel. Post copy stays empty; production instructions and provider errors are never substituted. Compose's **Write with AI** rejects unusable output and preserves the existing copy. Add approved copy before requesting review.

The 3 October investigation found the routed `openai/gpt-oss-20b` caption request used all 400 completion tokens without visible output. A reasoning-budget limit is the likely cause; the old ledger did not retain finish reasons, so the historical truncation cannot be confirmed. The three social caption routes now allow 1,200 completion tokens. Groq telemetry records empty visible output as `error` / `empty_completion`, preserves measured usage, and includes the finish reason without storing reasoning or caption text. No automatic retry is added for empty output.

Regression coverage: `test/social/videoStudioDraft.test.ts`, `test/server/api/socialCaptionFailure.test.ts`, and `test/server/utils/groqEmptyCompletion.test.ts`.

Verification on 3 October: 1,346 focused tests passed (208 files). The full suite had 15,341 passed, 1,608 skipped and three failures. All three reproduced on unchanged source `5473491ac`: `godModeGateInventory.test.ts` (frozen gate inventory), `godModeIsolationInventory.test.ts` (mechanical route inventory), and `videoGenerationForm.test.ts` (model-mode filter expectation). New caption tests/helpers and marketing copy lint clean; edited legacy files add no lint diagnostics.
