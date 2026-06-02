# workers/audio-jobs/container/Dockerfile
# FFmpeg render service for Audio Studio Phase 3. Runs as a CF Container bound to
# the audio-jobs Worker (RENDER binding). Stateless HTTP server on :8080.
FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY server.mjs render.mjs timelineFiltergraph.mjs ./

EXPOSE 8080
CMD ["node", "server.mjs"]
