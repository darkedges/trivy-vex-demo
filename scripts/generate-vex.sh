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
# PRODUCT_OCI_DIGEST is set by the run script from the currently-pulled image
# digest so the PURL always matches the image being scanned, even after a
# Docker Hub update. Falls back to the original demo digest if unset.
DIGEST="${PRODUCT_OCI_DIGEST:-sha256:01e8aaf19f70857ae6b585c72750bf38c7bcc32e007a044549272346981efbd5}"
# Scout derives its product PURL as pkg:oci/<org>/<name>@sha256:<digest>
# (confirmed via: docker scout sbom IMAGE --format cyclonedx | jq .metadata.component.purl)
# The name must include the org prefix (pingidentity/pingaccess), not just the image
# name (pingaccess). Qualifiers (repository_url, tag) are not required for matching.
# Trivy matches on digest and accepts any name, so this form works for both.
PRODUCT_OCI="pkg:oci/pingidentity/pingaccess@${DIGEST}"
echo "pkg:oci digest: ${DIGEST}"

# pkg:docker PURL — repo/name@tag form expected by Docker Scout.
# Scout does NOT match pkg:oci; use this for Scout attestation path.
PRODUCT_DOCKER="pkg:docker/pingidentity/pingaccess@8.3.4-edge"

AUTHOR="DarkEdges Security <nirving@darkedges.com>"
NOTE="DEMO assessment generated for a CVE-suppression-workflow POC. This is NOT a real exploitability analysis; do not rely on it for risk decisions."

# inject_subcomponents <file> <cve-id>
# Adds the affected package PURLs from the baseline scan as subcomponents.
# Docker Scout --vex-location requires subcomponents to correlate a VEX
# statement to a specific package in the image SBOM; without them Scout
# silently skips the statement. Trivy matches on image digest and doesn't
# require them, so this field is harmless for the Trivy/Wiz channel.
inject_subcomponents() {
  local file="$1" vuln="$2" subs
  subs=$(jq -c --arg v "$vuln" \
    '[.Results[].Vulnerabilities[]? | select(.VulnerabilityID == $v)
       | .PkgIdentifier.PURL // empty] | unique | map({"@id": .})' \
    /work/baseline-report.json 2>/dev/null) || return 0
  if echo "$subs" | jq -e 'length > 0' >/dev/null 2>&1; then
    jq --argjson subs "$subs" \
      '.statements[0].products[0] += {"subcomponents": $subs}' \
      "$file" > /tmp/vex_sc.json && mv /tmp/vex_sc.json "$file"
  fi
}

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
  inject_subcomponents "$OUT/${VULN}.openvex.json" "$VULN"
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
  inject_subcomponents "$OUT_SCOUT/${VULN}.vex.json" "$VULN"
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

# ── Phase 3c: pkg:docker statements for local demo registry (localhost:5000) ──
# Scout resolves the image PURL from its fully-qualified registry hostname.
# Statements using pkg:docker/pingidentity/... (Docker Hub) will NOT match an
# image pushed to localhost:5000. Generate a separate set with the local prefix
# so attestations attached to the demo registry actually suppress CVEs.
PRODUCT_DOCKER_LOCAL="pkg:docker/localhost:5000/pingidentity/pingaccess@8.3.4-edge"
OUT_SCOUT_LOCAL=/work/vex/statements-scout-local
mkdir -p "$OUT_SCOUT_LOCAL"

jq -r '[.Results[].Vulnerabilities[]?.VulnerabilityID] | unique | .[]' \
    /work/baseline-report.json | while read -r VULN; do
  vexctl create \
    --product="$PRODUCT_DOCKER_LOCAL" \
    --vuln="$VULN" \
    --status="not_affected" \
    --justification="vulnerable_code_not_in_execute_path" \
    --status-note="$NOTE" \
    --author="$AUTHOR" \
    --id="https://darkedges.com/vex/demo/pingaccess/scout-local/${VULN}" \
    --file="$OUT_SCOUT_LOCAL/${VULN}.vex.json" 2>/dev/null
  inject_subcomponents "$OUT_SCOUT_LOCAL/${VULN}.vex.json" "$VULN"
  echo "created $OUT_SCOUT_LOCAL/${VULN}.vex.json"
done

# Consolidated pkg:docker/localhost:5000 document
vexctl merge \
  --author="$AUTHOR" \
  --id="https://darkedges.com/vex/demo/pingaccess/scout-local-consolidated" \
  "$OUT_SCOUT_LOCAL"/*.vex.json \
  | jq . > /work/vex/pingaccess-scout-local.vex.json

echo "merged -> /work/vex/pingaccess-scout-local.vex.json (Scout / local registry)"
jq '.statements | length' /work/vex/pingaccess-scout-local.vex.json

# ── Phase 3d: pkg:docker statements for configurable Docker Hub target ────────
# Generates VEX for a Docker Hub image in a different org/repo from the upstream
# source. Required because Scout includes the registry hostname in its PURL, so
# darkedges/pingaccess and pingidentity/pingaccess are distinct products (Gotcha 7).
# Set PRODUCT_DOCKER_HUB to override the default target; run.sh passes it from
# the HUB_IMAGE variable at the top of the script.
PRODUCT_DOCKER_HUB="${PRODUCT_DOCKER_HUB:-pkg:docker/darkedges/pingaccess@8.3.4-hi}"
OUT_SCOUT_HUB=/work/vex/statements-scout-darkedges
mkdir -p "$OUT_SCOUT_HUB"

jq -r '[.Results[].Vulnerabilities[]?.VulnerabilityID] | unique | .[]' \
    /work/baseline-report.json | while read -r VULN; do
  vexctl create \
    --product="$PRODUCT_DOCKER_HUB" \
    --vuln="$VULN" \
    --status="not_affected" \
    --justification="vulnerable_code_not_in_execute_path" \
    --status-note="$NOTE" \
    --author="$AUTHOR" \
    --id="https://darkedges.com/vex/demo/pingaccess/scout-darkedges/${VULN}" \
    --file="$OUT_SCOUT_HUB/${VULN}.vex.json" 2>/dev/null
  inject_subcomponents "$OUT_SCOUT_HUB/${VULN}.vex.json" "$VULN"
  echo "created $OUT_SCOUT_HUB/${VULN}.vex.json"
done

# Consolidated pkg:docker/darkedges document
vexctl merge \
  --author="$AUTHOR" \
  --id="https://darkedges.com/vex/demo/pingaccess/scout-darkedges-consolidated" \
  "$OUT_SCOUT_HUB"/*.vex.json \
  | jq . > /work/vex/pingaccess-scout-darkedges.vex.json

echo "merged -> /work/vex/pingaccess-scout-darkedges.vex.json (Scout / Docker Hub ${PRODUCT_DOCKER_HUB})"
jq '.statements | length' /work/vex/pingaccess-scout-darkedges.vex.json
