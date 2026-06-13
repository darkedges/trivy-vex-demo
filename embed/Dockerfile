# Phase 5d (fallback) — embed VEX documents into the image filesystem.
# Build context = trivy-vex-demo root:
#   docker build -f embed/Dockerfile -t pingaccess-vex:8.3.4-edge-demo .
#
# IMPORTANT — attestation-vs-filesystem mutex rule:
#   If the image has ANY attestation (including provenance auto-added by
#   BuildKit), Docker Scout ignores filesystem VEX entirely and reads
#   ONLY attestations. To keep the filesystem path active, you MUST build
#   with both disabled:
#     docker build --provenance=false --sbom=false ...
#   This Dockerfile does NOT pass those flags; callers must add them.
#
# For the primary Scout path, use docker scout attestation add instead
# (see run.sh steps 10-11 / README "Three distribution channels").
FROM pingidentity/pingaccess:8.3.4-edge

# pkg:oci document — Trivy/Wiz consumers extract and pass via --vex
COPY vex/pingaccess-8.3.4-edge.openvex.json /usr/share/vex/pingaccess-8.3.4-edge.openvex.json

# pkg:docker document — matches Scout's *.vex.json glob (filesystem fallback only)
COPY vex/pingaccess-scout.vex.json /usr/share/vex/pingaccess-scout.vex.json
