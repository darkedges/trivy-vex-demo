#!/bin/sh
# Phase 3 - generate one OpenVEX statement per CVE found in the baseline
# scan, then merge them into a single consolidated document.
# Runs inside the vex-toolchain container with /work = trivy-vex-demo.
set -eu

# Image digest purl (digest, NOT tag). Qualifiers deliberately omitted so
# Trivy matches regardless of arch/repository_url qualifiers.
PRODUCT="pkg:oci/pingaccess@sha256:51689e8ccf1ec6bef28c855a2f2fafdd3556f753609adad2e258580e3bc9397c"
AUTHOR="DarkEdges Security <nirving@darkedges.com>"
NOTE="DEMO assessment generated for a CVE-suppression-workflow POC. This is NOT a real exploitability analysis; do not rely on it for risk decisions."

OUT=/work/vex/statements
mkdir -p "$OUT"

jq -r '[.Results[].Vulnerabilities[]?.VulnerabilityID] | unique | .[]' \
    /work/baseline-report.json | while read -r VULN; do
  vexctl create \
    --product="$PRODUCT" \
    --vuln="$VULN" \
    --status="not_affected" \
    --justification="vulnerable_code_not_in_execute_path" \
    --status-note="$NOTE" \
    --author="$AUTHOR" \
    --id="https://darkedges.com/vex/demo/pingaccess/${VULN}" \
    --file="$OUT/${VULN}.openvex.json" 2>/dev/null
  echo "created $OUT/${VULN}.openvex.json"
done

# Consolidated document (individual files are kept)
vexctl merge \
  --author="$AUTHOR" \
  --id="https://darkedges.com/vex/demo/pingaccess/consolidated" \
  "$OUT"/*.openvex.json \
  | jq . > /work/vex/pingaccess-8.3.4-edge.openvex.json

echo "merged -> /work/vex/pingaccess-8.3.4-edge.openvex.json"
jq '.statements | length' /work/vex/pingaccess-8.3.4-edge.openvex.json
