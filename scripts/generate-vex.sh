#!/bin/sh
# Phase 3 - generate one OpenVEX statement per CVE found in the baseline
# scan, then merge into consolidated documents — one per distribution channel.
#
# Two product PURL forms are generated:
#   pkg:oci   — digest-pinned, for Trivy VEX repo and Wiz
#   pkg:docker — tag-based, for Docker Scout attestations
#
# Runs inside the vex-toolchain container with /work = trivy-vex-demo.
set -eu

# pkg:oci PURL — digest, NOT tag. Qualifiers omitted so Trivy matches
# regardless of arch/repository_url qualifiers. Used for Trivy + Wiz.
PRODUCT_OCI="pkg:oci/pingaccess@sha256:51689e8ccf1ec6bef28c855a2f2fafdd3556f753609adad2e258580e3bc9397c"

# pkg:docker PURL — repo/name@tag form expected by Docker Scout.
# Scout does NOT match pkg:oci; use this for Scout attestation path.
PRODUCT_DOCKER="pkg:docker/pingidentity/pingaccess@8.3.4-edge"

AUTHOR="DarkEdges Security <nirving@darkedges.com>"
NOTE="DEMO assessment generated for a CVE-suppression-workflow POC. This is NOT a real exploitability analysis; do not rely on it for risk decisions."

# ── Phase 3a: pkg:oci statements (Trivy / Wiz channel) ──────────────────────
OUT=/work/vex/statements
mkdir -p "$OUT"

jq -r '[.Results[].Vulnerabilities[]?.VulnerabilityID] | unique | .[]' \
    /work/baseline-report.json | while read -r VULN; do
  vexctl create \
    --product="$PRODUCT_OCI" \
    --vuln="$VULN" \
    --status="not_affected" \
    --justification="vulnerable_code_not_in_execute_path" \
    --status-note="$NOTE" \
    --author="$AUTHOR" \
    --id="https://darkedges.com/vex/demo/pingaccess/${VULN}" \
    --file="$OUT/${VULN}.openvex.json" 2>/dev/null
  echo "created $OUT/${VULN}.openvex.json"
done

# Consolidated pkg:oci document (individual files are kept)
vexctl merge \
  --author="$AUTHOR" \
  --id="https://darkedges.com/vex/demo/pingaccess/consolidated" \
  "$OUT"/*.openvex.json \
  | jq . > /work/vex/pingaccess-8.3.4-edge.openvex.json

echo "merged -> /work/vex/pingaccess-8.3.4-edge.openvex.json (Trivy/Wiz channel)"
jq '.statements | length' /work/vex/pingaccess-8.3.4-edge.openvex.json

# ── Phase 3b: pkg:docker statements (Docker Scout channel) ──────────────────
# Scout expects pkg:docker/<org>/<name>@<tag>, NOT pkg:oci.
# Files use .vex.json extension to match Scout's *.vex.json glob for
# both --vex-location local checks and the filesystem-embed fallback.
OUT_SCOUT=/work/vex/statements-scout
mkdir -p "$OUT_SCOUT"

jq -r '[.Results[].Vulnerabilities[]?.VulnerabilityID] | unique | .[]' \
    /work/baseline-report.json | while read -r VULN; do
  vexctl create \
    --product="$PRODUCT_DOCKER" \
    --vuln="$VULN" \
    --status="not_affected" \
    --justification="vulnerable_code_not_in_execute_path" \
    --status-note="$NOTE" \
    --author="$AUTHOR" \
    --id="https://darkedges.com/vex/demo/pingaccess/scout/${VULN}" \
    --file="$OUT_SCOUT/${VULN}.vex.json" 2>/dev/null
  echo "created $OUT_SCOUT/${VULN}.vex.json"
done

# Consolidated pkg:docker document
vexctl merge \
  --author="$AUTHOR" \
  --id="https://darkedges.com/vex/demo/pingaccess/scout-consolidated" \
  "$OUT_SCOUT"/*.vex.json \
  | jq . > /work/vex/pingaccess-scout.vex.json

echo "merged -> /work/vex/pingaccess-scout.vex.json (Docker Scout channel)"
jq '.statements | length' /work/vex/pingaccess-scout.vex.json
