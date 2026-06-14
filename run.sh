#!/usr/bin/env bash
# Trivy VEX demo - end-to-end runner (bash / Git Bash / WSL)
# Usage: ./run.sh [-y]   (-y = no pauses)
set -euo pipefail

# Git Bash (MSYS) would otherwise mangle /var/run/docker.sock
export MSYS_NO_PATHCONV=1

# Suppress Docker Scout "new version available" notifications during unattended runs
export DOCKER_CLI_HINTS=false

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
cd "$SCRIPT_DIR"

NO_PAUSE=${1:-}
RED=$'\033[1;31m'; GREEN=$'\033[1;32m'; YELLOW=$'\033[1;33m'
MAGENTA=$'\033[1;35m'; CYAN=$'\033[1;36m'; BOLD=$'\033[1m'; RESET=$'\033[0m'

IMAGE="pingidentity/pingaccess:8.3.4-edge"
DERIVED="pingaccess-vex:8.3.4-edge-demo"
HUB_IMAGE="${HUB_IMAGE:-darkedges/pingaccess:8.3.4-hi}"
HUB_PRODUCT="pkg:docker/${HUB_IMAGE%:*}@${HUB_IMAGE#*:}"
SOCK=(-v /var/run/docker.sock:/var/run/docker.sock)
CACHE=(-v trivy-cache:/root/.cache/trivy)
WORK=(-v "$SCRIPT_DIR:/work")
CONF=(-v "$SCRIPT_DIR/trivy-config:/root/.trivy/vex")

step() { printf '\n%s=== Step %s — %s ===%s\n' "$CYAN" "$1" "$2" "$RESET"; }
ok()   { printf '%s✔ %s%s\n' "$GREEN" "$1" "$RESET"; }
pause() {
  [ "$NO_PAUSE" = "-y" ] && return 0
  printf '%sPress Enter to continue (Ctrl+C to abort)...%s' "$YELLOW" "$RESET"
  read -r _
  clear 2>/dev/null || printf '\033[2J\033[H'
}
counts() { # counts <report.json> -> "findings=N suppressed=M"
  docker run --rm "${WORK[@]}" vex-toolchain:latest \
    jq -r '"findings=\([.Results[].Vulnerabilities[]?] | length) suppressed=\([.Results[].ExperimentalModifiedFindings[]?] | length)"' "/work/$1"
}
show_results() { # show_results <report.json> <label> — color-coded severity breakdown
  local file=$1 label=$2 sev n c
  printf '  %s%s%s\n' "$BOLD" "$label" "$RESET"
  docker run --rm "${WORK[@]}" vex-toolchain:latest jq -r '
    (reduce (.Results[].Vulnerabilities[]?.Severity) as $s
       ({"CRITICAL":0,"HIGH":0,"MEDIUM":0,"LOW":0,"UNKNOWN":0}; .[$s] += 1)
     | to_entries[] | select(.key != "UNKNOWN" or .value > 0)
     | "\(.key) \(.value)"),
    "SUPPRESSED \([.Results[].ExperimentalModifiedFindings[]?] | length)"
    ' "/work/$file" | while read -r sev n; do
    case $sev in
      CRITICAL)   c=$RED;;
      HIGH)       c=$MAGENTA;;
      MEDIUM)     c=$YELLOW;;
      LOW)        c=$CYAN;;
      SUPPRESSED) c=$GREEN;;
      *)          c=$RESET;;
    esac
    printf '    %s%-10s %4s%s\n' "$c" "$sev" "$n" "$RESET"
  done
}

printf '%s Trivy VEX demo — %s %s\n' "$BOLD" "$IMAGE" "$RESET"

step 1 "Preflight: docker available?"
docker info --format '{{.ServerVersion}} ({{.OSType}}/{{.Architecture}})'
ok "docker is up"
pause

step 2 "Build toolchain image (trivy + vexctl + Docker Scout)"
docker build -t vex-toolchain:latest toolchain/
docker run --rm vex-toolchain:latest trivy --version | head -1
docker run --rm vex-toolchain:latest vexctl version 2>&1 | grep GitVersion
if docker run --rm "${SOCK[@]}" vex-toolchain:latest docker scout version >/dev/null 2>&1; then
  ok "Docker Scout plugin verified in toolchain container"
else
  printf '%s[NOTE] docker scout not found in toolchain container — rebuild: docker build -t vex-toolchain:latest toolchain/%s\n' "$YELLOW" "$RESET"
fi
ok "vex-toolchain:latest built"
# Check containerd image store — required for Scout attestations (steps 9-11).
# If not active those steps are skipped automatically; all other steps continue.
printf '  Checking containerd image store... '
if docker info 2>/dev/null | grep -qE "io\.containerd\.snapshotter|containerd.?snapshotter.*true"; then
  CONTAINERD_ACTIVE=1
  printf '%sactive%s\n' "$GREEN" "$RESET"
else
  CONTAINERD_ACTIVE=0
  printf '%snot detected — Scout attestation steps (9-11) will be skipped%s\n' "$YELLOW" "$RESET"
fi
pause

step 3 "Pull base image and show digest"
docker pull "$IMAGE"
docker image inspect "$IMAGE" --format '{{index .RepoDigests 0}}'
ok "image pulled"
pause

step 4 "Baseline scan -> baseline-report.json / baseline-summary.txt"
docker run --rm "${SOCK[@]}" "${CACHE[@]}" "${WORK[@]}" vex-toolchain:latest \
  trivy image --quiet --format json --output /work/baseline-report.json "$IMAGE"
docker run --rm "${SOCK[@]}" "${CACHE[@]}" "${WORK[@]}" vex-toolchain:latest \
  trivy image --quiet --skip-db-update --format table --output /work/baseline-summary.txt "$IMAGE"
show_results baseline-report.json "Baseline results"
ok "baseline saved"
pause

step 5 "Generate OpenVEX statements — pkg:oci (Trivy/Wiz) + pkg:docker (Scout)"
# Detect the digest of the currently-pulled image so the pkg:oci PURL in the
# VEX statements matches what Trivy will see when it scans the same image.
# RepoDigests[0] = docker.io/pingidentity/pingaccess@sha256:...; strip the prefix.
OCI_DIGEST=$(docker image inspect "$IMAGE" --format '{{index .RepoDigests 0}}' 2>/dev/null | sed 's/.*@//')
if [ -z "$OCI_DIGEST" ]; then
  printf '%s[WARN] Could not detect image digest — generate-vex.sh will use its hardcoded fallback%s\n' "$YELLOW" "$RESET"
else
  printf '  Image digest: %s\n' "$OCI_DIGEST"
fi
docker run --rm -e "PRODUCT_OCI_DIGEST=${OCI_DIGEST}" -e "PRODUCT_DOCKER_HUB=${HUB_PRODUCT}" "${WORK[@]}" vex-toolchain:latest \
  sh -c "tr -d '\r' < /work/scripts/generate-vex.sh > /tmp/g.sh && sh /tmp/g.sh" | tail -8
ok "vex/statements/*.openvex.json                (Trivy/Wiz, pkg:oci)"
ok "vex/statements-scout/*.vex.json             (Scout / Docker Hub pingidentity, pkg:docker)"
ok "vex/statements-scout-local/*.vex.json        (Scout / localhost:5000, pkg:docker)"
ok "vex/statements-scout-darkedges/*.vex.json    (Scout / Docker Hub ${HUB_IMAGE}, pkg:docker)"
pause

step 6 "Assemble VEX repository (spec v0.1 archive)"
mkdir -p vex-repo-src/pkg/oci/pingaccess vex-repo/v0.1
cp vex/pingaccess-8.3.4-edge.openvex.json vex-repo-src/pkg/oci/pingaccess/vex.json
docker run --rm "${WORK[@]}" vex-toolchain:latest \
  sh -c "cd /work/vex-repo-src && tar -czf /work/vex-repo/v0.1/vex-data.tar.gz index.json pkg && tar -tzf /work/vex-repo/v0.1/vex-data.tar.gz"
ok "vex-repo/v0.1/vex-data.tar.gz rebuilt"
pause

step 7 "Serve repository (nginx on docker network 'vexnet')"
docker network create vexnet 2>/dev/null || true
docker rm -f vex-server >/dev/null 2>&1 || true
docker run -d --name vex-server --network vexnet \
  -v "$SCRIPT_DIR/vex-repo:/usr/share/nginx/html:ro" nginx:alpine >/dev/null
docker run --rm --network vexnet vex-toolchain:latest \
  sh -c "curl -fsS http://vex-server/.well-known/vex-repository.json | jq -c .versions[0]"
ok "vex-server is serving the manifest"
pause

step 8 "Register repo in Trivy and download it"
docker run --rm --network vexnet "${CACHE[@]}" "${CONF[@]}" vex-toolchain:latest \
  sh -c "trivy vex repo list && trivy clean --vex-repo >/dev/null 2>&1 && trivy vex repo download"
ok "trivy resolved the repository"
pause

step 9 "Scout Phase 5a — preflight: check original image for attestations (mutex rule)"
if [ "$CONTAINERD_ACTIVE" = "0" ]; then
  printf '%sSkipped — containerd image store not active.%s\n' "$YELLOW" "$RESET"
elif ! command -v docker >/dev/null || ! docker scout version >/dev/null 2>&1; then
  printf '%s[NOTE] docker scout not found on this host. Install: https://docs.docker.com/scout/install/%s\n' "$YELLOW" "$RESET"
else
  # Mutex rule (Gotcha 5 + 10): if the image has ANY attestation (provenance, SBOM),
  # Scout ignores ALL external VEX sources — both --vex-location files and filesystem-
  # embedded VEX — and reads only attestation-based VEX.
  # pingidentity/pingaccess:8.3.4-edge has NO attestations (confirmed via
  # docker scout attestation list), so the mutex rule is not triggered here.
  # Suppression via --vex-location still does not work for this image due to
  # Scout <=1.20.0 behaviour (Gotcha 11). The attestation path (Steps 10-11) is
  # the only confirmed working Scout suppression mechanism.
  printf '  Checking %s for attestations...\n' "$IMAGE"
  ORIG_ATTEST=$(docker scout attestation list "$IMAGE" 2>&1) || true
  echo "$ORIG_ATTEST" | grep -iE "SBOM|Provenance|openvex|predicate|No attestation" | sed 's/^/  /' || true
  if echo "$ORIG_ATTEST" | grep -iE "SBOM|Provenance|openvex|predicate" >/dev/null; then
    printf '%s[NOTE] Mutex rule active: original image has attestations.%s\n' "$YELLOW" "$RESET"
    printf '%s       --vex-location is ignored by Scout when attestations are present.%s\n' "$YELLOW" "$RESET"
    printf '%s       Suppression will be demonstrated via the attestation path in Steps 10-11.%s\n' "$YELLOW" "$RESET"
  else
    printf '%s  No attestations on original image — --vex-location would apply.%s\n' "$GREEN" "$RESET"
    printf '  (Skipping dry-run scan; suppression proof is in Steps 10-11.)\n'
  fi
fi
pause

step 10 "Scout Phase 5b — build with provenance+SBOM, then attach VEX attestation"
if [ "$CONTAINERD_ACTIVE" = "0" ]; then
  printf '%sSkipped — containerd image store not active.%s\n' "$YELLOW" "$RESET"
else
  SCOUT_REG="localhost:5000"
  SCOUT_IMAGE="${SCOUT_REG}/pingidentity/pingaccess:8.3.4-edge"
  docker rm -f vex-registry >/dev/null 2>&1 || true
  docker run -d -p 5000:5000 --name vex-registry registry:2 >/dev/null
  ok "local registry:2 started on port 5000"

  # Build a minimal derived image with provenance+SBOM attestations.
  # Per https://docs.docker.com/scout/how-tos/create-exceptions-vex/#attestation
  # this creates the OCI manifest-list structure that docker scout attestation add
  # requires before it can attach VEX alongside provenance and SBOM.
  # embed/Dockerfile-scout is a bare FROM — no filesystem VEX, which would trigger
  # the attestation-vs-filesystem mutex rule and cause Scout to ignore the VEX.
  printf '  Building %s with --provenance=true --sbom=true...\n' "$SCOUT_IMAGE"
  docker build \
    --provenance=true \
    --sbom=true \
    --tag "$SCOUT_IMAGE" \
    --push \
    -f embed/Dockerfile-scout .
  ok "pushed $SCOUT_IMAGE with provenance+SBOM attestations"
  # Inspect manifest structure — must be an OCI Image Index (manifest list) for
  # docker scout attestation add to attach alongside provenance+SBOM.
  printf '  Manifest structure:\n'
  docker buildx imagetools inspect "$SCOUT_IMAGE" --raw 2>/dev/null \
    | jq -r '.manifests[]? | "    \(.mediaType)  \(.digest)"' 2>/dev/null \
    || printf '  (jq not available — run: docker buildx imagetools inspect %s)\n' "$SCOUT_IMAGE"

  # Attach VEX as a third attestation alongside provenance and SBOM.
  # Use the localhost:5000 PURL variants — Scout resolves the full registry
  # hostname when matching VEX statements, so Docker Hub PURLs won't match.
  ATTACHED=0
  TOTAL=$(ls "$SCRIPT_DIR"/vex/statements-scout-local/*.vex.json 2>/dev/null | wc -l | tr -d ' ')
  for VEX_FILE in "$SCRIPT_DIR"/vex/statements-scout-local/*.vex.json; do
    CVE=$(basename "$VEX_FILE" .vex.json)
    printf '  attaching %s... ' "$CVE"
    if docker scout attestation add \
        --file "$VEX_FILE" \
        --predicate-type https://openvex.dev/ns/v0.2.0 \
        "$SCOUT_IMAGE" 2>/dev/null; then
      printf '%s✔%s\n' "$GREEN" "$RESET"
      ATTACHED=$((ATTACHED + 1))
    else
      printf '%sFAILED%s\n' "$YELLOW" "$RESET"
    fi
  done
  printf '  %s / %s attestations attached\n' "$ATTACHED" "$TOTAL"

  # Probe the OCI Image Index directly for attestation manifests.
  # Docker Scout attestations are stored as additional manifests inside the Image
  # Index annotated with vnd.docker.reference.type: attestation-manifest. They are
  # NOT stored via the OCI Referrers API (/referrers/); registry:2 returns 404 for
  # that endpoint because Scout uses the Image Index model, not the Referrers model.
  printf '  Probing OCI Image Index for attestation manifests...\n'
  REFERRERS_FOUND_VIA_API=0
  REFERRERS_VEX_COUNT=0
  INDEX_JSON=$(curl -sSL \
    -H 'Accept: application/vnd.oci.image.index.v1+json' \
    "http://localhost:5000/v2/pingidentity/pingaccess/manifests/8.3.4-edge" \
    2>/dev/null) || true
  if echo "$INDEX_JSON" | jq -e '.manifests' >/dev/null 2>&1; then
    TOTAL_MANIFESTS=$(echo "$INDEX_JSON" | jq '.manifests | length' 2>/dev/null || echo 0)
    REFERRERS_VEX_COUNT=$(echo "$INDEX_JSON" | \
      jq '[.manifests[]? | select(.annotations."vnd.docker.reference.type" == "attestation-manifest")] | length' \
      2>/dev/null || echo 0)
    printf '  Image Index: %s manifest(s), %s attestation(s)\n' "$TOTAL_MANIFESTS" "$REFERRERS_VEX_COUNT"
    echo "$INDEX_JSON" | \
      jq -r '.manifests[]? | "    \(.mediaType // "?")  \(.annotations."vnd.docker.reference.type" // "image")  \(.digest[0:19])..."' \
      2>/dev/null || true
    if [ "${REFERRERS_VEX_COUNT:-0}" -gt 0 ]; then
      REFERRERS_FOUND_VIA_API=1
    fi
  else
    printf '  (could not read Image Index — registry may not have the image yet)\n'
  fi

  # docker scout attestation list: on Linux/WSL correctly resolves the OCI Image
  # Index and finds attestations; on Windows Docker Desktop it resolves to the
  # platform manifest (different digest) and shows "No attestations found".
  printf '  docker scout attestation list (authoritative on Linux/WSL)...\n'
  ATTEST_CHECK=$(docker scout attestation list "$SCOUT_IMAGE" 2>&1)
  echo "$ATTEST_CHECK" | grep -iE "openvex|predicate|SBOM obtained|Provenance obtained|No attestation" | sed 's/^/  /' || true
  SCOUT_FOUND_ATTEST=0
  if echo "$ATTEST_CHECK" | grep -iE "openvex|predicate|SBOM obtained" >/dev/null; then
    SCOUT_FOUND_ATTEST=1
  fi

  if [ "$REFERRERS_FOUND_VIA_API" = "1" ] || [ "$SCOUT_FOUND_ATTEST" = "1" ]; then
    ok "Scout attestations confirmed (${REFERRERS_VEX_COUNT} attestation manifest(s) in Image Index)"
    if [ "$SCOUT_FOUND_ATTEST" = "0" ]; then
      printf '%s  [INFO] docker scout attestation list shows none — Windows Docker resolves to platform%s\n' "$YELLOW" "$RESET"
      printf '%s         manifest, not OCI Image Index. Verify in WSL: docker scout attestation list %s%s\n' "$YELLOW" "$SCOUT_IMAGE" "$RESET"
    fi
  else
    printf '%s[NOTE] No attestations found in registry — step 11 will use --vex-location fallback.%s\n' "$YELLOW" "$RESET"
  fi
fi
pause

step 11 "Scout Phase 5c — re-scan to prove Scout suppression"
if [ "$CONTAINERD_ACTIVE" = "0" ]; then
  printf '%sSkipped — containerd image store not active.%s\n' "$YELLOW" "$RESET"
else
  ATTEST_OUT=$(docker scout attestation list "$SCOUT_IMAGE" 2>&1)
  if echo "$ATTEST_OUT" | grep -iE "openvex|predicate" >/dev/null; then
    printf '%s  OpenVEX attestations confirmed — scanning without --vex-location (attestation path).%s\n' "$GREEN" "$RESET"
    docker scout cves "$SCOUT_IMAGE" 2>&1 | tee "$SCRIPT_DIR/scout-suppressed-report.txt" || true
  else
    printf '%s  No attestations found on registry — using --vex-location with localhost:5000 PURL files.%s\n' "$YELLOW" "$RESET"
    printf '%s  This proves Scout respects the correct PURL form; for production use a registry with OCI referrers.%s\n' "$YELLOW" "$RESET"
    docker scout cves "$SCOUT_IMAGE" --vex-location "$SCRIPT_DIR/vex/pingaccess-scout-local.vex.json" 2>&1 \
      | tee "$SCRIPT_DIR/scout-suppressed-report.txt" || true
  fi
  ok "scout-suppressed-report.txt saved"
  REMAINING=$(grep -c "^\s*CVE-" "$SCRIPT_DIR/scout-suppressed-report.txt" 2>/dev/null || echo 0)
  printf '  Remaining CVEs: %s\n' "$REMAINING"
  printf '%s  Note: CVE-2026-* entries are new post-baseline discoveries with no VEX statements — expected to remain.%s\n' "$YELLOW" "$RESET"
fi
pause

step 12 "Scout Phase 5d — attach VEX attestations to Docker Hub image (optional)"
# Attaches the Phase 3d VEX set (pkg:docker/<org>/... PURL) to the Docker Hub image
# so scout.docker.com indexes the suppression. Requires HUB_IMAGE to be published on
# Docker Hub; skips gracefully if not accessible or statements not yet generated.
VEX_HUB_FILE="$SCRIPT_DIR/vex/pingaccess-scout-darkedges.vex.json"
printf '  Target : %s\n' "$HUB_IMAGE"
printf '  Product: %s\n' "$HUB_PRODUCT"
if [ ! -f "$VEX_HUB_FILE" ]; then
  printf '%s  [SKIP] %s not found — re-run Step 5 first.%s\n' "$YELLOW" "$VEX_HUB_FILE" "$RESET"
elif docker scout attestation add \
    --file "$VEX_HUB_FILE" \
    --predicate-type https://openvex.dev/ns/v0.2.0 \
    "$HUB_IMAGE" 2>&1; then
  ok "$HUB_IMAGE — consolidated VEX attestation attached"
  printf '  scout.docker.com will re-index the image within a few minutes.\n'
  printf '  To verify: docker scout cves %s\n' "$HUB_IMAGE"
else
  printf '%s  [SKIP] Attestation add failed — is %s published on Docker Hub and logged in?%s\n' "$YELLOW" "$HUB_IMAGE" "$RESET"
  printf '  Publish: docker tag %s %s && docker push %s\n' "$IMAGE" "$HUB_IMAGE" "$HUB_IMAGE"
fi
pause

step 13 "Build derived image with embedded VEX (filesystem fallback — see README)"
# IMPORTANT: mutual-exclusivity rule — if the image has ANY attestation (including
# provenance auto-added by BuildKit), Scout ignores filesystem VEX entirely and reads
# only attestations. To use filesystem embed, build with --provenance=false --sbom=false.
docker build -f embed/Dockerfile -t "$DERIVED" . >/dev/null
docker image inspect "$DERIVED" --format 'RepoDigests={{json .RepoDigests}} (empty = local-only, expected)'
ok "$DERIVED built (--provenance/--sbom not passed, so no attestations added)"
pause

step 14 "Trivy suppression proof on the digest-pinned ORIGINAL image"
docker run --rm "${SOCK[@]}" "${CACHE[@]}" "${WORK[@]}" vex-toolchain:latest \
  trivy image --quiet --skip-db-update --format json --show-suppressed \
  --vex /work/vex/pingaccess-8.3.4-edge.openvex.json \
  --output /work/suppressed-report.json "$IMAGE"
docker run --rm "${SOCK[@]}" "${CACHE[@]}" "${WORK[@]}" vex-toolchain:latest \
  trivy image --quiet --skip-db-update --format table --show-suppressed \
  --vex /work/vex/pingaccess-8.3.4-edge.openvex.json \
  --output /work/suppressed-summary.txt "$IMAGE"
docker run --rm --network vexnet "${SOCK[@]}" "${CACHE[@]}" "${CONF[@]}" "${WORK[@]}" vex-toolchain:latest \
  trivy image --quiet --skip-db-update --format json --show-suppressed --vex repo \
  --output /work/rescan-original-repo.json "$IMAGE"
show_results suppressed-report.json "a) --vex file (original image)"
show_results rescan-original-repo.json "b) --vex repo (original image)"
ok "expected: 0 remaining findings, 70 suppressed for both"
pause

step 15 "Trivy re-scan of the DERIVED image three ways (expected: no suppression)"
docker run --rm "${SOCK[@]}" "${CACHE[@]}" "${WORK[@]}" vex-toolchain:latest \
  trivy image --quiet --skip-db-update --format json --show-suppressed \
  --vex /work/vex/pingaccess-8.3.4-edge.openvex.json \
  --output /work/rescan-a-local-vex.json "$DERIVED"
docker run --rm --network vexnet "${SOCK[@]}" "${CACHE[@]}" "${CONF[@]}" "${WORK[@]}" vex-toolchain:latest \
  trivy image --quiet --skip-db-update --format json --show-suppressed --vex repo \
  --output /work/rescan-b-repo.json "$DERIVED"
docker run --rm "${SOCK[@]}" "${CACHE[@]}" "${WORK[@]}" vex-toolchain:latest \
  trivy image --quiet --skip-db-update --format json --show-suppressed \
  --output /work/rescan-c-embedded-only.json "$DERIVED"
show_results rescan-a-local-vex.json "a) --vex file (derived image)"
show_results rescan-b-repo.json "b) --vex repo (derived image)"
show_results rescan-c-embedded-only.json "c) embedded VEX only (derived image)"
printf '%sNo suppression: VEX binds to the base digest; local derived images have none,\nand Trivy does not read in-image VEX files.%s\n' "$YELLOW" "$RESET"
pause

step 16 "Summary"
printf '%s%s\n' "$BOLD" "----------------------------------------------"
printf 'baseline     : %s\n' "$(counts baseline-report.json)"
printf 'trivy --vex  : %s\n' "$(counts suppressed-report.json)"
printf 'trivy repo   : %s\n' "$(counts rescan-original-repo.json)"
printf 'scout attest : see scout-suppressed-report.txt (Step 11)\n'
printf '%s%s\n' "----------------------------------------------" "$RESET"
ok "details: comparison.txt, README.md, wiz-integration.md"

if [ "$NO_PAUSE" != "-y" ]; then
  printf '%sTear down vex-server, vex-registry + vexnet now? [y/N] %s' "$YELLOW" "$RESET"
  read -r ANSWER
  if [ "${ANSWER:-n}" = "y" ] || [ "${ANSWER:-n}" = "Y" ]; then
    docker rm -f vex-server vex-registry >/dev/null 2>&1 || true
    docker network rm vexnet >/dev/null 2>&1 || true
    ok "torn down"
  else
    printf 'left running — teardown: docker rm -f vex-server vex-registry && docker network rm vexnet\n'
  fi
fi
printf '%sDone.%s\n' "$GREEN" "$RESET"
