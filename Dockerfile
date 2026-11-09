# syntax=docker/dockerfile:1
# Self-hosted Yodo image (ADR 0007, 0019): Node builds web/dist, Go builds a
# static binary that embeds it, distroless runs it as a non-root user.
# Base images are pinned by digest; bump tag and digest together.

# Builder stages run on the build machine's platform and cross-compile, so a
# multi-arch build needs no emulation.
FROM --platform=$BUILDPLATFORM node:26-alpine@sha256:8996bb5821d62a8fd9bb27c1cb07462f3fdce6e47d640c6a881ead0b064ce216 AS web
WORKDIR /src/web
# Dependencies first, so source edits reuse the cached npm ci layer.
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM --platform=$BUILDPLATFORM golang:1.27@sha256:e519d3b0a5b285e5aa53ab9eef02bc6bbb9cb04608389b743a136a9ce75f0d1e AS server
ARG TARGETOS TARGETARCH
WORKDIR /src/server
COPY server/go.mod server/go.sum ./
RUN go mod download
COPY server/ ./
COPY --from=web /src/web/dist ./internal/webui/dist
RUN CGO_ENABLED=0 GOOS=$TARGETOS GOARCH=$TARGETARCH \
    go build -trimpath -ldflags="-s -w" -o /out/yodo ./cmd/yodo
# Owned by the distroless nonroot user, so a new named volume is writable.
RUN mkdir -p /out/data

FROM gcr.io/distroless/static-debian13:nonroot@sha256:25ac8f0c3b2334a9eb05452266bd4697864a8c8ef0ef71e5e6480d7f92868329
LABEL org.opencontainers.image.source="https://github.com/sonaszjojka/yodo" \
      org.opencontainers.image.description="Yodo: local-first drawing app, self-hosted" \
      org.opencontainers.image.licenses="MIT"
COPY --from=server /out/yodo /usr/local/bin/yodo
COPY --from=server --chown=65532:65532 /out/data /data
# 0.0.0.0 is required for Docker port publishing; limit access with
# -p 127.0.0.1:8080:8080 instead (ADR 0007).
ENV YODO_ADDR=0.0.0.0:8080 \
    YODO_DATA_DIR=/data
EXPOSE 8080
VOLUME /data
USER nonroot:nonroot
ENTRYPOINT ["/usr/local/bin/yodo"]
