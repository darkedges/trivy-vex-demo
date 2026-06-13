# VEX/Trivy toolchain container
# Versions verified 2026-06-13:
#   Trivy        v0.71.0 (latest, released 2026-06-01)
#   vexctl       v0.4.1  (latest, released 2025-10-02)
#   Docker Scout latest  (auto-detected from GitHub API at build time)
#   docker-cli   from Alpine packages (needed for Scout plugin)
FROM alpine:latest

ARG TRIVY_VERSION=0.71.0
ARG VEXCTL_VERSION=0.4.1

RUN apk update && apk upgrade --no-cache && \
    apk add --no-cache ca-certificates curl jq docker-cli

# Trivy — official release tarball from aquasecurity/trivy
RUN curl -fsSL -o /tmp/trivy.tar.gz \
      "https://github.com/aquasecurity/trivy/releases/download/v${TRIVY_VERSION}/trivy_${TRIVY_VERSION}_Linux-64bit.tar.gz" && \
    tar -xzf /tmp/trivy.tar.gz -C /usr/local/bin trivy && \
    rm /tmp/trivy.tar.gz && \
    chmod +x /usr/local/bin/trivy

# vexctl — official release binary from openvex/vexctl
RUN curl -fsSL -o /usr/local/bin/vexctl \
      "https://github.com/openvex/vexctl/releases/download/v${VEXCTL_VERSION}/vexctl-linux-amd64" && \
    chmod +x /usr/local/bin/vexctl

# Docker Scout CLI — download latest release directly to the system-wide plugin path.
# install.sh targets $HOME/.docker/cli-plugins which is unreliable in Alpine containers
# because $HOME may not be set at runtime; /usr/local/lib/docker/cli-plugins is always
# in docker-cli's search path regardless of $HOME or DOCKER_CONFIG.
RUN ARCH=$(uname -m | sed 's/x86_64/amd64/;s/aarch64/arm64/') && \
    SCOUT_VER=$(curl -fsSL "https://api.github.com/repos/docker/scout-cli/releases/latest" | \
      jq -r '.tag_name | ltrimstr("v")') && \
    mkdir -p /usr/local/lib/docker/cli-plugins && \
    curl -fsSL \
      "https://github.com/docker/scout-cli/releases/download/v${SCOUT_VER}/docker-scout_${SCOUT_VER}_linux_${ARCH}.tar.gz" \
      -o /tmp/scout.tar.gz && \
    tar -xzf /tmp/scout.tar.gz -C /usr/local/lib/docker/cli-plugins docker-scout && \
    chmod +x /usr/local/lib/docker/cli-plugins/docker-scout && \
    rm /tmp/scout.tar.gz

WORKDIR /work
ENTRYPOINT []
CMD ["/bin/sh"]
