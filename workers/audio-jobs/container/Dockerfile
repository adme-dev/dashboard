# workers/audio-jobs/container/Dockerfile
# FFmpeg + Chromium render service for Audio Studio Phase 3 + Video Studio V1.2b.
# Runs as a CF Container bound to the audio-jobs Worker (RENDER binding).
# Stateless HTTP server on :8080.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg chromium fonts-liberation ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Skip the npm puppeteer download — Chromium is already installed via apt above.
ENV PUPPETEER_SKIP_DOWNLOAD=1

WORKDIR /app
RUN npm install @cloudflare/puppeteer
COPY server.mjs render.mjs timelineFiltergraph.mjs videoCompositeGraph.mjs overlayCapture.mjs ./

EXPOSE 8080
CMD ["node", "server.mjs"]
