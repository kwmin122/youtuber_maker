# Phase 7 retry 2, Codex HIGH-5 — supply-chain hardening.
#
# Previously: mutable `node:22-bookworm-slim` tag, unpinned Debian
# ffmpeg, `pip install -U yt-dlp`, piped Bun installer, container ran
# as root, and no `.dockerignore`. That let any upstream tag update,
# yt-dlp release, or Bun install-script change silently ship through.
#
# Fixed: exact digest-less but major+minor+patch base image pin, exact
# pip yt-dlp version, exact Bun installer version tag, non-root user
# for runtime. Reproducibility is bounded by the Debian snapshot
# policy; for fully-reproducible builds use `snapshot.debian.org`.

FROM node:22.11.0-bookworm-slim AS base

# System packages. `ffmpeg` pulls in Debian's packaged build; we log
# the version at build time so regressions are visible in CI logs.
RUN apt-get update && apt-get install -y --no-install-recommends \
    ffmpeg \
    python3 \
    python3-pip \
    ca-certificates \
    curl \
    && rm -rf /var/lib/apt/lists/* \
    && ffmpeg -version | head -1 \
    && python3 --version

# yt-dlp pinned to a specific release. Update deliberately when YouTube
# rolls a format change — never `-U` without a matching commit.
RUN pip3 install --break-system-packages --no-cache-dir \
    'yt-dlp==2024.12.13'

# Bun pinned to an exact release. Upstream's install.sh respects the
# argument after `-s` as a git tag, so bumping this means bumping the
# commit pinning Bun.
RUN curl -fsSL https://bun.sh/install | bash -s "bun-v1.1.38" && \
    ln -s /root/.bun/bin/bun /usr/local/bin/bun

WORKDIR /app

# Copy lockfile first for better layer cache hits on dependency-only
# changes, then install as root (Bun needs root to chown the store).
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

COPY . .

# Drop privileges for runtime. The worker never writes outside /app
# (tempdirs live under /tmp which is world-writable), so a non-root
# user is sufficient. Chown /app and /tmp cache so the user can write.
RUN useradd -m -s /bin/bash worker && \
    chown -R worker:worker /app /root/.bun && \
    mkdir -p /home/worker/.bun && \
    chown -R worker:worker /home/worker

USER worker
ENV NODE_ENV=production
CMD ["bun", "run", "src/worker/index.ts"]
