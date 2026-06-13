# Phase 5 - embed the VEX document(s) into the image filesystem at build
# time, per the Docker "Hardened Images Are Free. Now What?" pattern.
# Build context = trivy-vex-demo root:
#   docker build -f embed/Dockerfile -t pingaccess-vex:8.3.4-edge-demo .
FROM pingidentity/pingaccess:8.3.4-edge

COPY vex/pingaccess-8.3.4-edge.openvex.json /usr/share/vex/pingaccess-8.3.4-edge.openvex.json
