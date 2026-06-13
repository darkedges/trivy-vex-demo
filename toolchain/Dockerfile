# VEX/Trivy toolchain container
# Versions verified 2026-06-13:
#   Trivy  v0.71.0 (latest, released 2026-06-01)
#   vexctl v0.4.1  (latest, released 2025-10-02)
FROM alpine:latest

ARG TRIVY_VERSION=0.71.0
ARG VEXCTL_VERSION=0.4.1

RUN apk update && apk upgrade --no-cache && \
    apk add --no-cache ca-certificates curl jq

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

WORKDIR /work
ENTRYPOINT []
CMD ["/bin/sh"]
