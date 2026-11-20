# workers/audio-jobs/container/Dockerfile
# FFmpeg + Chromium render service for Audio Studio Phase 3 + Video Studio V1.2b.
# Runs as a CF Container bound to the audio-jobs Worker (RENDER binding).
# Stateless HTTP server on :8080.
# Pinned by digest (2026-11-19) so CI's media tests and production renders use the identical base and
# Debian bookworm ffmpeg (5.1.x). CI builds THIS file and runs the real-ffmpeg tests against it
# (.github/workflows/ci.yml → media-render job). Bump deliberately; CI will re-verify.
FROM node:22-bookworm-slim@sha256:e9f565d32859f0cbfb52125eafe8be39390f24dac302dc3cdf566e8ba3ab21ee

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg chromium fonts-liberation ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# Puppeteer Core drives the Chromium binary installed above. The Cloudflare
# Browser Rendering package expects a remote browser binding with fetch().
RUN npm install puppeteer-core@25.5.0 pngjs@7.0.0
COPY copyMeasurement.mjs mediaProbe.mjs server.mjs render.mjs timelineFiltergraph.mjs videoCompositeGraph.mjs reelmotionBaseGraph.mjs frameRuntime.mjs overlayCapture.mjs bannerCapture.mjs bannerAudioDownload.mjs bannerAudioRender.mjs ./

EXPOSE 8080
CMD ["node", "server.mjs"]
