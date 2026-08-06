# workers/audio-jobs/container/Dockerfile
# FFmpeg + Chromium render service for Audio Studio Phase 3 + Video Studio V1.2b.
# Runs as a CF Container bound to the audio-jobs Worker (RENDER binding).
# Stateless HTTP server on :8080.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg chromium fonts-liberation ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
# Puppeteer Core drives the Chromium binary installed above. The Cloudflare
# Browser Rendering package expects a remote browser binding with fetch().
RUN npm install puppeteer-core@25.5.0
COPY server.mjs render.mjs timelineFiltergraph.mjs videoCompositeGraph.mjs frameRuntime.mjs overlayCapture.mjs bannerCapture.mjs ./

EXPOSE 8080
CMD ["node", "server.mjs"]
