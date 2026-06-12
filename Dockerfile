# syntax=docker/dockerfile:1

# Microsoft's Playwright image ships Chromium + every system library it needs,
# plus Node 20 — the reliable base for running Playwright in a container. The tag
# MUST match the playwright version in package.json (1.60.0) so the client
# library and the browser binary agree.
FROM mcr.microsoft.com/playwright:v1.60.0-jammy

WORKDIR /app

# The base image preinstalls browsers under /ms-playwright. Point Playwright at
# them so our postinstall `playwright install chromium` resolves the already
# present (matching) binary instead of re-downloading, and the runtime launch
# uses the same one.
ENV PLAYWRIGHT_BROWSERS_PATH=/ms-playwright
ENV NEXT_TELEMETRY_DISABLED=1

# Install deps first for Docker layer caching. --include=dev keeps the build
# toolchain (typescript, tailwind) regardless of the image's NODE_ENV.
COPY package.json package-lock.json ./
RUN npm ci --include=dev

# Build the Next.js app. validateEnv() short-circuits during the build phase
# (NEXT_PHASE=phase-production-build), so no runtime secrets are needed here.
COPY . .
RUN npm run build

ENV NODE_ENV=production
EXPOSE 3000
# `next start` honors Render's injected $PORT and binds 0.0.0.0.
CMD ["npm", "start"]
