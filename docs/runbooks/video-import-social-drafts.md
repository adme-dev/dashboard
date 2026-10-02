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
